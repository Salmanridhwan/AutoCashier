import os
import io
import sys
import json
import gc
import hashlib
import shutil
import threading
import subprocess
import time
import urllib.request
import traceback
from concurrent.futures import ThreadPoolExecutor, as_completed
from contextlib import asynccontextmanager
from pydantic import BaseModel
from PIL import Image
from dotenv import load_dotenv
from fastapi import FastAPI, File, UploadFile, Form, BackgroundTasks, status
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from ultralytics import YOLOWorld
import torch

# Load environment variables
load_dotenv()

# Import local utilities
from resnet50_product_classifier import ResNet50ProductClassifier
from ocr_verifier import OCRVerifier
from product_repository import ProductRepository
from product_cropper import configure_product_detector, crop_product_for_classifier
from multi_crop_consensus import classify_with_multi_crop_consensus
from prepare_classifier_dataset import prepare_runtime_classifier_dataset
from scanner_decision import SIMILAR_CLASSES, decide_scan
from evaluate_end_to_end import evaluate_end_to_end

# Global variables to store loaded models (Degraded Mode support)
yolo_model = None
resnet_classifier = None
ocr_verifier = None
product_repo = None


def cuda_status_detail():
    if not torch.cuda.is_available():
        return {
            "available": False,
            "device": None,
            "allocated_mb": 0,
            "reserved_mb": 0,
            "total_mb": 0,
        }

    props = torch.cuda.get_device_properties(0)
    return {
        "available": True,
        "device": torch.cuda.get_device_name(0),
        "allocated_mb": round(torch.cuda.memory_allocated(0) / (1024 ** 2), 1),
        "reserved_mb": round(torch.cuda.memory_reserved(0) / (1024 ** 2), 1),
        "total_mb": round(props.total_memory / (1024 ** 2), 1),
    }


def release_gpu_models_for_training():
    global yolo_model, resnet_classifier, ocr_verifier

    print("[TRAIN] Releasing GPU serving models before training...")
    yolo_model = None
    resnet_classifier = None
    ocr_verifier = None
    gc.collect()
    if torch.cuda.is_available():
        torch.cuda.empty_cache()
        try:
            torch.cuda.ipc_collect()
        except Exception:
            pass
    print(f"[TRAIN] CUDA after release: {cuda_status_detail()}")

def load_models():
    global yolo_model, resnet_classifier, ocr_verifier, product_repo

    print("[STARTUP] Initializing models and repositories...")

    # 1. Load Supabase Product Repository
    try:
        product_repo = ProductRepository()
    except Exception as e:
        print(f"[STARTUP] ❌ Failed to load ProductRepository: {e}")

    # 2. Load YOLO-World
    try:
        print("[STARTUP] Loading YOLO-World model...")
        yolo_model = configure_product_detector(YOLOWorld("yolov8s-world.pt"))
        print("[STARTUP] YOLO-World loaded successfully.")
    except Exception as e:
        print(f"[STARTUP] ❌ Failed to load YOLO-World model: {e}")

    # 3. Load ResNet-50 Classifier
    try:
        model_dir = os.environ.get("MODEL_DIR", "models/resnet50-product-classifier")
        resnet_classifier = ResNet50ProductClassifier(model_dir)
        print("[STARTUP] ResNet-50 Classifier loaded successfully.")
    except Exception as e:
        print(f"[STARTUP] ❌ Failed to load ResNet-50 Classifier: {e}")

    # 4. Load EasyOCR Verifier
    try:
        ocr_verifier = OCRVerifier()
        print("[STARTUP] EasyOCR Verifier loaded successfully.")
    except Exception as e:
        print(f"[STARTUP] ❌ Failed to load EasyOCR Verifier: {e}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    load_models()
    yield


app = FastAPI(
    title="AutoCashier Vision Server",
    description="Vision server integrating YOLO-World object detection & cropping, ResNet-50 classification, and EasyOCR verification.",
    version="2.0.0",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def log_scan_to_supabase(
    product_id: str,
    predicted_class: str,
    confidence: float,
    gap: float,
    decision: str,
    ocr_text: str,
    ocr_score: float,
    image_url: str = None,
    source: str = "detect-v2"
):
    """
    Asynchronously write scan logs to Supabase table `product_scan_logs`
    """
    if not product_repo or not product_repo.client:
        return
        
    try:
        data = {
            "product_id": product_id,
            "predicted_class": predicted_class,
            "confidence": float(confidence),
            "gap": float(gap),
            "decision": decision,
            "ocr_text": ocr_text,
            "ocr_score": float(ocr_score) if ocr_score is not None else 0.0,
            "image_url": image_url,
            "source": source
        }
        try:
            product_repo.client.table("product_scan_logs").insert(data).execute()
            print(f"[LOG] Logged scan to Supabase for class '{predicted_class}' with decision: {decision}")
        except Exception as insert_err:
            err_msg = str(insert_err)
            if "source" in err_msg or "PGRST204" in err_msg:
                print(f"[LOG] ⚠️ 'source' column not found in schema cache. Retrying without 'source' column...")
                data.pop("source", None)
                product_repo.client.table("product_scan_logs").insert(data).execute()
                print(f"[LOG] Logged scan to Supabase (without source) for class '{predicted_class}' with decision: {decision}")
            else:
                raise insert_err
    except Exception as e:
        print(f"[LOG] ❌ Failed to write log to Supabase: {e}")


@app.get("/health")
def health():
    """
    Health check endpoint reporting models and connection state
    """
    health_status = {
        "status": "ok",
        "vision_server": "online",
        "yolo_world": "loaded" if yolo_model is not None else "offline",
        "resnet50": "loaded" if resnet_classifier is not None else "offline",
        "easyocr": "loaded" if ocr_verifier is not None else "offline",
        "supabase": "connected" if (product_repo and product_repo.client) else "disconnected",
        "cuda": cuda_status_detail(),
    }
    
    # If any core model is missing, report degraded status
    if not yolo_model or not resnet_classifier or not ocr_verifier or not product_repo or not product_repo.client:
        health_status["status"] = "degraded"
        health_status["message"] = "Some models or Supabase client failed to load. Running in degraded mode."
        
    return health_status


@app.post("/refresh-cache")
def refresh_cache():
    """
    Reload the active-products cache from Supabase so newly added/updated
    products become available without restarting the server.
    """
    if not product_repo or not product_repo.client:
        return JSONResponse(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            content={"success": False, "message": "Supabase product repository not available."}
        )

    product_repo.refresh_cache()
    return {
        "success": True,
        "cached_products": len(product_repo.products_cache)
    }


# ─────────────────────────────────────────────────────────────────────────────
# Admin-triggered dataset build + training (runs locally on this GPU machine)
# ─────────────────────────────────────────────────────────────────────────────
DATASET_DIR = os.path.join("dataset", "products")
MODEL_DIR = os.environ.get("MODEL_DIR", "models/resnet50-product-classifier")

TRAIN_STATUS = {"state": "idle", "message": "", "detail": {}}
_train_lock = threading.Lock()
EVALUATION_STATUS = {"state": "idle", "message": "", "detail": {}}
_evaluation_lock = threading.Lock()

BUILD_STATUS = {"state": "idle", "message": "", "detail": {}}
_build_lock = threading.Lock()

BUILD_LOG: list = []


def _blog(msg):
    print(msg)
    BUILD_LOG.append(str(msg))
    if len(BUILD_LOG) > 500:
        del BUILD_LOG[: len(BUILD_LOG) - 500]


def _extract_video_frames(url, out_dir, prefix="vid", every_sec=0.5, max_frames=40):
    """Download a product video and sample frames into out_dir for training."""
    import cv2
    import tempfile

    tmp = tempfile.NamedTemporaryFile(suffix=".mp4", delete=False)
    tmp.close()
    try:
        urllib.request.urlretrieve(url, tmp.name)
        cap = cv2.VideoCapture(tmp.name)
        fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
        step = max(1, int(fps * every_sec))
        saved = 0
        idx = 0
        while saved < max_frames:
            ok, frame = cap.read()
            if not ok:
                break
            if idx % step == 0:
                cv2.imwrite(os.path.join(out_dir, f"{prefix}_{saved}.jpg"), frame)
                saved += 1
            idx += 1
        cap.release()
        return saved
    finally:
        try:
            os.remove(tmp.name)
        except Exception:
            pass


def _materialize_product_media(url, class_dir, angle, is_video):
    """Download one media source, reusing stable cached outputs when available."""
    media_id = hashlib.sha1(url.encode("utf-8")).hexdigest()[:12]
    if is_video:
        prefix = f"vid_{media_id}"
        existing = sorted(
            name for name in os.listdir(class_dir)
            if name.startswith(f"{prefix}_") and name.lower().endswith(".jpg")
        )
        if existing:
            return {"files": existing, "cached": True}
        saved = _extract_video_frames(url, class_dir, prefix=prefix)
        return {"files": [f"{prefix}_{index}.jpg" for index in range(saved)], "cached": False}

    safe_angle = angle.replace("/", "-").replace("\\", "-")
    ext = os.path.splitext(url.split("?")[0])[1].lower()
    if ext not in (".png", ".jpg", ".jpeg"):
        ext = ".jpg"
    filename = f"{safe_angle}_{media_id}{ext}"
    destination = os.path.join(class_dir, filename)
    if os.path.exists(destination):
        return {"files": [filename], "cached": True}
    urllib.request.urlretrieve(url, destination)
    return {"files": [filename], "cached": False}


def build_dataset_from_supabase(download_workers=6):
    """Synchronize product media using stable filenames and concurrent downloads."""
    if not product_repo or not product_repo.client:
        raise RuntimeError("Supabase client not available")

    started_at = time.perf_counter()
    download_workers = max(1, min(int(download_workers), 12))
    client = product_repo.client
    products = client.table("products").select("id, name, ai_class_name").eq("ai_enabled", True).execute().data
    products = [p for p in products if p.get("ai_class_name")]

    os.makedirs(DATASET_DIR, exist_ok=True)

    # Prune folders of products that no longer exist (keep 'background').
    valid_classes = {p["ai_class_name"].strip() for p in products}
    pruned = []
    for d in os.listdir(DATASET_DIR):
        full = os.path.join(DATASET_DIR, d)
        if os.path.isdir(full) and d != "background" and d not in valid_classes:
            shutil.rmtree(full, ignore_errors=True)
            pruned.append(d)
    if pruned:
        _blog(f"Hapus kelas terhapus: {pruned}")

    counts = {}
    for p in products:
        cls = p["ai_class_name"].strip()
        class_dir = os.path.join(DATASET_DIR, cls)
        if os.path.isdir(class_dir):
            shutil.rmtree(class_dir, ignore_errors=True)
        os.makedirs(class_dir, exist_ok=True)

        images = client.table("product_images").select("image_url, angle").eq("product_id", p["id"]).execute().data
        saved = 0
        for i, img in enumerate(images):
            u = img.get("image_url")
            if not u:
                continue
            angle = (img.get("angle") or "img").replace("/", "-")
            # Video entry → sample many frames; image entry → download as-is
            is_video = angle == "video" or u.split("?")[0].lower().endswith((".mp4", ".mov", ".webm", ".avi", ".mkv"))
            if is_video:
                try:
                    saved += _extract_video_frames(u, class_dir, prefix=f"vid{i}")
                except Exception as e:
                    print(f"[BUILD-DATASET] video frame extraction failed {u}: {e}")
                continue
            ext = os.path.splitext(u.split("?")[0])[1] or ".jpg"
            dest = os.path.join(class_dir, f"{angle}_{i}{ext}")
            try:
                urllib.request.urlretrieve(u, dest)
                saved += 1
            except Exception as e:
                print(f"[BUILD-DATASET] failed {u}: {e}")
        counts[cls] = saved
        _blog(f"{p['name']} -> {cls}: {saved} foto")

    # Pull admin-uploaded background media from Supabase Storage (folder 'background/')
    # into the background class — additive to any locally captured frames.
    bg_dir = os.path.join(DATASET_DIR, "background")
    os.makedirs(bg_dir, exist_ok=True)
    try:
        bucket = client.storage.from_("product-images")
        files = bucket.list("background")
        for f in files:
            name = f.get("name")
            if not name or name == ".emptyFolderPlaceholder":
                continue
            key = f"background/{name}"
            url = bucket.get_public_url(key)
            low = name.lower()
            if low.endswith((".mp4", ".mov", ".webm", ".avi", ".mkv")):
                try:
                    _extract_video_frames(url, bg_dir, prefix=f"bgvid_{os.path.splitext(name)[0]}")
                except Exception as e:
                    print(f"[BUILD-DATASET] background video failed {name}: {e}")
            else:
                dest = os.path.join(bg_dir, f"bg_{name}")
                if not os.path.exists(dest):
                    try:
                        urllib.request.urlretrieve(url, dest)
                    except Exception as e:
                        print(f"[BUILD-DATASET] background image failed {name}: {e}")
    except Exception as e:
        print(f"[BUILD-DATASET] background from storage skipped: {e}")

    if os.path.isdir(bg_dir):
        counts["background"] = len([f for f in os.listdir(bg_dir) if not f.startswith(".")])
        _blog(f"background: {counts['background']} frame")
    return counts


def sync_dataset_from_supabase(download_workers=6):
    """Incrementally synchronize raw media without invalidating unchanged crop cache."""
    if not product_repo or not product_repo.client:
        raise RuntimeError("Supabase client not available")

    started_at = time.perf_counter()
    download_workers = max(1, min(int(download_workers), 12))
    client = product_repo.client
    products = client.table("products").select("id, name, ai_class_name").eq("ai_enabled", True).execute().data
    products = [product for product in products if product.get("ai_class_name")]
    os.makedirs(DATASET_DIR, exist_ok=True)

    valid_classes = {product["ai_class_name"].strip() for product in products}
    for directory in os.listdir(DATASET_DIR):
        full_path = os.path.join(DATASET_DIR, directory)
        if os.path.isdir(full_path) and directory != "background" and directory not in valid_classes:
            shutil.rmtree(full_path, ignore_errors=True)
            _blog(f"Hapus kelas terhapus: {directory}")

    product_ids = [product["id"] for product in products]
    try:
        all_images = (
            client.table("product_images")
            .select("product_id, image_url, angle")
            .in_("product_id", product_ids)
            .execute()
            .data
        ) if product_ids else []
    except Exception as exc:
        _blog(f"Bulk media query gagal, fallback per produk: {exc}")
        all_images = []
        for product in products:
            rows = (
                client.table("product_images")
                .select("product_id, image_url, angle")
                .eq("product_id", product["id"])
                .execute()
                .data
            )
            all_images.extend(rows)

    images_by_product = {}
    for image in all_images:
        images_by_product.setdefault(image.get("product_id"), []).append(image)

    desired_files = {}
    media_tasks = []
    for product in products:
        class_name = product["ai_class_name"].strip()
        class_dir = os.path.join(DATASET_DIR, class_name)
        os.makedirs(class_dir, exist_ok=True)
        desired_files[class_name] = set()
        for image in images_by_product.get(product["id"], []):
            url = image.get("image_url")
            if not url:
                continue
            angle = image.get("angle") or "img"
            is_video = angle == "video" or url.split("?")[0].lower().endswith((".mp4", ".mov", ".webm", ".avi", ".mkv"))
            media_tasks.append((product, class_name, class_dir, url, angle, is_video))

    source_stats = {"total": len(media_tasks), "downloaded": 0, "cached": 0, "failed": 0}
    _blog(f"Sinkronisasi {len(media_tasks)} sumber media dengan {download_workers} worker...")
    with ThreadPoolExecutor(max_workers=download_workers) as executor:
        futures = {
            executor.submit(_materialize_product_media, url, class_dir, angle, is_video): (product, class_name, url)
            for product, class_name, class_dir, url, angle, is_video in media_tasks
        }
        for future in as_completed(futures):
            product, class_name, url = futures[future]
            try:
                result = future.result()
                desired_files[class_name].update(result["files"])
                source_stats["cached" if result["cached"] else "downloaded"] += 1
            except Exception as exc:
                source_stats["failed"] += 1
                _blog(f"Gagal memproses media {product['name']} ({url}): {exc}")

    counts = {}
    for product in products:
        class_name = product["ai_class_name"].strip()
        class_dir = os.path.join(DATASET_DIR, class_name)
        valid_names = desired_files[class_name]
        for filename in os.listdir(class_dir):
            path = os.path.join(class_dir, filename)
            if os.path.isfile(path) and filename not in valid_names:
                os.remove(path)
        counts[class_name] = len(valid_names)
        _blog(f"{product['name']} -> {class_name}: {counts[class_name]} foto")

    bg_dir = os.path.join(DATASET_DIR, "background")
    os.makedirs(bg_dir, exist_ok=True)
    try:
        bucket = client.storage.from_("product-images")
        for file_entry in bucket.list("background"):
            name = file_entry.get("name")
            if not name or name == ".emptyFolderPlaceholder":
                continue
            url = bucket.get_public_url(f"background/{name}")
            low_name = name.lower()
            if low_name.endswith((".mp4", ".mov", ".webm", ".avi", ".mkv")):
                prefix = f"bgvid_{os.path.splitext(name)[0]}"
                if not any(filename.startswith(f"{prefix}_") for filename in os.listdir(bg_dir)):
                    _extract_video_frames(url, bg_dir, prefix=prefix)
            else:
                destination = os.path.join(bg_dir, f"bg_{name}")
                if not os.path.exists(destination):
                    urllib.request.urlretrieve(url, destination)
    except Exception as exc:
        _blog(f"Background dari storage dilewati: {exc}")

    counts["background"] = sum(
        1 for filename in os.listdir(bg_dir)
        if not filename.startswith(".") and os.path.isfile(os.path.join(bg_dir, filename))
    )
    source_stats["duration_seconds"] = round(time.perf_counter() - started_at, 3)
    _blog(f"background: {counts['background']} frame")
    _blog(
        "Sinkronisasi raw selesai: "
        f"download={source_stats['downloaded']}, cache={source_stats['cached']}, "
        f"gagal={source_stats['failed']}, durasi={source_stats['duration_seconds']:.1f}s"
    )
    return counts, source_stats


class BuildDatasetRequest(BaseModel):
    prepare_classifier: bool = True
    download_workers: int = 6
    gpu_batch_size: int = 8
    gpu_half: bool = True


def _build_worker(params: dict):
    global BUILD_STATUS
    try:
        BUILD_LOG.clear()
        _blog("Mulai membangun dataset...")
        BUILD_STATUS = {
            "state": "running",
            "message": "Synchronizing raw dataset...",
            "detail": {"phase": "raw_sync", "params": params},
        }
        counts, raw_stats = sync_dataset_from_supabase(download_workers=params["download_workers"])
        crop_stats = None
        if params.get("prepare_classifier"):
            BUILD_STATUS = {
                "state": "running",
                "message": "Preparing GPU classifier dataset...",
                "detail": {
                    "phase": "gpu_preprocess",
                    "classes": counts,
                    "raw_sync": raw_stats,
                    "cuda": cuda_status_detail(),
                },
            }
            _blog(
                "Mulai preprocessing classifier dengan YOLO crop "
                f"(device={'cuda' if torch.cuda.is_available() else 'cpu'}, "
                f"batch={params['gpu_batch_size']}, half={params['gpu_half']})..."
            )
            crop_manifest = prepare_runtime_classifier_dataset(
                source_dir=DATASET_DIR,
                output_dir=os.path.join("dataset", "products_classifier"),
                model_path="yolov8s-world.pt",
                batch_size=params["gpu_batch_size"],
                use_half=params["gpu_half"],
                detector=yolo_model,
                progress_callback=_blog,
            )
            crop_stats = crop_manifest.get("stats", {})
            _blog(
                "Preprocessing classifier selesai: "
                f"processed={crop_stats.get('processed_images')}, cached={crop_stats.get('cached_images')}, "
                f"device={crop_stats.get('accelerator')}, peak_gpu={crop_stats.get('gpu_peak_allocated_mb')} MB"
            )

        _blog(f"Selesai: {len(counts)} kelas, {int(sum(counts.values()))} foto")
        BUILD_STATUS = {
            "state": "done",
            "message": "Dataset built and classifier cache prepared.",
            "detail": {
                "classes": counts,
                "num_classes": len(counts),
                "total_images": int(sum(counts.values())),
                "has_background": "background" in counts,
                "raw_sync": raw_stats,
                "preprocessing": crop_stats,
                "cuda": cuda_status_detail(),
            },
        }
    except Exception as e:
        traceback.print_exc()
        BUILD_STATUS = {"state": "error", "message": str(e), "detail": {}}
    finally:
        _build_lock.release()


@app.post("/build-dataset")
def build_dataset(params: BuildDatasetRequest = BuildDatasetRequest()):
    if not _build_lock.acquire(blocking=False):
        return JSONResponse(status_code=409, content={"success": False, "message": "Dataset build already in progress."})
    clean_params = {
        "prepare_classifier": params.prepare_classifier,
        "download_workers": max(1, min(int(params.download_workers), 12)),
        "gpu_batch_size": max(1, min(int(params.gpu_batch_size), 32)),
        "gpu_half": bool(params.gpu_half),
    }
    threading.Thread(target=_build_worker, args=(clean_params,), daemon=True).start()
    return {"success": True, "message": "Dataset build started."}


@app.get("/build-status")
def build_status():
    return {**BUILD_STATUS, "log": BUILD_LOG[-80:]}


@app.get("/train-log")
def train_log():
    path = "train_admin_log.txt"
    if not os.path.exists(path):
        return {"log": []}
    try:
        with open(path, encoding="utf-8", errors="ignore") as f:
            lines = f.read().splitlines()
        keywords = ("loss", "eval", "epoch", "Detected", "classes", "Saving",
                    "Training", "accuracy", "Error", "Traceback", "Model", "Final",
                    "CUDA", "GPU", "VRAM", "batch", "workers", "precision",
                    "Split", "source_overlap", "held_out", "crop", "Crop", "Classifier input",
                    "augmentation", "Augmentation", "EVAL", "scanner", "false_accept", "false_reject")
        clean = [l.strip() for l in lines if l.strip() and any(k in l for k in keywords)]
        return {"log": clean[-60:]}
    except Exception as e:
        return {"log": [f"(log read error: {e})"]}


class TrainRequest(BaseModel):
    epochs: int = 20
    batch_size: int = 32
    eval_batch_size: int = 64
    learning_rate: float = 1e-4
    grad_accum: int = 1
    num_workers: int = 2
    prefetch_factor: int = 2
    precision: str = "fp16"
    optim: str = "adamw_torch_fused"
    auto_batch_size: bool = True
    early_stopping_patience: int = 5
    video_aug_repeats: int = 1
    use_classifier_cache: bool = True
    require_cuda: bool = True


def _train_worker(params: dict):
    global resnet_classifier, TRAIN_STATUS
    tmp_dir = os.path.join("models", "_train_tmp")
    try:
        # Free served GPU models from VRAM so training has room (4GB GPU).
        # Scanning returns 503 (model_not_loaded) while training runs.
        TRAIN_STATUS = {
            "state": "running",
            "message": "Training in progress...",
            "detail": {"params": params, "cuda_before_release": cuda_status_detail()},
        }
        release_gpu_models_for_training()
        TRAIN_STATUS["detail"]["cuda_after_release"] = cuda_status_detail()

        if os.path.isdir(tmp_dir):
            shutil.rmtree(tmp_dir, ignore_errors=True)

        classifier_data_dir = os.path.join("dataset", "products_classifier")
        classifier_manifest = os.path.join(classifier_data_dir, "_crop_manifest.json")
        cmd = [
            sys.executable, "train_resnet50_product_classifier.py",
            "--output_dir", tmp_dir,
            "--base_model", "microsoft/resnet-50",
            "--epochs", str(params["epochs"]),
            "--batch_size", str(params["batch_size"]),
            "--eval_batch_size", str(params["eval_batch_size"]),
            "--learning_rate", str(params["learning_rate"]),
            "--grad_accum", str(params["grad_accum"]),
            "--num_workers", str(params["num_workers"]),
            "--prefetch_factor", str(params["prefetch_factor"]),
            "--precision", str(params["precision"]),
            "--optim", str(params["optim"]),
            "--early_stopping_patience", str(params["early_stopping_patience"]),
            "--video_aug_repeats", str(params["video_aug_repeats"]),
        ]
        if params.get("use_classifier_cache") and os.path.exists(classifier_manifest):
            cmd.extend([
                "--data_dir", classifier_data_dir,
                "--skip_runtime_crop_prep",
            ])
        if params.get("auto_batch_size"):
            cmd.append("--auto_batch_size")
        if params.get("require_cuda"):
            cmd.append("--require_cuda")

        with open("train_admin_log.txt", "w", encoding="utf-8") as logf:
            proc = subprocess.run(cmd, stdout=logf, stderr=subprocess.STDOUT)

        if proc.returncode != 0:
            TRAIN_STATUS = {"state": "error", "message": f"Training failed (exit {proc.returncode}). See train_admin_log.txt.", "detail": {}}
        else:
            evaluation_output = os.path.join(tmp_dir, "evaluation_report.json")
            evaluation_cmd = [
                sys.executable,
                "evaluate_end_to_end.py",
                "--model_dir", tmp_dir,
                "--output_path", evaluation_output,
                "--max_images_per_class", "5",
            ]
            with open("train_admin_log.txt", "a", encoding="utf-8") as logf:
                logf.write("\n[EVAL] Running end-to-end evaluation before model deployment...\n")
                evaluation_proc = subprocess.run(evaluation_cmd, stdout=logf, stderr=subprocess.STDOUT)

            if evaluation_proc.returncode != 0:
                TRAIN_STATUS = {
                    "state": "error",
                    "message": "Training succeeded, but end-to-end evaluation failed. Candidate model was not deployed.",
                    "detail": {},
                }
                shutil.rmtree(tmp_dir, ignore_errors=True)
                return

            metrics = {}
            mpath = os.path.join(tmp_dir, "metrics.json")
            if os.path.exists(mpath):
                try:
                    metrics = json.load(open(mpath))
                except Exception:
                    metrics = {}
            try:
                with open(evaluation_output, encoding="utf-8") as file:
                    evaluation_report = json.load(file)
                metrics["end_to_end_evaluation"] = evaluation_report.get("metrics", {})
                metrics["evaluation_samples"] = evaluation_report.get("samples", 0)
            except Exception:
                pass

            active_metrics = {}
            active_metrics_path = os.path.join(MODEL_DIR, "metrics.json")
            if os.path.exists(active_metrics_path):
                try:
                    with open(active_metrics_path, encoding="utf-8") as file:
                        active_metrics = json.load(file)
                except Exception:
                    active_metrics = {}
            candidate_accuracy = float(metrics.get("accuracy") or 0.0)
            active_accuracy = float(active_metrics.get("accuracy") or 0.0)
            if active_accuracy and candidate_accuracy + 0.005 < active_accuracy:
                TRAIN_STATUS = {
                    "state": "error",
                    "message": (
                        "Clean training completed, but candidate validation accuracy "
                        f"{candidate_accuracy:.4f} is below active model {active_accuracy:.4f}. "
                        "Active model was preserved."
                    ),
                    "detail": {
                        **metrics,
                        "candidate_rejected": True,
                        "active_accuracy": active_accuracy,
                    },
                }
                shutil.rmtree(tmp_dir, ignore_errors=True)
                return

            os.makedirs(MODEL_DIR, exist_ok=True)
            for fname in (
                "model.safetensors",
                "config.json",
                "preprocessor_config.json",
                "class_mapping.json",
                "metrics.json",
                "split_manifest.json",
                "runtime_crop_manifest.json",
                "video_augmentation_manifest.json",
                "calibration.json",
                "evaluation_report.json",
            ):
                src = os.path.join(tmp_dir, fname)
                if os.path.exists(src):
                    shutil.copyfile(src, os.path.join(MODEL_DIR, fname))

            TRAIN_STATUS = {
                "state": "done",
                "message": "Training and end-to-end evaluation complete. Model updated.",
                "detail": metrics,
            }

        shutil.rmtree(tmp_dir, ignore_errors=True)
    except Exception as e:
        traceback.print_exc()
        TRAIN_STATUS = {"state": "error", "message": str(e), "detail": {}}
    finally:
        # Reload the (new or existing) models so the server can serve again.
        try:
            load_models()
        except Exception as reload_err:
            print(f"[TRAIN] Could not reload serving models: {reload_err}")
        if product_repo:
            try:
                product_repo.refresh_cache()
            except Exception:
                pass
        _train_lock.release()


@app.post("/train")
def train(req: TrainRequest = TrainRequest()):
    if _evaluation_lock.locked():
        return JSONResponse(status_code=409, content={"success": False, "message": "End-to-end evaluation is still running."})
    if not _train_lock.acquire(blocking=False):
        return JSONResponse(status_code=409, content={"success": False, "message": "Training already in progress."})
    params = req.dict()
    params["video_aug_repeats"] = max(0, min(int(params.get("video_aug_repeats", 0)), 5))
    params["use_classifier_cache"] = bool(params.get("use_classifier_cache", True))
    threading.Thread(target=_train_worker, args=(params,), daemon=True).start()
    return {"success": True, "message": "Training started.", "params": params}


@app.get("/train-status")
def train_status():
    return TRAIN_STATUS


class EvaluationRequest(BaseModel):
    max_images_per_class: int = 5
    include_ocr: bool = True


def _evaluation_worker(params: dict):
    global EVALUATION_STATUS
    try:
        EVALUATION_STATUS = {
            "state": "running",
            "message": "Evaluating admin vs scanner pipeline...",
            "detail": {"progress": 0, "total": 0, "params": params},
        }

        def progress(done, total):
            EVALUATION_STATUS["detail"]["progress"] = done
            EVALUATION_STATUS["detail"]["total"] = total
            print(f"[EVAL] {done}/{total}")

        report = evaluate_end_to_end(
            classifier=resnet_classifier,
            ocr_verifier=ocr_verifier,
            products=product_repo.products_cache.values(),
            model_dir=MODEL_DIR,
            raw_data_dir=DATASET_DIR,
            runtime_data_dir=os.path.join("dataset", "products_classifier"),
            max_images_per_class=params["max_images_per_class"],
            include_ocr=params["include_ocr"],
            progress_callback=progress,
        )
        report_path = os.path.join(MODEL_DIR, "evaluation_report.json")
        with open(report_path, "w", encoding="utf-8") as file:
            json.dump(report, file, indent=2)
        EVALUATION_STATUS = {
            "state": "done",
            "message": "End-to-end evaluation complete.",
            "detail": report,
        }
    except Exception as error:
        traceback.print_exc()
        EVALUATION_STATUS = {"state": "error", "message": str(error), "detail": {}}
    finally:
        _evaluation_lock.release()


@app.post("/evaluate")
def start_evaluation(req: EvaluationRequest = EvaluationRequest()):
    if req.max_images_per_class < 1 or req.max_images_per_class > 40:
        return JSONResponse(status_code=400, content={"success": False, "message": "max_images_per_class must be between 1 and 40."})
    if _train_lock.locked():
        return JSONResponse(status_code=409, content={"success": False, "message": "Training is still running."})
    if not resnet_classifier or not product_repo or not product_repo.products_cache:
        return JSONResponse(status_code=503, content={"success": False, "message": "Models or product cache not available."})
    if req.include_ocr and not ocr_verifier:
        return JSONResponse(status_code=503, content={"success": False, "message": "OCR verifier not available."})
    if not _evaluation_lock.acquire(blocking=False):
        return JSONResponse(status_code=409, content={"success": False, "message": "Evaluation already in progress."})

    params = req.dict()
    threading.Thread(target=_evaluation_worker, args=(params,), daemon=True).start()
    return {"success": True, "message": "End-to-end evaluation started.", "params": params}


@app.get("/evaluation-status")
def evaluation_status():
    return EVALUATION_STATUS


@app.get("/evaluation-report")
def evaluation_report():
    path = os.path.join(MODEL_DIR, "evaluation_report.json")
    if not os.path.exists(path):
        return JSONResponse(status_code=404, content={"success": False, "message": "No evaluation report for the active model."})
    with open(path, encoding="utf-8") as file:
        return json.load(file)


def ocr_cross_check(crop_image):
    """Read text from the crop and find the product whose ocr_keywords match best.
    A strong, unambiguous match can correct a wrong classifier prediction."""
    if not ocr_verifier or not product_repo or not product_repo.products_cache:
        return {
            "passed": False,
            "reason": "ocr_unavailable",
            "ocr_text": "",
            "score": 0.0,
            "second_score": 0.0,
            "score_margin": 0.0,
            "product": None,
            "matched_keywords": [],
        }
    return ocr_verifier.match_products(crop_image, product_repo.products_cache.values())


async def run_detection_pipeline(
    image: Image.Image,
    background_tasks: BackgroundTasks,
    branch_id: str = None,
    camera_id: str = None,
    debug: bool = False
):
    # 2. YOLO-World object detection & cropping
    crop_image = image
    bbox_result = None
    bbox_norm = None  # [x1,y1,x2,y2] normalized 0..1 for frontend overlay
    crop_metadata = {
        "detected": False,
        "fallback_reason": "detector_not_run",
        "confidence": 0.0,
        "area_ratio": 1.0,
    }

    try:
        crop_image, crop_metadata = crop_product_for_classifier(image, yolo_model)
        if crop_metadata["detected"]:
            bbox_result = crop_metadata["bbox"]
            bbox_norm = crop_metadata["bbox_normalized"]
            print(
                f"[DETECTION] Crop successful: bbox={bbox_result} "
                f"confidence={crop_metadata['confidence']:.2f} "
                f"area_ratio={crop_metadata['area_ratio']:.3f}"
            )
        else:
            print("[DETECTION] YOLO found no objects. Using full image as fallback.")
    except Exception as detection_err:
        print(f"[DETECTION] YOLO-World cropping failed: {detection_err}. Falling back to full image.")

    # 3. ResNet-50 Product Classification. If YOLO fails, require a strong,
    # center-biased multi-crop consensus before treating the visual result as trusted.
    ocr_image = crop_image
    consensus_verified = False
    if crop_metadata.get("detected"):
        classification = resnet_classifier.predict(crop_image)
    else:
        ocr_image = image
        fallback = classify_with_multi_crop_consensus(resnet_classifier, image)
        classification = fallback["classification"]
        crop_image = fallback["image"]
        consensus = fallback["consensus"]
        consensus_verified = bool(consensus["verified"])
        crop_metadata["consensus"] = consensus
        crop_metadata["consensus_verified"] = consensus_verified
        if consensus_verified:
            bbox_result = fallback["bbox"]
            bbox_norm = fallback["bbox_normalized"]
            print(
                f"[CONSENSUS] Verified class={consensus['class_name']} "
                f"votes={consensus['votes']}/{consensus['total_crops']} "
                f"confidence={consensus['mean_confidence']:.4f} gap={consensus['mean_gap']:.4f}"
            )
        else:
            print(
                f"[CONSENSUS] Not verified: class={consensus['class_name']} "
                f"votes={consensus['votes']}/{consensus['total_crops']} "
                f"confidence={consensus['mean_confidence']:.4f} gap={consensus['mean_gap']:.4f}"
            )

    predicted_class = classification["class_name"]
    confidence = classification["confidence"]
    gap = classification["gap"]
    
    print(f"[CLASSIFICATION] Predicted: {predicted_class} (confidence={confidence:.4f}, gap={gap:.4f})")

    # 4. OCR cross-check — read package text and, if it clearly & unambiguously
    #    identifies a product, prefer it over the classifier. Fixes confident-but-wrong
    #    predictions when the text is legible (e.g. live "prima" misread as "oreo").
    # OCR may replace the displayed candidate, but disagreement with ResNet
    # must still be confirmed by the cashier.
    ocr_result = {"passed": False, "reason": "not_run", "ocr_text": "", "score": 0.0}
    ocr_corrected = False
    if ocr_verifier:
        match = ocr_cross_check(ocr_image)
        ocr_result = {
            key: value
            for key, value in match.items()
            if key != "product"
        }
        if match["passed"] and match["product"]:
            ocr_prod = match["product"]
            best_score = match["score"]
            ocr_class = ocr_prod.get("ai_class_name")
            if ocr_class and ocr_class != predicted_class:
                print(f"[OCR CORRECT] model='{predicted_class}' -> OCR='{ocr_class}' (score={best_score:.0f})")
                predicted_class = ocr_class
                ocr_corrected = True
                confidence = max(confidence, best_score / 100.0)
                gap = max(gap, 0.5)
                classification = {
                    "class_name": predicted_class,
                    "confidence": round(confidence, 4),
                    "gap": round(gap, 4),
                    "top_results": [{"class_name": predicted_class, "confidence": round(confidence, 4)}],
                }
                ocr_result["reason"] = "ocr_corrected"
            else:
                ocr_result["reason"] = "ocr_match"

    # 5. Lookup product metadata (using the possibly OCR-corrected class)
    product = None
    if product_repo:
        product = product_repo.get_product_by_class(predicted_class)

    if not product:
        print(f"[DATABASE] Product mapping not found or disabled for class: {predicted_class}")
        # Reject immediately if product mapping does not exist in Supabase
        background_tasks.add_task(
            log_scan_to_supabase,
            product_id=None,
            predicted_class=predicted_class,
            confidence=confidence,
            gap=gap,
            decision="REJECT",
            ocr_text=ocr_result["ocr_text"],
            ocr_score=ocr_result["score"],
            source="detect-v2"
        )
        return {
            "success": False,
            "decision": "REJECT",
            "product": None,
            "reason": "product_not_found_in_database",
            "confidence": confidence,
            "gap": gap,
            "classification": classification,
            "ocr": ocr_result,
            "detection": crop_metadata,
        }

    # 6. Final decision always comes from the shared evaluator/live rule set.
    decision, reason = decide_scan(
        predicted_class=predicted_class,
        confidence=confidence,
        gap=gap,
        ocr_passed=ocr_result["passed"],
        has_text=bool(ocr_result["ocr_text"]),
        ocr_corrected=ocr_corrected,
        crop_detected=bool(crop_metadata.get("detected")),
        consensus_verified=consensus_verified,
    )
    print(f"[DECISION] Result: {decision} (Reason: {reason})")

    # 7. Asynchronous logging to Supabase in a background task
    background_tasks.add_task(
        log_scan_to_supabase,
        product_id=product["id"],
        predicted_class=predicted_class,
        confidence=confidence,
        gap=gap,
        decision=decision,
        ocr_text=ocr_result["ocr_text"],
        ocr_score=ocr_result["score"],
        source="detect-v2"
    )
    
    # 8. Return response
    response_data = {
        "success": decision in ["ACCEPT", "NEED_CONFIRMATION"],
        "decision": decision,
        "product": {
            "id": product["id"],
            "name": product["name"],
            "price": product["price"],
            "ai_class_name": product["ai_class_name"],
            "image_url": product.get("image_url"),
        },
        "confidence": confidence,
        "gap": gap,
        "bbox": bbox_norm,
        "classification": classification,
        "ocr": ocr_result,
        "detection": crop_metadata,
    }

    if debug:
        response_data["debug"] = {
            "is_similar_class": predicted_class in SIMILAR_CLASSES,
            "bbox": bbox_result,
            "reason": reason
        }
        
    return response_data


@app.post("/detect-v2")
async def detect_v2(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    branch_id: str = Form(None),
    camera_id: str = Form(None),
    debug: bool = Form(False)
):
    """
    POST /detect-v2
    Executes YOLO-World crop, ResNet-50 classification, Supabase metadata lookup, 
    and EasyOCR validation.
    """
    # Degraded Mode Check
    if not resnet_classifier:
        return JSONResponse(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            content={
                "success": False,
                "decision": "REJECT",
                "error": "model_not_loaded",
                "message": "ResNet-50 classifier failed to load on startup."
            }
        )
        
    if not yolo_model:
        return JSONResponse(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            content={
                "success": False,
                "decision": "REJECT",
                "error": "model_not_loaded",
                "message": "YOLO-World object detector failed to load on startup."
            }
        )

    try:
        # 1. Load Uploaded Image
        img_bytes = await file.read()
        image = Image.open(io.BytesIO(img_bytes))
        
        return await run_detection_pipeline(
            image=image,
            background_tasks=background_tasks,
            branch_id=branch_id,
            camera_id=camera_id,
            debug=debug
        )
    except Exception as e:
        traceback.print_exc()
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={
                "success": False,
                "decision": "REJECT",
                "error": "server_error",
                "message": f"Internal process error: {str(e)}"
            }
        )


import base64

class LegacyDetectRequest(BaseModel):
    image: str


@app.post("/detect")
async def detect_legacy(
    request: LegacyDetectRequest,
    background_tasks: BackgroundTasks,
):
    """
    POST /detect
    Compatibility fallback route acting as a proxy mapper to detect-v2.
    Accepts base64 JSON payload.
    """
    if not resnet_classifier:
        return JSONResponse(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            content={
                "success": False,
                "decision": "REJECT",
                "error": "model_not_loaded",
                "message": "ResNet-50 classifier failed to load on startup."
            }
        )
        
    if not yolo_model:
        return JSONResponse(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            content={
                "success": False,
                "decision": "REJECT",
                "error": "model_not_loaded",
                "message": "YOLO-World object detector failed to load on startup."
            }
        )

    try:
        # Decode base64 image
        header, encoded = request.image.split(",", 1) if "," in request.image else ("", request.image)
        img_data = base64.b64decode(encoded)
        image = Image.open(io.BytesIO(img_data))
        
        return await run_detection_pipeline(
            image=image,
            background_tasks=background_tasks
        )
    except Exception as e:
        traceback.print_exc()
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={
                "success": False,
                "decision": "REJECT",
                "error": "server_error",
                "message": f"Internal process error: {str(e)}"
            }
        )


if __name__ == "__main__":
    import uvicorn
    # Load configuration
    port = int(os.environ.get("PORT", 5002))
    host = os.environ.get("HOST", "127.0.0.1")
    
    print(f"[SERVER] Starting FastAPI server on http://{host}:{port}...")
    uvicorn.run(app, host=host, port=port)
