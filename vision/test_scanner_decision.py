import unittest

from scanner_decision import decide_scan


class ScannerDecisionTests(unittest.TestCase):
    def test_high_confidence_non_similar_product_is_accepted(self):
        self.assertEqual(
            decide_scan("prima", 0.97, 0.70, False, False, False),
            ("ACCEPT", "high_confidence"),
        )

    def test_lowered_visual_threshold_accepts_clear_non_similar_product(self):
        self.assertEqual(
            decide_scan("prima", 0.88, 0.14, False, False, False),
            ("ACCEPT", "visual_threshold"),
        )

    def test_lowered_similar_threshold_still_requires_matching_ocr(self):
        self.assertEqual(
            decide_scan("nescafe_cappucino", 0.91, 0.18, True, True, False),
            ("ACCEPT", "ocr_verified"),
        )

    def test_high_confidence_full_frame_requires_confirmation(self):
        self.assertEqual(
            decide_scan("prima", 0.97, 0.70, False, False, False, crop_detected=False),
            ("NEED_CONFIRMATION", "full_frame_requires_confirmation"),
        )

    def test_full_frame_with_matching_ocr_requires_confirmation(self):
        self.assertEqual(
            decide_scan("prima", 0.97, 0.70, True, True, False, crop_detected=False),
            ("NEED_CONFIRMATION", "full_frame_requires_confirmation"),
        )

    def test_full_frame_with_ocr_correction_requires_confirmation(self):
        self.assertEqual(
            decide_scan("prima", 0.80, 0.50, True, True, True, crop_detected=False),
            ("NEED_CONFIRMATION", "full_frame_requires_confirmation"),
        )

    def test_low_confidence_full_frame_requires_confirmation(self):
        self.assertEqual(
            decide_scan("prima", 0.60, 0.20, False, False, False, crop_detected=False),
            ("NEED_CONFIRMATION", "full_frame_requires_confirmation"),
        )

    def test_strong_multi_crop_consensus_still_requires_confirmation(self):
        self.assertEqual(
            decide_scan(
                "prima",
                0.98,
                0.80,
                False,
                False,
                False,
                crop_detected=False,
                consensus_verified=True,
            ),
            ("NEED_CONFIRMATION", "full_frame_requires_confirmation"),
        )

    def test_multi_crop_consensus_still_respects_ocr_correction_guard(self):
        self.assertEqual(
            decide_scan(
                "prima",
                1.0,
                1.0,
                True,
                True,
                True,
                crop_detected=False,
                consensus_verified=True,
            ),
            ("NEED_CONFIRMATION", "full_frame_requires_confirmation"),
        )

    def test_risky_multi_crop_class_requires_ocr(self):
        self.assertEqual(
            decide_scan(
                "buah_vita",
                1.0,
                1.0,
                False,
                False,
                False,
                crop_detected=False,
                consensus_verified=True,
            ),
            ("NEED_CONFIRMATION", "full_frame_requires_confirmation"),
        )

    def test_all_confusion_aware_classes_require_ocr_or_confirmation(self):
        for class_name in (
            "teh_sosro_kotak",
            "nabati_coklat",
            "krice",
            "pop_mie_ayam_bawang",
            "buah_vita",
        ):
            with self.subTest(class_name=class_name):
                self.assertEqual(
                    decide_scan(class_name, 1.0, 1.0, False, False, False),
                    ("NEED_CONFIRMATION", "moderate_confidence"),
                )

    def test_similar_product_requires_ocr_or_confirmation(self):
        self.assertEqual(
            decide_scan("nescafe_cappucino", 0.96, 0.70, False, True, False),
            ("NEED_CONFIRMATION", "ocr_mismatch"),
        )

    def test_similar_product_with_ocr_is_accepted(self):
        self.assertEqual(
            decide_scan("nescafe_cappucino", 0.96, 0.70, True, True, False),
            ("ACCEPT", "ocr_verified"),
        )

    def test_ocr_correction_requires_confirmation(self):
        self.assertEqual(
            decide_scan("prima", 0.80, 0.50, True, True, True),
            ("NEED_CONFIRMATION", "ocr_correction_requires_confirmation"),
        )

    def test_high_confidence_ocr_correction_requires_confirmation(self):
        self.assertEqual(
            decide_scan("prima", 1.0, 1.0, True, True, True),
            ("NEED_CONFIRMATION", "ocr_correction_requires_confirmation"),
        )

    def test_low_gap_is_rejected(self):
        self.assertEqual(
            decide_scan("momogi", 0.60, 0.02, False, False, False),
            ("REJECT", "low_gap_threshold"),
        )


if __name__ == "__main__":
    unittest.main()
