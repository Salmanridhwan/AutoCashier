import json
import math
import os

import torch
import torch.nn.functional as F


CALIBRATION_FILENAME = "calibration.json"


def expected_calibration_error(logits, labels, temperature=1.0, bins=15):
    logits = torch.as_tensor(logits, dtype=torch.float32)
    labels = torch.as_tensor(labels, dtype=torch.long)
    probabilities = F.softmax(logits / float(temperature), dim=-1)
    confidences, predictions = probabilities.max(dim=-1)
    correct = predictions.eq(labels)
    error = torch.zeros((), dtype=torch.float32)

    for lower in torch.linspace(0, 1, bins + 1)[:-1]:
        upper = lower + (1 / bins)
        mask = confidences.gt(lower) & confidences.le(upper)
        if mask.any():
            error += mask.float().mean() * (
                confidences[mask].mean() - correct[mask].float().mean()
            ).abs()
    return float(error.item())


def fit_temperature(logits, labels):
    logits = torch.as_tensor(logits, dtype=torch.float32).cpu()
    labels = torch.as_tensor(labels, dtype=torch.long).cpu()
    if logits.ndim != 2 or labels.ndim != 1 or len(logits) != len(labels):
        raise ValueError("Expected logits shaped [samples, classes] and labels shaped [samples].")
    if not len(labels):
        raise ValueError("Cannot calibrate an empty validation set.")

    before_nll = float(F.cross_entropy(logits, labels).item())
    log_temperature = torch.zeros((), dtype=torch.float32, requires_grad=True)
    optimizer = torch.optim.LBFGS(
        [log_temperature],
        lr=0.1,
        max_iter=100,
        line_search_fn="strong_wolfe",
    )

    def closure():
        optimizer.zero_grad()
        temperature = log_temperature.exp().clamp(0.05, 20.0)
        loss = F.cross_entropy(logits / temperature, labels)
        loss.backward()
        return loss

    optimizer.step(closure)
    temperature = float(log_temperature.detach().exp().clamp(0.05, 20.0).item())
    after_nll = float(F.cross_entropy(logits / temperature, labels).item())
    if not math.isfinite(after_nll) or after_nll > before_nll:
        temperature = 1.0
        after_nll = before_nll

    return {
        "temperature": round(temperature, 6),
        "validation_samples": int(len(labels)),
        "nll_before": round(before_nll, 6),
        "nll_after": round(after_nll, 6),
        "ece_before": round(expected_calibration_error(logits, labels), 6),
        "ece_after": round(expected_calibration_error(logits, labels, temperature), 6),
    }


def save_calibration(model_dir, calibration):
    path = os.path.join(model_dir, CALIBRATION_FILENAME)
    with open(path, "w", encoding="utf-8") as file:
        json.dump(calibration, file, indent=2)
    return path


def load_temperature(model_dir):
    path = os.path.join(model_dir, CALIBRATION_FILENAME)
    try:
        with open(path, encoding="utf-8") as file:
            temperature = float(json.load(file).get("temperature", 1.0))
        return temperature if math.isfinite(temperature) and temperature > 0 else 1.0
    except (FileNotFoundError, json.JSONDecodeError, TypeError, ValueError, OSError):
        return 1.0
