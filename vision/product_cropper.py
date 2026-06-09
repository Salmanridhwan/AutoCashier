from PIL import Image


PRODUCT_DETECTION_CLASSES = ("product", "item", "packaged goods", "bottle", "can")
DEFAULT_CONFIDENCE = 0.25
DEFAULT_PADDING_RATIO = 0.08
DEFAULT_MIN_AREA_RATIO = 0.02


def configure_product_detector(model):
    model.set_classes(list(PRODUCT_DETECTION_CLASSES))
    return model


def crop_product_for_classifier(
    image: Image.Image,
    model,
    confidence: float = DEFAULT_CONFIDENCE,
    padding_ratio: float = DEFAULT_PADDING_RATIO,
    min_area_ratio: float = DEFAULT_MIN_AREA_RATIO,
    device=None,
):
    """Apply the same YOLO crop policy used by training prep and live inference."""
    if image.mode != "RGB":
        image = image.convert("RGB")

    predict_kwargs = {"conf": confidence, "verbose": False}
    if device is not None:
        predict_kwargs["device"] = device

    result = model(image, **predict_kwargs)[0]
    return crop_product_from_result(
        image,
        result,
        padding_ratio=padding_ratio,
        min_area_ratio=min_area_ratio,
    )


def crop_product_from_result(
    image: Image.Image,
    result,
    padding_ratio: float = DEFAULT_PADDING_RATIO,
    min_area_ratio: float = DEFAULT_MIN_AREA_RATIO,
):
    """Crop an image from an already-computed YOLO result."""
    if image.mode != "RGB":
        image = image.convert("RGB")

    boxes = result.boxes
    if len(boxes) == 0:
        return image, {
            "detected": False,
            "fallback_reason": "no_detection",
            "confidence": 0.0,
            "bbox": None,
            "bbox_normalized": None,
            "area_ratio": 1.0,
        }

    width, height = image.size
    eligible_boxes = []
    for box in boxes:
        bx1, by1, bx2, by2 = box.xyxy[0].detach().cpu().tolist()
        raw_area_ratio = max(0.0, bx2 - bx1) * max(0.0, by2 - by1) / max(1.0, width * height)
        if raw_area_ratio >= min_area_ratio:
            eligible_boxes.append(box)

    if not eligible_boxes:
        return image, {
            "detected": False,
            "fallback_reason": "detection_too_small",
            "confidence": max(float(box.conf[0].item()) for box in boxes),
            "bbox": None,
            "bbox_normalized": None,
            "area_ratio": 1.0,
        }

    best_box = max(eligible_boxes, key=lambda box: box.conf[0].item())
    x1, y1, x2, y2 = best_box.xyxy[0].detach().cpu().tolist()
    box_width = max(1.0, x2 - x1)
    box_height = max(1.0, y2 - y1)

    pad_x = box_width * padding_ratio
    pad_y = box_height * padding_ratio
    crop_box = (
        max(0.0, x1 - pad_x),
        max(0.0, y1 - pad_y),
        min(float(width), x2 + pad_x),
        min(float(height), y2 + pad_y),
    )

    crop_width = max(1.0, crop_box[2] - crop_box[0])
    crop_height = max(1.0, crop_box[3] - crop_box[1])
    area_ratio = (crop_width * crop_height) / max(1.0, width * height)
    normalized = [
        round(crop_box[0] / width, 4),
        round(crop_box[1] / height, 4),
        round(crop_box[2] / width, 4),
        round(crop_box[3] / height, 4),
    ]

    return image.crop(crop_box), {
        "detected": True,
        "fallback_reason": None,
        "confidence": float(best_box.conf[0].item()),
        "bbox": [round(value, 2) for value in crop_box],
        "bbox_normalized": normalized,
        "area_ratio": round(area_ratio, 6),
    }
