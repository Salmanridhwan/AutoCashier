import argparse
import json
import os

import torch
from PIL import Image
from transformers import AutoImageProcessor, ResNetForImageClassification

from temperature_scaling import fit_temperature, save_calibration
from train_resnet50_product_classifier import get_source_group


IMAGE_EXTENSIONS = (".png", ".jpg", ".jpeg", ".webp", ".bmp")


def collect_validation_samples(data_dir, split_manifest):
    samples = []
    label2id = {
        class_name: index
        for index, class_name in enumerate(sorted(split_manifest["per_class"]))
    }
    for class_name, class_info in split_manifest["per_class"].items():
        held_out_sources = set(class_info.get("held_out_sources", []))
        class_dir = os.path.join(data_dir, class_name)
        if not os.path.isdir(class_dir):
            continue
        for filename in sorted(os.listdir(class_dir)):
            if not filename.lower().endswith(IMAGE_EXTENSIONS):
                continue
            path = os.path.join(class_dir, filename)
            source_group, _source_type = get_source_group(path)
            if source_group in held_out_sources:
                samples.append((path, label2id[class_name]))
    return samples


def main():
    parser = argparse.ArgumentParser(description="Fit temperature scaling on the source-held-out validation set.")
    parser.add_argument("--model_dir", default="models/resnet50-product-classifier")
    parser.add_argument("--data_dir", default="dataset/products_classifier")
    parser.add_argument("--batch_size", type=int, default=64)
    args = parser.parse_args()

    with open(os.path.join(args.model_dir, "split_manifest.json"), encoding="utf-8") as file:
        split_manifest = json.load(file)
    samples = collect_validation_samples(args.data_dir, split_manifest)
    if not samples:
        raise ValueError("No held-out validation images found for temperature scaling.")

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    processor = AutoImageProcessor.from_pretrained(args.model_dir)
    model = ResNetForImageClassification.from_pretrained(args.model_dir).to(device).eval()
    logits_batches = []
    labels = []

    for start in range(0, len(samples), args.batch_size):
        batch = samples[start : start + args.batch_size]
        images = []
        for path, label in batch:
            with Image.open(path) as image:
                images.append(image.convert("RGB"))
            labels.append(label)
        inputs = processor(images, return_tensors="pt")
        inputs = {key: value.to(device) for key, value in inputs.items()}
        with torch.inference_mode():
            logits_batches.append(model(**inputs).logits.float().cpu())
        print(f"[CALIBRATION] {min(start + len(batch), len(samples))}/{len(samples)}")

    calibration = fit_temperature(torch.cat(logits_batches), torch.tensor(labels))
    path = save_calibration(args.model_dir, calibration)
    print(json.dumps(calibration, indent=2))
    print(f"Saved calibration: {path}")


if __name__ == "__main__":
    main()
