import tempfile
import unittest

import torch

from temperature_scaling import fit_temperature, load_temperature, save_calibration


class TemperatureScalingTests(unittest.TestCase):
    def test_fit_reduces_overconfident_validation_nll(self):
        logits = torch.tensor([[8.0, 0.0], [8.0, 0.0], [0.0, 8.0], [0.0, 8.0]])
        labels = torch.tensor([0, 1, 1, 0])
        result = fit_temperature(logits, labels)
        self.assertGreater(result["temperature"], 1.0)
        self.assertLessEqual(result["nll_after"], result["nll_before"])

    def test_saved_temperature_is_loaded(self):
        with tempfile.TemporaryDirectory() as model_dir:
            save_calibration(model_dir, {"temperature": 2.5})
            self.assertEqual(load_temperature(model_dir), 2.5)

    def test_missing_calibration_defaults_to_one(self):
        with tempfile.TemporaryDirectory() as model_dir:
            self.assertEqual(load_temperature(model_dir), 1.0)


if __name__ == "__main__":
    unittest.main()
