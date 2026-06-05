import os
import random
import json
from PIL import Image
from resnet50_product_classifier import ResNet50ProductClassifier

def run_test():
    print("Testing local ResNet-50 Product Classifier inference...")
    
    # Instantiate the classifier
    try:
        classifier = ResNet50ProductClassifier()
    except Exception as e:
        print(f"Error loading classifier: {e}")
        return
        
    # Find a random image from the mock dataset to test
    dataset_dir = os.path.join(os.path.dirname(__file__), "dataset", "products")
    if not os.path.exists(dataset_dir):
        print(f"Dataset directory '{dataset_dir}' not found. Generating a random PIL image for testing...")
        test_img = Image.new("RGB", (224, 224), color=(100, 200, 100))
    else:
        classes = [d for d in os.listdir(dataset_dir) if os.path.isdir(os.path.join(dataset_dir, d))]
        if not classes:
            print("No class folders found. Generating a random PIL image for testing...")
            test_img = Image.new("RGB", (224, 224), color=(100, 200, 100))
        else:
            random_class = random.choice(classes)
            class_dir = os.path.join(dataset_dir, random_class)
            images = [f for f in os.listdir(class_dir) if f.lower().endswith(('.jpg', '.jpeg', '.png'))]
            if not images:
                print(f"No images found in '{random_class}' folder. Generating a random PIL image for testing...")
                test_img = Image.new("RGB", (224, 224), color=(100, 200, 100))
            else:
                img_name = random.choice(images)
                img_path = os.path.join(class_dir, img_name)
                print(f"Loading test image: {img_path} (Class: {random_class})")
                test_img = Image.open(img_path)
                
    # Run prediction
    try:
        results = classifier.predict(test_img)
        print("\nPrediction Results:")
        print(json.dumps(results, indent=2))
        print("\nInference test PASSED successfully!")
    except Exception as e:
        print(f"Inference prediction failed: {e}")

if __name__ == "__main__":
    run_test()
