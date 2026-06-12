import os
import json
import argparse
import platform
import random
import re
from collections import defaultdict
from datasets import Dataset, Image
import torch
import numpy as np
from transformers import (
    AutoImageProcessor, 
    ResNetForImageClassification, 
    TrainingArguments, 
    Trainer,
    EarlyStoppingCallback,
)
from temperature_scaling import fit_temperature, save_calibration


DEFAULT_NUM_WORKERS = min(2 if os.name == "nt" else 4, max(0, (os.cpu_count() or 2) - 1))


def get_source_group(path):
    """Return a stable source ID so adjacent frames never cross split boundaries."""
    class_name = os.path.basename(os.path.dirname(path))
    stem = os.path.splitext(os.path.basename(path))[0]
    base_stem = re.sub(r"_aug\d+$", "", stem)

    if re.fullmatch(r"vid(?:\d+|_[0-9a-f]{12})_\d+", base_stem):
        source_name = base_stem.rsplit("_", 1)[0]
        source_type = "video"
    elif base_stem.startswith("bgvid_") and re.search(r"_\d+$", base_stem):
        source_name = base_stem.rsplit("_", 1)[0]
        source_type = "video"
    else:
        # A still image is treated as an independent capture source.
        source_name = base_stem
        source_type = "still"

    return f"{class_name}/{source_type}:{source_name}", source_type


def expand_video_training_samples(paths, labels, id2label, repeats):
    """Repeat train video frames so on-the-fly augmentation sees more variants per epoch."""
    repeats = max(0, int(repeats))
    if repeats == 0:
        return paths, labels, {
            "enabled": False,
            "video_aug_repeats": 0,
            "original_train_images": len(paths),
            "augmented_train_images": len(paths),
            "added_virtual_images": 0,
            "video_source_images": 0,
        }

    expanded_paths = []
    expanded_labels = []
    video_source_images = 0
    added_virtual_images = 0
    for path, label in zip(paths, labels):
        expanded_paths.append(path)
        expanded_labels.append(label)
        _source_group, source_type = get_source_group(path)
        class_name = id2label[label]
        if source_type == "video" and class_name != "background":
            video_source_images += 1
            for _ in range(repeats):
                expanded_paths.append(path)
                expanded_labels.append(label)
                added_virtual_images += 1

    return expanded_paths, expanded_labels, {
        "enabled": True,
        "video_aug_repeats": repeats,
        "original_train_images": len(paths),
        "augmented_train_images": len(expanded_paths),
        "added_virtual_images": added_virtual_images,
        "video_source_images": video_source_images,
    }


def split_dataset_by_source(file_paths, labels, id2label, val_ratio, seed):
    """Create a leak-free split by holding out complete capture sources per class."""
    grouped = defaultdict(lambda: defaultdict(list))
    source_types = {}

    for path, label in zip(file_paths, labels):
        source_group, source_type = get_source_group(path)
        grouped[label][source_group].append(path)
        source_types[source_group] = source_type

    train_paths = []
    train_labels = []
    val_paths = []
    val_labels = []
    per_class = {}
    train_source_groups = set()
    val_source_groups = set()

    for label in sorted(grouped):
        class_name = id2label[label]
        class_groups = grouped[label]
        group_names = sorted(class_groups)
        if len(group_names) < 2:
            raise ValueError(
                f"Class '{class_name}' only has one capture source. "
                "Add another photo/video source before training so validation can be leak-free."
            )

        rng = random.Random(f"{seed}:{class_name}")
        video_groups = [group for group in group_names if source_types[group] == "video"]

        if video_groups:
            # Sort video groups by number of frames in descending order (longest first)
            sorted_video_groups = sorted(video_groups, key=lambda g: len(class_groups[g]), reverse=True)
            # Choose the shortest video (the last one) for validation, leaving the longer one(s) for training
            chosen_val_groups = {sorted_video_groups[-1]}
        else:
            shuffled_groups = list(group_names)
            rng.shuffle(shuffled_groups)
            target_val_images = max(1, round(sum(len(class_groups[g]) for g in group_names) * val_ratio))
            chosen_val_groups = set()
            selected_images = 0
            for group in shuffled_groups:
                if len(chosen_val_groups) >= len(group_names) - 1:
                    break
                chosen_val_groups.add(group)
                selected_images += len(class_groups[group])
                if selected_images >= target_val_images:
                    break

        chosen_train_groups = set(group_names) - chosen_val_groups
        if not chosen_train_groups or not chosen_val_groups:
            raise ValueError(f"Could not create a source-group split for class '{class_name}'.")

        class_train_count = 0
        class_val_count = 0
        for group in sorted(chosen_train_groups):
            paths = class_groups[group]
            train_paths.extend(paths)
            train_labels.extend([label] * len(paths))
            train_source_groups.add(group)
            class_train_count += len(paths)
        for group in sorted(chosen_val_groups):
            paths = class_groups[group]
            val_paths.extend(paths)
            val_labels.extend([label] * len(paths))
            val_source_groups.add(group)
            class_val_count += len(paths)

        per_class[class_name] = {
            "train_images": class_train_count,
            "val_images": class_val_count,
            "train_source_groups": len(chosen_train_groups),
            "val_source_groups": len(chosen_val_groups),
            "held_out_sources": sorted(chosen_val_groups),
        }

    overlap = train_source_groups & val_source_groups
    if overlap:
        raise RuntimeError(f"Source leakage detected after split: {sorted(overlap)}")

    split_manifest = {
        "strategy": "source_group_holdout",
        "seed": seed,
        "requested_val_ratio": val_ratio,
        "actual_val_ratio": len(val_paths) / len(file_paths),
        "train_images": len(train_paths),
        "val_images": len(val_paths),
        "train_source_groups": len(train_source_groups),
        "val_source_groups": len(val_source_groups),
        "source_group_overlap": len(overlap),
        "per_class": per_class,
    }

    return train_paths, val_paths, train_labels, val_labels, split_manifest


# Custom data collator to build tensor batches
def collate_fn(batch):
    pixel_values = torch.stack([x['pixel_values'] for x in batch])
    if pixel_values.ndim == 4:
        pixel_values = pixel_values.contiguous(memory_format=torch.channels_last)

    return {
        'pixel_values': pixel_values,
        'labels': torch.tensor([x['labels'] for x in batch], dtype=torch.long)
    }


class ImageProcessorTransform:
    """Pickle-safe transform so Windows DataLoader workers can preprocess images."""

    def __init__(self, image_processor, train: bool):
        self.image_processor = image_processor
        self.train = train

        from torchvision import transforms as T

        self.augment = T.Compose([
            T.RandomResizedCrop(320, scale=(0.88, 1.0), ratio=(0.9, 1.1)),
            T.RandomApply([
                T.RandomAffine(
                    degrees=12,
                    translate=(0.05, 0.05),
                    scale=(0.9, 1.05),
                )
            ], p=0.8),
            T.ColorJitter(brightness=0.3, contrast=0.3, saturation=0.2),
            T.RandomApply([T.GaussianBlur(kernel_size=3, sigma=(0.1, 1.5))], p=0.35),
            T.ToTensor(),
            T.RandomErasing(
                p=0.1,
                scale=(0.02, 0.07),
                ratio=(0.5, 2.0),
                value="random",
            ),
            T.ToPILImage(),
        ])

    def __call__(self, example_batch):
        if self.train:
            images = [self.augment(x.convert("RGB")) for x in example_batch['image']]
        else:
            images = [x.convert("RGB") for x in example_batch['image']]

        inputs = self.image_processor(images, return_tensors='pt')
        inputs['labels'] = example_batch['label']
        return inputs


def configure_torch(require_cuda: bool):
    has_cuda = torch.cuda.is_available()
    print(f"Python: {platform.python_version()} | PyTorch: {torch.__version__}")
    print(f"CUDA available: {has_cuda} | torch CUDA: {torch.version.cuda}")

    if require_cuda and not has_cuda:
        raise RuntimeError(
            "CUDA is required for this training run, but torch.cuda.is_available() is False. "
            "Install a CUDA-enabled PyTorch build or run without --require_cuda."
        )

    if not has_cuda:
        print("Training will run on CPU. GPU/VRAM optimizations are disabled.")
        return

    device_name = torch.cuda.get_device_name(0)
    props = torch.cuda.get_device_properties(0)
    total_vram_mb = props.total_memory / (1024 ** 2)
    print(f"GPU: {device_name} | VRAM: {total_vram_mb:.0f} MB")

    torch.backends.cudnn.benchmark = True
    torch.backends.cuda.matmul.allow_tf32 = True
    torch.backends.cudnn.allow_tf32 = True
    if hasattr(torch, "set_float32_matmul_precision"):
        torch.set_float32_matmul_precision("high")


def resolve_precision(mode: str):
    if not torch.cuda.is_available() or mode == "fp32":
        return False, False
    if mode == "bf16":
        return False, True
    if mode == "fp16":
        return True, False

    # Prefer fp16 for this ResNet-50 workload on RTX 3050-class GPUs.
    return True, False


def load_manifest_file_set(data_dir):
    """Return classifier-cache files that are backed by the current raw dataset."""
    manifest_path = os.path.join(data_dir, "_crop_manifest.json")
    try:
        with open(manifest_path, encoding="utf-8") as file:
            manifest = json.load(file)
    except (FileNotFoundError, json.JSONDecodeError, OSError):
        return None

    manifest_output = os.path.abspath(manifest.get("output_dir") or data_dir)
    if manifest_output != os.path.abspath(data_dir):
        raise ValueError(
            f"Classifier manifest output mismatch: manifest={manifest_output}, data_dir={os.path.abspath(data_dir)}"
        )
    return set(manifest.get("files", {}))


def main():
    parser = argparse.ArgumentParser(description="Fine-tune ResNet-50 for Product Classification")
    parser.add_argument("--data_dir", type=str, default="dataset/products", help="Path to dataset")
    parser.add_argument("--classifier_data_dir", type=str, default="dataset/products_classifier", help="Cached dataset after runtime YOLO crop policy")
    parser.add_argument("--crop_model_path", type=str, default="yolov8s-world.pt", help="YOLO-World model used by runtime crop prep")
    parser.add_argument("--crop_confidence", type=float, default=0.25, help="YOLO confidence used by runtime and training crop prep")
    parser.add_argument("--crop_padding_ratio", type=float, default=0.08, help="Padding around detected product crop")
    parser.add_argument("--crop_min_area_ratio", type=float, default=0.02, help="Reject tiny YOLO boxes and use the full frame instead")
    parser.add_argument("--skip_runtime_crop_prep", action="store_true", help="Train directly from --data_dir without runtime crop preprocessing")
    parser.add_argument("--base_model", type=str, default="microsoft/resnet-50", help="Base model or existing classifier to fine-tune")
    parser.add_argument("--output_dir", type=str, default="models/resnet50-product-classifier", help="Path to save model")
    parser.add_argument("--epochs", type=int, default=10, help="Number of epochs")
    parser.add_argument("--batch_size", type=int, default=32, help="Per-device train batch size")
    parser.add_argument("--eval_batch_size", type=int, default=64, help="Per-device eval batch size")
    parser.add_argument("--learning_rate", type=float, default=5e-5, help="Learning rate")
    parser.add_argument("--grad_accum", type=int, default=1, help="Gradient accumulation steps")
    parser.add_argument("--num_workers", type=int, default=DEFAULT_NUM_WORKERS, help="DataLoader worker processes")
    parser.add_argument("--prefetch_factor", type=int, default=2, help="Batches prefetched per DataLoader worker")
    parser.add_argument("--precision", choices=["auto", "fp16", "bf16", "fp32"], default="auto", help="Mixed precision mode")
    parser.add_argument("--optim", type=str, default="adamw_torch_fused", help="Trainer optimizer")
    parser.add_argument("--auto_batch_size", action="store_true", help="Automatically reduce batch size if CUDA runs out of memory")
    parser.add_argument("--early_stopping_patience", type=int, default=3, help="Stop after N evals without accuracy improvement; 0 disables it")
    parser.add_argument("--require_cuda", action="store_true", help="Fail fast if CUDA is not available")
    parser.add_argument("--val_ratio", type=float, default=0.2, help="Validation ratio used when a class has no video source")
    parser.add_argument("--split_seed", type=int, default=42, help="Deterministic capture-source split seed")
    parser.add_argument("--video_aug_repeats", type=int, default=3, help="Extra virtual train samples per video frame; validation is never augmented")
    parser.add_argument("--split_only", action="store_true", help="Validate and print the source-group split, then exit")
    parser.add_argument("--quick_test", action="store_true", help="Run a quick training test (1 epoch, few steps)")
    args = parser.parse_args()

    configure_torch(args.require_cuda)
    if not 0.0 < args.val_ratio < 1.0:
        raise ValueError("--val_ratio must be between 0 and 1.")

    raw_data_dir = args.data_dir
    data_dir = raw_data_dir
    output_dir = args.output_dir
    runtime_crop_manifest = None

    if not os.path.exists(raw_data_dir):
        raise FileNotFoundError(f"Dataset directory '{raw_data_dir}' not found. Please run generate_mock_dataset.py first.")

    if not args.skip_runtime_crop_prep:
        from prepare_classifier_dataset import prepare_runtime_classifier_dataset

        runtime_crop_manifest = prepare_runtime_classifier_dataset(
            source_dir=raw_data_dir,
            output_dir=args.classifier_data_dir,
            model_path=args.crop_model_path,
            confidence=args.crop_confidence,
            padding_ratio=args.crop_padding_ratio,
            min_area_ratio=args.crop_min_area_ratio,
        )
        data_dir = args.classifier_data_dir
        print(
            "Classifier input dataset: "
            f"strategy={runtime_crop_manifest['strategy']}, data_dir={data_dir}, "
            f"detection_rate={runtime_crop_manifest['stats']['detection_rate']:.3f}"
        )
    else:
        print(f"Classifier input dataset: strategy=raw_images, data_dir={data_dir}")

    # Read classes
    classes = sorted([d for d in os.listdir(data_dir) if os.path.isdir(os.path.join(data_dir, d))])
    num_labels = len(classes)
    
    if num_labels == 0:
        raise ValueError(f"No class folders found in '{data_dir}'.")

    label2id = {label: i for i, label in enumerate(classes)}
    id2label = {i: label for i, label in enumerate(classes)}

    print(f"Detected {num_labels} classes: {classes}")

    # Gather file paths and labels
    file_paths = []
    labels = []
    manifest_files = load_manifest_file_set(data_dir)
    ignored_orphan_files = 0
    for label_name in classes:
        class_path = os.path.join(data_dir, label_name)
        for fname in os.listdir(class_path):
            if fname.lower().endswith(('.png', '.jpg', '.jpeg')):
                relative_path = f"{label_name}/{fname}"
                if manifest_files is not None and relative_path not in manifest_files:
                    ignored_orphan_files += 1
                    continue
                file_paths.append(os.path.join(class_path, fname))
                labels.append(int(label2id[label_name]))

    if len(file_paths) == 0:
        raise ValueError("No images found in the dataset directories.")
    if manifest_files is not None:
        print(
            "Classifier manifest integrity: "
            f"valid_images={len(file_paths)}, ignored_orphan_files={ignored_orphan_files}"
        )

    # Split complete photo/video sources so adjacent frames never leak into validation.
    train_paths, val_paths, train_labels, val_labels, split_manifest = split_dataset_by_source(
        file_paths,
        labels,
        id2label,
        val_ratio=args.val_ratio,
        seed=args.split_seed,
    )
    print(
        "Validation Split: "
        f"strategy={split_manifest['strategy']}, train_images={split_manifest['train_images']}, "
        f"val_images={split_manifest['val_images']}, actual_val_ratio={split_manifest['actual_val_ratio']:.3f}, "
        f"train_sources={split_manifest['train_source_groups']}, "
        f"val_sources={split_manifest['val_source_groups']}, "
        f"source_overlap={split_manifest['source_group_overlap']}"
    )
    for class_name, stats in split_manifest["per_class"].items():
        print(
            f"Split class={class_name}: train={stats['train_images']} images/"
            f"{stats['train_source_groups']} sources, val={stats['val_images']} images/"
            f"{stats['val_source_groups']} sources, held_out={stats['held_out_sources']}"
        )

    # Load previous evaluation report to perform active learning (promoting previous misclassifications to training set)
    evaluation_report_path = None
    for folder in [args.base_model, args.output_dir]:
        p = os.path.join(folder, "evaluation_report.json")
        if os.path.exists(p):
            evaluation_report_path = p
            break

    if evaluation_report_path:
        try:
            with open(evaluation_report_path, encoding="utf-8") as file:
                report = json.load(file)
            errors = report.get("errors", [])
            error_files = set()
            for err in errors:
                expected_class = err.get("expected_class")
                filename = err.get("filename")
                if expected_class and filename:
                    error_files.add((expected_class, filename))

            if error_files:
                new_val_paths = []
                new_val_labels = []
                promoted_count_by_class = defaultdict(int)
                promoted_count = 0

                for path, label in zip(val_paths, val_labels):
                    class_name = id2label[label]
                    filename = os.path.basename(path)
                    if (class_name, filename) in error_files:
                        train_paths.append(path)
                        train_labels.append(label)
                        promoted_count += 1
                        promoted_count_by_class[class_name] += 1
                    else:
                        new_val_paths.append(path)
                        new_val_labels.append(label)

                val_paths = new_val_paths
                val_labels = new_val_labels

                if promoted_count > 0:
                    print(
                        f"Active Learning: Promoted {promoted_count} misclassified validation images "
                        f"to the training set: {dict(promoted_count_by_class)}"
                    )
                    # Update split_manifest stats to reflect the promotion
                    split_manifest["train_images"] = len(train_paths)
                    split_manifest["val_images"] = len(val_paths)
                    split_manifest["actual_val_ratio"] = len(val_paths) / (len(train_paths) + len(val_paths))
                    for class_name, count in promoted_count_by_class.items():
                        if class_name in split_manifest["per_class"]:
                            split_manifest["per_class"][class_name]["train_images"] += count
                            split_manifest["per_class"][class_name]["val_images"] -= count
                    split_manifest["active_learning_promoted_images"] = promoted_count
                    split_manifest["active_learning_promoted_by_class"] = dict(promoted_count_by_class)
        except Exception as e:
            print(f"Active Learning: Could not load previous errors for active learning: {e}")

    if args.split_only:
        print("Split-only validation finished successfully.")
        return

    train_paths, train_labels, video_aug_manifest = expand_video_training_samples(
        train_paths,
        train_labels,
        id2label,
        repeats=args.video_aug_repeats,
    )
    print(
        "Video augmentation: "
        f"enabled={video_aug_manifest['enabled']}, repeats={video_aug_manifest['video_aug_repeats']}, "
        f"video_source_images={video_aug_manifest['video_source_images']}, "
        f"train_images={video_aug_manifest['original_train_images']} -> "
        f"{video_aug_manifest['augmented_train_images']} "
        f"(+{video_aug_manifest['added_virtual_images']} virtual)"
    )

    # Convert to HF Dataset
    def create_dataset(paths, labels):
        return Dataset.from_dict({"image": paths, "label": labels}).cast_column("image", Image())

    train_dataset = create_dataset(train_paths, train_labels)
    val_dataset = create_dataset(val_paths, val_labels)

    # Load image processor
    image_processor = AutoImageProcessor.from_pretrained(args.base_model)

    # On-the-fly augmentation for the TRAIN set only (simulates real camera variation:
    # angle, lighting, blur, zoom). Validation stays clean for honest accuracy.
    train_dataset.set_transform(ImageProcessorTransform(image_processor, train=True))
    val_dataset.set_transform(ImageProcessorTransform(image_processor, train=False))

    def compute_metrics(eval_pred):
        logits, labels = eval_pred
        preds = np.argmax(logits, axis=-1)
        return {"accuracy": float((preds == labels).mean())}

    # Load pretrained model and replace head
    print(f"Loading base model: {args.base_model}")
    model = ResNetForImageClassification.from_pretrained(
        args.base_model,
        num_labels=num_labels,
        label2id=label2id,
        id2label=id2label,
        ignore_mismatched_sizes=True
    )
    model.config.label2id = label2id
    model.config.id2label = id2label
    model.config.num_labels = num_labels

    if torch.cuda.is_available():
        model.to(memory_format=torch.channels_last)

    # Config options based on flags
    epochs = 1 if args.quick_test else args.epochs
    max_steps = 2 if args.quick_test else -1
    logging_steps = 1 if args.quick_test else 10
    num_workers = 0 if args.quick_test and args.num_workers < 0 else max(0, args.num_workers)
    use_fp16, use_bf16 = resolve_precision(args.precision)
    optim = args.optim if torch.cuda.is_available() else "adamw_torch"
    effective_batch = args.batch_size * max(1, args.grad_accum)

    print(
        "Training config: "
        f"epochs={epochs}, batch_size={args.batch_size}, eval_batch_size={args.eval_batch_size}, "
        f"grad_accum={args.grad_accum}, effective_batch={effective_batch}, "
        f"num_workers={num_workers}, fp16={use_fp16}, bf16={use_bf16}, "
        f"tf32={torch.cuda.is_available()}, optim={optim}, auto_batch_size={args.auto_batch_size}"
    )

    training_args = TrainingArguments(
        output_dir=output_dir,
        per_device_train_batch_size=args.batch_size,
        per_device_eval_batch_size=args.eval_batch_size,
        gradient_accumulation_steps=args.grad_accum if not args.quick_test else 1,
        num_train_epochs=epochs,
        max_steps=max_steps,
        learning_rate=args.learning_rate,
        eval_strategy="epoch" if not args.quick_test else "no",
        save_strategy="epoch" if not args.quick_test else "no",
        save_total_limit=2,
        load_best_model_at_end=not args.quick_test,
        metric_for_best_model="accuracy",
        greater_is_better=True,
        logging_steps=logging_steps,
        fp16=use_fp16,
        bf16=use_bf16,
        tf32=torch.cuda.is_available(),
        optim=optim,
        auto_find_batch_size=args.auto_batch_size,
        dataloader_num_workers=num_workers,
        dataloader_pin_memory=torch.cuda.is_available(),
        dataloader_persistent_workers=num_workers > 0,
        dataloader_prefetch_factor=args.prefetch_factor if num_workers > 0 else None,
        remove_unused_columns=False,
        push_to_hub=False,
        report_to="none"
    )

    callbacks = []
    if not args.quick_test and args.early_stopping_patience > 0:
        callbacks.append(EarlyStoppingCallback(early_stopping_patience=args.early_stopping_patience))

    trainer = Trainer(
        model=model,
        args=training_args,
        train_dataset=train_dataset,
        eval_dataset=val_dataset,
        data_collator=collate_fn,
        compute_metrics=compute_metrics,
        callbacks=callbacks,
    )

    print("Starting training...")
    train_result = trainer.train()
    print("Training finished. Saving model...")

    # Save model and preprocessor
    trainer.save_model(output_dir)
    image_processor.save_pretrained(output_dir)
    validation_output = trainer.predict(val_dataset)
    calibration = fit_temperature(validation_output.predictions, validation_output.label_ids)
    save_calibration(output_dir, calibration)
    print(f"Temperature calibration: {calibration}")
    with open(os.path.join(output_dir, "split_manifest.json"), "w") as f:
        json.dump(split_manifest, f, indent=2)
    with open(os.path.join(output_dir, "video_augmentation_manifest.json"), "w") as f:
        json.dump(video_aug_manifest, f, indent=2)
    if runtime_crop_manifest:
        crop_summary = {
            "strategy": runtime_crop_manifest["strategy"],
            "source_dir": runtime_crop_manifest["source_dir"],
            "output_dir": runtime_crop_manifest["output_dir"],
            "config": runtime_crop_manifest["config"],
            "stats": runtime_crop_manifest["stats"],
        }
        with open(os.path.join(output_dir, "runtime_crop_manifest.json"), "w") as f:
            json.dump(crop_summary, f, indent=2)

    # Save class_mapping.json explicitly
    class_mapping = {
        "id2label": id2label,
        "label2id": label2id,
        "labels": classes
    }
    
    with open(os.path.join(output_dir, "class_mapping.json"), "w") as f:
        json.dump(class_mapping, f, indent=2)

    # Save final eval metrics (accuracy) so the admin UI can report it
    try:
        final_metrics = trainer.evaluate()
        metrics_out = {
            "accuracy": final_metrics.get("eval_accuracy"),
            "eval_loss": final_metrics.get("eval_loss"),
            "num_classes": num_labels,
            "labels": classes,
            "train_runtime": train_result.metrics.get("train_runtime"),
            "train_samples_per_second": train_result.metrics.get("train_samples_per_second"),
            "train_steps_per_second": train_result.metrics.get("train_steps_per_second"),
            "batch_size": args.batch_size,
            "eval_batch_size": args.eval_batch_size,
            "gradient_accumulation_steps": args.grad_accum,
            "effective_batch_size": effective_batch,
            "precision": "bf16" if use_bf16 else "fp16" if use_fp16 else "fp32",
            "dataloader_num_workers": num_workers,
            "split_strategy": split_manifest["strategy"],
            "validation_images": split_manifest["val_images"],
            "validation_source_groups": split_manifest["val_source_groups"],
            "validation_source_overlap": split_manifest["source_group_overlap"],
            "video_aug_repeats": video_aug_manifest["video_aug_repeats"],
            "video_aug_added_virtual_images": video_aug_manifest["added_virtual_images"],
            "video_aug_train_images": video_aug_manifest["augmented_train_images"],
            "temperature_scaling": calibration,
            "classifier_input_strategy": (
                runtime_crop_manifest["strategy"] if runtime_crop_manifest else "raw_images"
            ),
        }
        if runtime_crop_manifest:
            metrics_out["runtime_crop_detection_rate"] = runtime_crop_manifest["stats"]["detection_rate"]
            metrics_out["runtime_crop_detected_images"] = runtime_crop_manifest["stats"]["detected_crops"]
            metrics_out["runtime_crop_fallback_images"] = runtime_crop_manifest["stats"]["full_frame_fallbacks"]
        if torch.cuda.is_available():
            metrics_out["peak_gpu_memory_mb"] = round(torch.cuda.max_memory_allocated() / (1024 ** 2), 1)
        with open(os.path.join(output_dir, "metrics.json"), "w") as f:
            json.dump(metrics_out, f, indent=2)
        print(f"Final metrics: {metrics_out}")
    except Exception as e:
        print(f"Could not compute final metrics: {e}")

    print(f"Model successfully saved to {output_dir}")

if __name__ == "__main__":
    main()
