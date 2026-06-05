import os
import random
from PIL import Image, ImageDraw

CLASSES = ['indomie_goreng', 'aqua_600ml', 'teh_pucuk_350ml']
DATASET_DIR = os.path.join(os.path.dirname(__file__), 'dataset', 'products')

def create_mock_images(num_images_per_class=35):
    os.makedirs(DATASET_DIR, exist_ok=True)
    for class_name in CLASSES:
        class_dir = os.path.join(DATASET_DIR, class_name)
        os.makedirs(class_dir, exist_ok=True)
        print(f"Generating {num_images_per_class} mock images for class '{class_name}'...")
        for i in range(num_images_per_class):
            # Generate a random color image
            img = Image.new('RGB', (224, 224), color=(
                random.randint(0, 255),
                random.randint(0, 255),
                random.randint(0, 255)
            ))
            draw = ImageDraw.Draw(img)
            # Draw some random shapes to make images distinct for basic learning validation
            if class_name == 'indomie_goreng':
                # Yellow background + red circle (mimicking noodle pack)
                draw.rectangle([20, 20, 204, 204], fill=(255, 220, 0))
                draw.ellipse([50, 50, 170, 170], fill=(200, 30, 30))
            elif class_name == 'aqua_600ml':
                # Light blue bottle + white label (water bottle)
                draw.rectangle([60, 10, 164, 214], fill=(100, 200, 255))
                draw.rectangle([60, 90, 164, 130], fill=(255, 255, 255))
            else: # teh_pucuk_350ml
                # Brown bottle + green label (tea bottle)
                draw.rectangle([70, 10, 154, 214], fill=(130, 80, 20))
                draw.rectangle([70, 80, 154, 120], fill=(30, 180, 30))
                
            img_path = os.path.join(class_dir, f"mock_{i+1:03d}.jpg")
            img.save(img_path)
    print("Mock dataset generation completed successfully!")

if __name__ == '__main__':
    create_mock_images()
