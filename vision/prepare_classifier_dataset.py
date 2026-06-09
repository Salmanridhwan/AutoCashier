import gc
import json
import os
import shutil
import time

from PIL import Image
import torch
from ultralytics import YOLOWorld

from product_cropper import (
    DEFAULT_CONFIDENCE,
    DEFAULT_MIN_AREA_RATIO,
    DEFAULT_PADDING_RATIO,
    PRODUCT_DETECTION_CLASSES,
    configure_product_detector,
    crop_product_from_result,
)


IMAGE_EXTENSIONS = (".png", ".jpg", ".jpeg")
MANIFEST_NAME = "_crop_manifest.json"


def _load_manifest(path):
    try:
        with open(path, encoding="utf-8") as file:
            return json.load(file)
    except (FileNotFoundError, json.JSONDecodeError, OSError):
        return {}


def _source_signature(path):
    stat = os.stat(path)
    return {"size": stat.st_size, "mtime_ns": stat.st_mtime_ns}


def _save_cropped_image(image, destination):
    extension = os.path.splitext(destination)[1].lower()
    if extension in (".jpg", ".jpeg"):
        image.save(destination, format="JPEG", quality=95)
    elif extension == ".png":
        image.save(destination, format="PNG")
    else:
        image.save(destination)


def prepare_runtime_classifier_dataset(
    source_dir="dataset/products",
    output_dir="dataset/products_classifier",
    model_path="yolov8s-world.pt",
    confidence=DEFAULT_CONFIDENCE,
    padding_ratio=DEFAULT_PADDING_RATIO,
    min_area_ratio=DEFAULT_MIN_AREA_RATIO,
    batch_size=8,
    use_half=True,
    detector=None,
    progress_callback=None,
):
    """Build a cached classifier dataset using batched YOLO inference when possible."""
    source_dir = os.path.abspath(source_dir)
    output_dir = os.path.abspath(output_dir)
    if source_dir == output_dir:
        raise ValueError("Classifier crop output directory must differ from the raw dataset directory.")
    if not os.path.isdir(source_dir):
        raise FileNotFoundError(f"Raw dataset directory not found: {source_dir}")

    os.makedirs(output_dir, exist_ok=True)
    batch_size = max(1, int(batch_size))
    device = 0 if torch.cuda.is_available() else "cpu"
    use_half = bool(use_half and torch.cuda.is_available())
    manifest_path = os.path.join(output_dir, MANIFEST_NAME)
    previous_manifest = _load_manifest(manifest_path)
    config = {
        "implementation": "batched_yolo_crop_v1",
        "model_path": os.path.abspath(model_path),
        "classes": list(PRODUCT_DETECTION_CLASSES),
        "confidence": confidence,
        "padding_ratio": padding_ratio,
        "min_area_ratio": min_area_ratio,
        "accelerator": "cuda" if torch.cuda.is_available() else "cpu",
        "half": use_half,
    }
    can_reuse = previous_manifest.get("config") == config
    previous_files = previous_manifest.get("files", {}) if can_reuse else {}

    source_files = []
    for class_name in sorted(os.listdir(source_dir)):
        class_dir = os.path.join(source_dir, class_name)
        if not os.path.isdir(class_dir):
            continue
        for filename in sorted(os.listdir(class_dir)):
            if filename.lower().endswith(IMAGE_EXTENSIONS):
                source_files.append(os.path.join(class_dir, filename))

    files_manifest = {}
    stats = {
        "total_images": len(source_files),
        "processed_images": 0,
        "cached_images": 0,
        "detected_crops": 0,
        "full_frame_fallbacks": 0,
        "detection_rate": 0.0,
        "accelerator": config["accelerator"],
        "batch_size": batch_size,
        "half": use_half,
        "duration_seconds": 0.0,
        "images_per_second": 0.0,
        "gpu_peak_allocated_mb": 0.0,
        "orphan_outputs_removed": 0,
    }

    pending = []
    for source_path in source_files:
        relative_path = os.path.relpath(source_path, source_dir).replace("\\", "/")
        destination = os.path.join(output_dir, *relative_path.split("/"))
        signature = _source_signature(source_path)
        previous_entry = previous_files.get(relative_path)

        if previous_entry and previous_entry.get("source_signature") == signature and os.path.exists(destination):
            files_manifest[relative_path] = previous_entry
            stats["cached_images"] += 1
            if previous_entry.get("crop", {}).get("detected"):
                stats["detected_crops"] += 1
            else:
                stats["full_frame_fallbacks"] += 1
            continue

        pending.append((source_path, relative_path, destination, signature))

    owns_detector = detector is None
    started_at = time.perf_counter()
    if pending:
        if detector is None:
            detector = configure_product_detector(YOLOWorld(model_path))
        if torch.cuda.is_available():
            torch.cuda.reset_peak_memory_stats()

        for offset in range(0, len(pending), batch_size):
            batch_items = pending[offset:offset + batch_size]
            images = []
            try:
                for source_path, _relative_path, _destination, _signature in batch_items:
                    with Image.open(source_path) as source_image:
                        images.append(source_image.convert("RGB"))

                with torch.inference_mode():
                    results = detector.predict(
                        source=images,
                        conf=confidence,
                        verbose=False,
                        device=device,
                        half=use_half,
                        batch=batch_size,
                    )

                for item, image, result in zip(batch_items, images, results):
                    _source_path, relative_path, destination, signature = item
                    os.makedirs(os.path.dirname(destination), exist_ok=True)
                    crop, crop_metadata = crop_product_from_result(
                        image,
                        result,
                        padding_ratio=padding_ratio,
                        min_area_ratio=min_area_ratio,
                    )
                    if crop_metadata["detected"]:
                        _save_cropped_image(crop, destination)
                        stats["detected_crops"] += 1
                    else:
                        shutil.copy2(_source_path, destination)
                        stats["full_frame_fallbacks"] += 1

                    files_manifest[relative_path] = {
                        "source_signature": signature,
                        "crop": crop_metadata,
                    }
                    stats["processed_images"] += 1
            finally:
                for image in images:
                    image.close()

            completed = min(offset + len(batch_items), len(pending))
            if completed % 100 < batch_size or completed == len(pending):
                message = (
                    f"Runtime crop prep: {completed}/{len(pending)} new images, "
                    f"cached={stats['cached_images']}, detected={stats['detected_crops']}, "
                    f"fallback={stats['full_frame_fallbacks']}, "
                    f"device={stats['accelerator']}, batch={batch_size}"
                )
                if progress_callback:
                    progress_callback(message)
                else:
                    print(message)

    stats["duration_seconds"] = round(time.perf_counter() - started_at, 3)
    stats["images_per_second"] = round(
        stats["processed_images"] / max(stats["duration_seconds"], 0.001),
        2,
    )
    if torch.cuda.is_available() and pending:
        stats["gpu_peak_allocated_mb"] = round(torch.cuda.max_memory_allocated(0) / (1024 ** 2), 1)

    valid_output_paths = {
        os.path.abspath(os.path.join(output_dir, *relative_path.split("/")))
        for relative_path in files_manifest
    }
    for current_dir, _dirs, filenames in os.walk(output_dir):
        for filename in filenames:
            if not filename.lower().endswith(IMAGE_EXTENSIONS):
                continue
            output_path = os.path.abspath(os.path.join(current_dir, filename))
            if output_path.startswith(output_dir + os.sep) and output_path not in valid_output_paths:
                os.remove(output_path)
                stats["orphan_outputs_removed"] += 1

    for current_dir, _dirs, _files in os.walk(output_dir, topdown=False):
        if current_dir != output_dir and not os.listdir(current_dir):
            os.rmdir(current_dir)

    stats["detection_rate"] = stats["detected_crops"] / max(1, stats["total_images"])
    manifest = {
        "strategy": "runtime_yolo_crop_with_full_frame_fallback",
        "source_dir": source_dir,
        "output_dir": output_dir,
        "config": config,
        "stats": stats,
        "files": files_manifest,
    }
    with open(manifest_path, "w", encoding="utf-8") as file:
        json.dump(manifest, file, indent=2)

    if owns_detector:
        del detector
    gc.collect()
    if torch.cuda.is_available():
        torch.cuda.empty_cache()

    print(
        "Runtime classifier dataset ready: "
        f"total={stats['total_images']}, processed={stats['processed_images']}, "
        f"cached={stats['cached_images']}, detected_crops={stats['detected_crops']}, "
        f"fallbacks={stats['full_frame_fallbacks']}, detection_rate={stats['detection_rate']:.3f}, "
        f"device={stats['accelerator']}, batch={batch_size}, "
        f"throughput={stats['images_per_second']:.2f} img/s, "
        f"orphans_removed={stats['orphan_outputs_removed']}"
    )
    return manifest


if __name__ == "__main__":
    prepare_runtime_classifier_dataset()
