import unittest

from PIL import Image

from multi_crop_consensus import classify_with_multi_crop_consensus, summarize_consensus


def prediction(class_name, confidence=0.98, gap=0.80):
    return {
        "class_name": class_name,
        "confidence": confidence,
        "gap": gap,
        "top_results": [],
    }


class FakeClassifier:
    def __init__(self, predictions):
        self.predictions = predictions

    def predict_batch(self, _images):
        return self.predictions


class MultiCropConsensusTests(unittest.TestCase):
    def test_verifies_strong_five_of_five_consensus(self):
        result = summarize_consensus(
            [
                prediction("prima"),
                prediction("prima", 0.97, 0.75),
                prediction("prima", 0.99, 0.90),
                prediction("prima", 0.96, 0.70),
                prediction("prima", 0.99, 0.90),
            ]
        )
        self.assertTrue(result["verified"])
        self.assertEqual(result["class_name"], "prima")
        self.assertEqual(result["votes"], 5)

    def test_rejects_four_of_five_consensus(self):
        result = summarize_consensus(
            [
                prediction("prima"),
                prediction("prima"),
                prediction("prima"),
                prediction("prima"),
                prediction("oreo_original"),
            ]
        )
        self.assertFalse(result["verified"])

    def test_rejects_three_of_five_consensus(self):
        result = summarize_consensus(
            [
                prediction("prima"),
                prediction("prima"),
                prediction("prima"),
                prediction("oreo_original"),
                prediction("oreo_original"),
            ]
        )
        self.assertFalse(result["verified"])

    def test_rejects_weak_consensus(self):
        result = summarize_consensus([prediction("prima", 0.90, 0.30) for _ in range(5)])
        self.assertFalse(result["verified"])

    def test_never_verifies_background(self):
        result = summarize_consensus([prediction("background") for _ in range(5)])
        self.assertFalse(result["verified"])

    def test_rejects_consensus_that_disagrees_with_full_frame(self):
        classifier = FakeClassifier(
            [prediction("oreo_original")]
            + [prediction("buah_vita") for _ in range(5)]
        )
        result = classify_with_multi_crop_consensus(
            classifier,
            Image.new("RGB", (640, 640)),
        )
        self.assertFalse(result["consensus"]["verified"])
        self.assertEqual(result["consensus"]["reason"], "full_frame_disagreement")
        self.assertEqual(result["classification"]["class_name"], "oreo_original")


if __name__ == "__main__":
    unittest.main()
