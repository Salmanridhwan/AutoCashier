import unittest

from scanner_decision import decide_scan


class ScannerDecisionTests(unittest.TestCase):
    def test_product_at_threshold_is_accepted(self):
        self.assertEqual(
            decide_scan("prima", 0.70, 0.01, False, False, False),
            ("ACCEPT", "confidence_threshold"),
        )

    def test_product_above_threshold_is_accepted(self):
        self.assertEqual(
            decide_scan("prima", 0.88, 0.14, False, False, False),
            ("ACCEPT", "confidence_threshold"),
        )

    def test_similar_product_above_threshold_is_accepted(self):
        self.assertEqual(
            decide_scan("nescafe_cappucino", 0.71, 0.01, False, True, False),
            ("ACCEPT", "confidence_threshold"),
        )

    def test_full_frame_above_threshold_is_accepted(self):
        self.assertEqual(
            decide_scan("prima", 0.75, 0.01, False, False, False, crop_detected=False),
            ("ACCEPT", "confidence_threshold"),
        )

    def test_ocr_corrected_product_above_threshold_is_accepted(self):
        self.assertEqual(
            decide_scan("prima", 0.80, 0.01, True, True, True),
            ("ACCEPT", "confidence_threshold"),
        )

    def test_product_below_threshold_is_rejected(self):
        self.assertEqual(
            decide_scan("momogi", 0.69, 0.90, True, True, False),
            ("REJECT", "low_confidence"),
        )


if __name__ == "__main__":
    unittest.main()
