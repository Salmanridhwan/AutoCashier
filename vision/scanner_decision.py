SIMILAR_CLASSES = {
    "teh_sosro_kotak",
    "nescafe_cappucino",
    "nescafe_coffe_cream",
    "nabati_coklat",
    "krice",
    "pop_mie_ayam_bawang",
    "buah_vita",
    "ultra_milk_coklat",
    "good_time_double_choc",
}


def decide_scan(
    predicted_class: str,
    confidence: float,
    gap: float,
    ocr_passed: bool,
    has_text: bool,
    ocr_corrected: bool,
    crop_detected: bool = True,
    consensus_verified: bool = False,
) -> tuple[str, str]:
    """Apply the decision thresholds shared by live inference and evaluation."""
    if confidence >= 0.70:
        return "ACCEPT", "confidence_threshold"
    return "REJECT", "low_confidence"
