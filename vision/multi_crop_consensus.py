from collections import Counter

from PIL import Image


CROP_SPECS = (
    ("center_90", (0.05, 0.05, 0.95, 0.95)),
    ("center_80", (0.10, 0.10, 0.90, 0.90)),
    ("center_70", (0.15, 0.15, 0.85, 0.85)),
    ("center_tall", (0.17, 0.05, 0.83, 0.95)),
    ("center_wide", (0.05, 0.17, 0.95, 0.83)),
)

MIN_VOTES = len(CROP_SPECS)
MIN_VOTE_RATIO = 1.0
MIN_MEAN_CONFIDENCE = 0.94
MIN_MEAN_GAP = 0.55
MIN_MEMBER_CONFIDENCE = 0.80
MIN_MEMBER_GAP = 0.20


def build_multi_crop_candidates(image: Image.Image):
    if image.mode != "RGB":
        image = image.convert("RGB")

    width, height = image.size
    candidates = []
    for name, normalized_box in CROP_SPECS:
        x1, y1, x2, y2 = normalized_box
        pixel_box = (
            round(x1 * width),
            round(y1 * height),
            round(x2 * width),
            round(y2 * height),
        )
        candidates.append(
            {
                "name": name,
                "bbox": pixel_box,
                "bbox_normalized": list(normalized_box),
                "image": image.crop(pixel_box),
            }
        )
    return candidates


def summarize_consensus(predictions):
    if not predictions:
        return {
            "verified": False,
            "reason": "no_predictions",
            "class_name": None,
            "votes": 0,
            "total_crops": 0,
            "vote_ratio": 0.0,
            "mean_confidence": 0.0,
            "mean_gap": 0.0,
            "selected_index": None,
        }

    class_counts = Counter(prediction["class_name"] for prediction in predictions)
    class_name, votes = class_counts.most_common(1)[0]
    matching = [
        (index, prediction)
        for index, prediction in enumerate(predictions)
        if prediction["class_name"] == class_name
    ]
    confidences = [prediction["confidence"] for _index, prediction in matching]
    gaps = [prediction["gap"] for _index, prediction in matching]
    vote_ratio = votes / len(predictions)
    mean_confidence = sum(confidences) / votes
    mean_gap = sum(gaps) / votes
    selected_index, selected_prediction = max(
        matching,
        key=lambda item: (item[1]["confidence"], item[1]["gap"]),
    )

    verified = (
        class_name != "background"
        and votes >= MIN_VOTES
        and vote_ratio >= MIN_VOTE_RATIO
        and mean_confidence >= MIN_MEAN_CONFIDENCE
        and mean_gap >= MIN_MEAN_GAP
        and min(confidences) >= MIN_MEMBER_CONFIDENCE
        and min(gaps) >= MIN_MEMBER_GAP
    )
    return {
        "verified": verified,
        "reason": "verified" if verified else "insufficient_consensus",
        "class_name": class_name,
        "votes": votes,
        "total_crops": len(predictions),
        "vote_ratio": round(vote_ratio, 4),
        "mean_confidence": round(mean_confidence, 4),
        "mean_gap": round(mean_gap, 4),
        "selected_index": selected_index,
        "selected_prediction": selected_prediction,
        "predictions": predictions,
    }


def classify_with_multi_crop_consensus(classifier, image: Image.Image):
    candidates = build_multi_crop_candidates(image)
    batch_predictions = classifier.predict_batch([image] + [candidate["image"] for candidate in candidates])
    full_frame_prediction = batch_predictions[0]
    crop_predictions = batch_predictions[1:]
    summary = summarize_consensus(crop_predictions)
    full_frame_agrees = summary["class_name"] == full_frame_prediction["class_name"]
    if summary["verified"] and not full_frame_agrees:
        summary["verified"] = False
        summary["reason"] = "full_frame_disagreement"

    selected_candidate = None
    classification = full_frame_prediction
    if summary["verified"]:
        selected_candidate = candidates[summary["selected_index"]]
        classification = summary["selected_prediction"]

    metadata = {
        key: value
        for key, value in summary.items()
        if key not in {"selected_prediction", "predictions"}
    }
    metadata["full_frame_class"] = full_frame_prediction["class_name"]
    metadata["full_frame_agrees"] = full_frame_agrees
    return {
        "classification": classification,
        "image": selected_candidate["image"] if selected_candidate else image,
        "bbox": selected_candidate["bbox"] if selected_candidate else None,
        "bbox_normalized": selected_candidate["bbox_normalized"] if selected_candidate else None,
        "consensus": metadata,
    }
