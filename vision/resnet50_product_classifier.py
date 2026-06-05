import os
import torch
import torch.nn.functional as F
from PIL import Image
from transformers import AutoImageProcessor, ResNetForImageClassification

class ResNet50ProductClassifier:
    def __init__(self, model_dir="models/resnet50-product-classifier"):
        self.model_dir = model_dir
        if not os.path.exists(model_dir):
            raise FileNotFoundError(
                f"Model directory '{model_dir}' does not exist. Please train the model first."
            )
        
        self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        print(f"[CLASSIFIER] Loading model from '{model_dir}' on device: {self.device}")
        
        self.image_processor = AutoImageProcessor.from_pretrained(model_dir)
        self.model = ResNetForImageClassification.from_pretrained(model_dir)
        self.model.to(self.device)
        self.model.eval()

    def predict(self, image: Image.Image):
        # Convert PIL Image to RGB mode if it isn't already
        if image.mode != "RGB":
            image = image.convert("RGB")
            
        inputs = self.image_processor(image, return_tensors="pt")
        inputs = {k: v.to(self.device) for k, v in inputs.items()}
        
        with torch.no_grad():
            outputs = self.model(**inputs)
            logits = outputs.logits
            probs = F.softmax(logits, dim=-1).squeeze(0)
            
        # Get top-5 predictions (or less if the total classes is less than 5)
        num_classes = len(probs)
        k = min(5, num_classes)
        top_probs, top_indices = torch.topk(probs, k=k)
        
        top_results = []
        for i in range(k):
            class_id_int = int(top_indices[i].item())
            class_name = self.model.config.id2label.get(class_id_int) or self.model.config.id2label.get(str(class_id_int)) or f"class_{class_id_int}"
            confidence = float(top_probs[i].item())
            top_results.append({
                "class_name": class_name,
                "confidence": round(confidence, 4)
            })
            
        top_1 = top_results[0]
        
        # Calculate Gap (difference between top-1 and top-2)
        if k > 1:
            gap = float(top_probs[0].item() - top_probs[1].item())
        else:
            gap = float(top_probs[0].item())
            
        return {
            "class_name": top_1["class_name"],
            "confidence": round(top_1["confidence"], 4),
            "gap": round(gap, 4),
            "top_results": top_results
        }
