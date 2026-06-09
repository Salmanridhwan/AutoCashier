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
    is_similar = predicted_class in SIMILAR_CLASSES
    accept_conf = 0.90 if is_similar else 0.86
    accept_gap = 0.16 if is_similar else 0.12
    confirm_conf = 0.70
    confirm_gap = 0.10
    strong_conf = 0.91
    strong_gap = 0.30

    high_conf_accept = (not is_similar) and confidence >= strong_conf and gap >= strong_gap
    if not crop_detected:
        return "NEED_CONFIRMATION", "full_frame_requires_confirmation"

    if ocr_corrected:
        return "NEED_CONFIRMATION", "ocr_correction_requires_confirmation"
    if high_conf_accept:
        return "ACCEPT", "high_confidence"
    if confidence >= accept_conf and gap >= accept_gap and ocr_passed:
        return "ACCEPT", "ocr_verified"
    if not is_similar and confidence >= accept_conf and gap >= accept_gap and not has_text:
        return "ACCEPT", "visual_threshold"
    if confidence >= confirm_conf and gap >= confirm_gap:
        reason = "ocr_mismatch" if (has_text and not ocr_passed and confidence >= accept_conf) else "moderate_confidence"
        return "NEED_CONFIRMATION", reason
    return "REJECT", "low_gap_threshold" if gap < confirm_gap else "low_confidence"
