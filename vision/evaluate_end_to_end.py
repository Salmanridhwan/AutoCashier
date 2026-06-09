import argparse
import json
import os
from collections import Counter, defaultdict
from datetime import datetime, timezone

from dotenv import load_dotenv
from PIL import Image

from ocr_verifier import match_text_to_products
from multi_crop_consensus import classify_with_multi_crop_consensus
from resnet50_product_classifier import ResNet50ProductClassifier
from scanner_decision import decide_scan
from train_resnet50_product_classifier import get_source_group


IMAGE_EXTENSIONS = (".png", ".jpg", ".jpeg", ".webp", ".bmp")


def _load_json(path):
    with open(path, encoding="utf-8") as file:
        return json.load(file)


def _sample_evenly(items, limit):
    if not limit or len(items) <= limit:
        return items
    if limit == 1:
        return [items[len(items) // 2]]
    return [items[round(index * (len(items) - 1) / (limit - 1))] for index in range(limit)]


def collect_validation_samples(raw_data_dir, runtime_data_dir, split_manifest, crop_manifest, max_images_per_class=5):
    held_out_by_class = {
        class_name: set(class_info.get("held_out_sources", []))
        for class_name, class_info in split_manifest["per_class"].items()
    }
    crop_files = crop_manifest.get("files", {}) if crop_manifest else {}
    by_class = defaultdict(list)
    missing_runtime = []

    for class_name in sorted(os.listdir(raw_data_dir)):
        class_dir = os.path.join(raw_data_dir, class_name)
        if not os.path.isdir(class_dir):
            continue
        for filename in sorted(os.listdir(class_dir)):
            if not filename.lower().endswith(IMAGE_EXTENSIONS):
                continue
            raw_path = os.path.join(class_dir, filename)
            source_group, _source_type = get_source_group(raw_path)
            if source_group not in held_out_by_class.get(class_name, set()):
                continue
            runtime_path = os.path.join(runtime_data_dir, class_name, filename)
            if not os.path.exists(runtime_path):
                missing_runtime.append(runtime_path)
                continue
            by_class[class_name].append(
                {
                    "expected_class": class_name,
                    "source_group": source_group,
                    "raw_path": raw_path,
                    "runtime_path": runtime_path,
                    "crop_detected": bool(
                        crop_files.get(f"{class_name}/{filename}", {}).get("crop", {}).get("detected")
                    ),
                }
            )

    samples = []
    for class_name in sorted(by_class):
        samples.extend(_sample_evenly(by_class[class_name], max_images_per_class))
    missing_validation_classes = sorted(set(held_out_by_class) - set(by_class))
    return samples, missing_runtime, missing_validation_classes


def _safe_rate(numerator, denominator):
    return round(numerator / denominator, 6) if denominator else 0.0


def evaluate_end_to_end(
    classifier,
    ocr_verifier,
    products,
    model_dir="models/resnet50-product-classifier",
    raw_data_dir="dataset/products",
    runtime_data_dir="dataset/products_classifier",
    max_images_per_class=5,
    include_ocr=True,
    progress_callback=None,
):
    split_manifest = _load_json(os.path.join(model_dir, "split_manifest.json"))
    training_metrics = _load_json(os.path.join(model_dir, "metrics.json"))
    try:
        crop_manifest = _load_json(os.path.join(runtime_data_dir, "_crop_manifest.json"))
    except FileNotFoundError:
        crop_manifest = {}
    samples, missing_runtime, missing_validation_classes = collect_validation_samples(
        raw_data_dir,
        runtime_data_dir,
        split_manifest,
        crop_manifest,
        max_images_per_class=max_images_per_class,
    )
    if not samples:
        raise ValueError("No source-held-out validation samples found.")
    if missing_validation_classes:
        raise ValueError(
            "Evaluation coverage is incomplete. Missing held-out samples for classes: "
            + ", ".join(missing_validation_classes)
        )

    product_list = list(products)
    products_by_class = {
        product.get("ai_class_name"): product
        for product in product_list
        if product.get("ai_class_name")
    }
    counts = Counter()
    decisions = Counter()
    reasons = Counter()
    per_class = defaultdict(Counter)
    errors = []

    for index, sample in enumerate(samples, 1):
        expected = sample["expected_class"]
        with Image.open(sample["raw_path"]) as image:
            raw_prediction = classifier.predict(image.convert("RGB"))
        with Image.open(sample["runtime_path"]) as image:
            runtime_image = image.convert("RGB")
            ocr_image = runtime_image
            consensus_verified = False
            if sample["crop_detected"]:
                runtime_prediction = classifier.predict(runtime_image)
            else:
                fallback = classify_with_multi_crop_consensus(classifier, runtime_image)
                runtime_prediction = fallback["classification"]
                consensus_verified = bool(fallback["consensus"]["verified"])
            ocr_match = {
                "passed": False,
                "reason": "not_run",
                "ocr_text": "",
                "score": 0.0,
                "product": None,
            }
            if include_ocr and ocr_verifier:
                ocr_match = match_text_to_products(ocr_verifier.read_text(ocr_image), product_list)

        predicted_class = runtime_prediction["class_name"]
        confidence = runtime_prediction["confidence"]
        gap = runtime_prediction["gap"]
        ocr_corrected = False
        if ocr_match["passed"] and ocr_match["product"]:
            ocr_class = ocr_match["product"].get("ai_class_name")
            if ocr_class and ocr_class != predicted_class:
                predicted_class = ocr_class
                ocr_corrected = True
                confidence = max(confidence, ocr_match["score"] / 100.0)
                gap = max(gap, 0.5)

        if products_by_class.get(predicted_class):
            decision, reason = decide_scan(
                predicted_class,
                confidence,
                gap,
                ocr_match["passed"],
                bool(ocr_match["ocr_text"]),
                ocr_corrected,
                crop_detected=sample["crop_detected"],
                consensus_verified=consensus_verified,
            )
        else:
            decision, reason = "REJECT", "product_not_found_in_database"

        raw_correct = raw_prediction["class_name"] == expected
        runtime_correct = runtime_prediction["class_name"] == expected
        final_correct = predicted_class == expected
        expected_background = expected == "background"
        scanner_correct = (
            expected_background and decision == "REJECT"
        ) or (
            not expected_background
            and final_correct
            and decision in ("ACCEPT", "NEED_CONFIRMATION")
        )
        false_accept = decision == "ACCEPT" and (expected_background or not final_correct)
        false_reject = decision == "REJECT" and not expected_background

        counts.update(
            {
                "total": 1,
                "raw_correct": int(raw_correct),
                "runtime_correct": int(runtime_correct),
                "final_correct": int(final_correct),
                "scanner_correct": int(scanner_correct),
                "false_accepts": int(false_accept),
                "false_rejects": int(false_reject),
                "ocr_corrections": int(ocr_corrected),
                "correct_ocr_corrections": int(ocr_corrected and final_correct),
                "wrong_ocr_corrections": int(ocr_corrected and not final_correct),
                "consensus_attempts": int(not sample["crop_detected"]),
                "consensus_verified": int(consensus_verified),
                "correct_consensus": int(consensus_verified and runtime_correct),
                "wrong_consensus": int(consensus_verified and not runtime_correct),
            }
        )
        decisions[decision] += 1
        reasons[reason] += 1
        per_class[expected].update(
            {
                "total": 1,
                "raw_correct": int(raw_correct),
                "runtime_correct": int(runtime_correct),
                "final_correct": int(final_correct),
                "scanner_correct": int(scanner_correct),
                "false_accepts": int(false_accept),
                "false_rejects": int(false_reject),
            }
        )

        if not scanner_correct and len(errors) < 100:
            errors.append(
                {
                    "expected_class": expected,
                    "raw_prediction": raw_prediction["class_name"],
                    "runtime_prediction": runtime_prediction["class_name"],
                    "final_prediction": predicted_class,
                    "decision": decision,
                    "reason": reason,
                    "confidence": confidence,
                    "gap": gap,
                    "ocr_text": ocr_match["ocr_text"],
                    "ocr_score": ocr_match["score"],
                    "consensus_verified": consensus_verified,
                    "source_group": sample["source_group"],
                    "filename": os.path.basename(sample["raw_path"]),
                }
            )
        if progress_callback and (index == 1 or index % 10 == 0 or index == len(samples)):
            progress_callback(index, len(samples))

    total = counts["total"]
    accepts = decisions["ACCEPT"]
    report_per_class = {}
    for class_name, values in sorted(per_class.items()):
        class_total = values["total"]
        report_per_class[class_name] = {
            "samples": class_total,
            "admin_accuracy": _safe_rate(values["raw_correct"], class_total),
            "runtime_classifier_accuracy": _safe_rate(values["runtime_correct"], class_total),
            "final_prediction_accuracy": _safe_rate(values["final_correct"], class_total),
            "scanner_outcome_accuracy": _safe_rate(values["scanner_correct"], class_total),
            "false_accepts": values["false_accepts"],
            "false_rejects": values["false_rejects"],
        }

    admin_accuracy = _safe_rate(counts["raw_correct"], total)
    runtime_accuracy = _safe_rate(counts["runtime_correct"], total)
    scanner_accuracy = _safe_rate(counts["scanner_correct"], total)
    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "evaluation_strategy": "source_group_holdout_runtime_pipeline",
        "model_dir": os.path.abspath(model_dir),
        "sample_limit_per_class": max_images_per_class,
        "include_ocr": include_ocr,
        "samples": total,
        "classes": len(report_per_class),
        "expected_classes": len(split_manifest["per_class"]),
        "coverage_rate": _safe_rate(len(report_per_class), len(split_manifest["per_class"])),
        "missing_runtime_images": len(missing_runtime),
        "metrics": {
            "training_reported_accuracy": training_metrics.get("accuracy"),
            "admin_raw_classifier_accuracy": admin_accuracy,
            "runtime_crop_classifier_accuracy": runtime_accuracy,
            "final_prediction_accuracy": _safe_rate(counts["final_correct"], total),
            "scanner_outcome_accuracy": scanner_accuracy,
            "admin_to_runtime_gap": round(admin_accuracy - runtime_accuracy, 6),
            "admin_to_scanner_gap": round(admin_accuracy - scanner_accuracy, 6),
            "auto_accept_rate": _safe_rate(accepts, total),
            "auto_accept_precision": _safe_rate(accepts - counts["false_accepts"], accepts),
            "confirmation_rate": _safe_rate(decisions["NEED_CONFIRMATION"], total),
            "reject_rate": _safe_rate(decisions["REJECT"], total),
            "false_accept_rate": _safe_rate(counts["false_accepts"], total),
            "false_reject_rate": _safe_rate(counts["false_rejects"], total),
            "ocr_corrections": counts["ocr_corrections"],
            "correct_ocr_corrections": counts["correct_ocr_corrections"],
            "wrong_ocr_corrections": counts["wrong_ocr_corrections"],
            "consensus_attempts": counts["consensus_attempts"],
            "consensus_verified": counts["consensus_verified"],
            "correct_consensus": counts["correct_consensus"],
            "wrong_consensus": counts["wrong_consensus"],
        },
        "decisions": dict(decisions),
        "reasons": dict(reasons),
        "per_class": report_per_class,
        "errors": errors,
    }


def main():
    load_dotenv()
    parser = argparse.ArgumentParser()
    parser.add_argument("--model_dir", default="models/resnet50-product-classifier")
    parser.add_argument("--raw_data_dir", default="dataset/products")
    parser.add_argument("--runtime_data_dir", default="dataset/products_classifier")
    parser.add_argument("--output_path", default=None)
    parser.add_argument("--max_images_per_class", type=int, default=5)
    parser.add_argument("--skip_ocr", action="store_true")
    args = parser.parse_args()

    from ocr_verifier import OCRVerifier
    from product_repository import ProductRepository

    classifier = ResNet50ProductClassifier(args.model_dir)
    repository = ProductRepository()
    verifier = None if args.skip_ocr else OCRVerifier()
    report = evaluate_end_to_end(
        classifier,
        verifier,
        repository.products_cache.values(),
        model_dir=args.model_dir,
        raw_data_dir=args.raw_data_dir,
        runtime_data_dir=args.runtime_data_dir,
        max_images_per_class=args.max_images_per_class,
        include_ocr=not args.skip_ocr,
        progress_callback=lambda done, total: print(f"[EVAL] {done}/{total}"),
    )
    output_path = args.output_path or os.path.join(args.model_dir, "evaluation_report.json")
    with open(output_path, "w", encoding="utf-8") as file:
        json.dump(report, file, indent=2)
    print(json.dumps(report["metrics"], indent=2))
    print(f"Saved evaluation report: {output_path}")


if __name__ == "__main__":
    main()
