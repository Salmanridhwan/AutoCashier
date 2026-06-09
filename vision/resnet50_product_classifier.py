import os
import torch
import torch.nn.functional as F
from PIL import Image
from transformers import AutoImageProcessor, ResNetForImageClassification
from temperature_scaling import load_temperature

class ResNet50ProductClassifier:
    def __init__(self, model_dir="models/resnet50-product-classifier"):
        self.model_dir = model_dir
        if not os.path.exists(model_dir):
            raise FileNotFoundError(
                f"Model directory '{model_dir}' does not exist. Please train the model first."
            )
        
        self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        print(f"[CLASSIFIER] Loading model from '{model_dir}' on device: {self.device}")

        if self.device.type == "cuda":
            torch.backends.cudnn.benchmark = True
            torch.backends.cuda.matmul.allow_tf32 = True
            torch.backends.cudnn.allow_tf32 = True
        
        self.image_processor = AutoImageProcessor.from_pretrained(model_dir)
        self.model = ResNetForImageClassification.from_pretrained(model_dir)
        self.temperature = load_temperature(model_dir)
        print(f"[CLASSIFIER] Temperature scaling: {self.temperature:.4f}")
        self.model.to(self.device)
        if self.device.type == "cuda":
            self.model.to(memory_format=torch.channels_last)
        self.model.eval()

    def predict_batch(self, images: list[Image.Image]):
        if not images:
            return []

        rgb_images = [
            image if image.mode == "RGB" else image.convert("RGB")
            for image in images
        ]
        inputs = self.image_processor(rgb_images, return_tensors="pt")
        if self.device.type == "cuda" and "pixel_values" in inputs:
            inputs["pixel_values"] = inputs["pixel_values"].contiguous(memory_format=torch.channels_last)
        inputs = {k: v.to(self.device, non_blocking=True) for k, v in inputs.items()}

        with torch.inference_mode():
            if self.device.type == "cuda":
                autocast_ctx = torch.autocast(device_type="cuda", dtype=torch.float16)
            else:
                autocast_ctx = torch.autocast(device_type="cpu", enabled=False)
            with autocast_ctx:
                outputs = self.model(**inputs)
            logits = outputs.logits
            batch_probs = F.softmax(logits / self.temperature, dim=-1)

        predictions = []
        for probs in batch_probs:
            num_classes = len(probs)
            k = min(5, num_classes)
            top_probs, top_indices = torch.topk(probs, k=k)
            top_results = []
            for index in range(k):
                class_id = int(top_indices[index].item())
                class_name = (
                    self.model.config.id2label.get(class_id)
                    or self.model.config.id2label.get(str(class_id))
                    or f"class_{class_id}"
                )
                top_results.append(
                    {
                        "class_name": class_name,
                        "confidence": round(float(top_probs[index].item()), 4),
                    }
                )

            gap = float(top_probs[0].item() - top_probs[1].item()) if k > 1 else float(top_probs[0].item())
            predictions.append(
                {
                    "class_name": top_results[0]["class_name"],
                    "confidence": top_results[0]["confidence"],
                    "gap": round(gap, 4),
                    "top_results": top_results,
                }
            )

        return predictions

    def predict(self, image: Image.Image):
        return self.predict_batch([image])[0]
