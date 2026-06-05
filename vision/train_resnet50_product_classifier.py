import os
import json
import argparse
from sklearn.model_selection import train_test_split
from datasets import Dataset, Image
import torch
import numpy as np
from transformers import (
    AutoImageProcessor, 
    ResNetForImageClassification, 
    TrainingArguments, 
    Trainer
)

# Custom data collator to build tensor batches
def collate_fn(batch):
    return {
        'pixel_values': torch.stack([x['pixel_values'] for x in batch]),
        'labels': torch.tensor([x['labels'] for x in batch])
    }

def main():
    parser = argparse.ArgumentParser(description="Fine-tune ResNet-50 for Product Classification")
    parser.add_argument("--data_dir", type=str, default="dataset/products", help="Path to dataset")
    parser.add_argument("--output_dir", type=str, default="models/resnet50-product-classifier", help="Path to save model")
    parser.add_argument("--epochs", type=int, default=10, help="Number of epochs")
    parser.add_argument("--batch_size", type=int, default=2, help="Batch size")
    parser.add_argument("--learning_rate", type=float, default=5e-5, help="Learning rate")
    parser.add_argument("--quick_test", action="store_true", help="Run a quick training test (1 epoch, few steps)")
    args = parser.parse_args()

    data_dir = args.data_dir
    output_dir = args.output_dir

    if not os.path.exists(data_dir):
        raise FileNotFoundError(f"Dataset directory '{data_dir}' not found. Please run generate_mock_dataset.py first.")

    # Read classes
    classes = sorted([d for d in os.listdir(data_dir) if os.path.isdir(os.path.join(data_dir, d))])
    num_labels = len(classes)
    
    if num_labels == 0:
        raise ValueError(f"No class folders found in '{data_dir}'.")

    label2id = {label: str(i) for i, label in enumerate(classes)}
    id2label = {str(i): label for i, label in enumerate(classes)}

    print(f"Detected {num_labels} classes: {classes}")

    # Gather file paths and labels
    file_paths = []
    labels = []
    for label_name in classes:
        class_path = os.path.join(data_dir, label_name)
        for fname in os.listdir(class_path):
            if fname.lower().endswith(('.png', '.jpg', '.jpeg')):
                file_paths.append(os.path.join(class_path, fname))
                labels.append(int(label2id[label_name]))

    if len(file_paths) == 0:
        raise ValueError("No images found in the dataset directories.")

    # Split train/val
    train_paths, val_paths, train_labels, val_labels = train_test_split(
        file_paths, labels, test_size=0.2, stratify=labels, random_state=42
    )

    # Convert to HF Dataset
    def create_dataset(paths, labels):
        return Dataset.from_dict({"image": paths, "label": labels}).cast_column("image", Image())

    train_dataset = create_dataset(train_paths, train_labels)
    val_dataset = create_dataset(val_paths, val_labels)

    # Load image processor
    image_processor = AutoImageProcessor.from_pretrained("microsoft/resnet-50")

    def transform(example_batch):
        # Convert PIL Images to tensors
        inputs = image_processor([x.convert("RGB") for x in example_batch['image']], return_tensors='pt')
        inputs['labels'] = example_batch['label']
        return inputs

    train_dataset.set_transform(transform)
    val_dataset.set_transform(transform)

    # Load pretrained model and replace head
    print("Loading pre-trained microsoft/resnet-50...")
    model = ResNetForImageClassification.from_pretrained(
        "microsoft/resnet-50",
        num_labels=num_labels,
        label2id=label2id,
        id2label=id2label,
        ignore_mismatched_sizes=True
    )

    # Config options based on flags
    epochs = 1 if args.quick_test else args.epochs
    max_steps = 2 if args.quick_test else -1
    logging_steps = 1 if args.quick_test else 10

    training_args = TrainingArguments(
        output_dir=output_dir,
        per_device_train_batch_size=args.batch_size,
        per_device_eval_batch_size=args.batch_size,
        gradient_accumulation_steps=4 if not args.quick_test else 1,
        num_train_epochs=epochs,
        max_steps=max_steps,
        learning_rate=args.learning_rate,
        eval_strategy="epoch" if not args.quick_test else "no",
        save_strategy="epoch" if not args.quick_test else "no",
        logging_steps=logging_steps,
        fp16=torch.cuda.is_available(),
        remove_unused_columns=False,
        push_to_hub=False,
        report_to="none"
    )

    trainer = Trainer(
        model=model,
        args=training_args,
        train_dataset=train_dataset,
        eval_dataset=val_dataset,
        data_collator=collate_fn,
    )

    print("Starting training...")
    trainer.train()
    print("Training finished. Saving model...")

    # Save model and preprocessor
    trainer.save_model(output_dir)
    image_processor.save_pretrained(output_dir)

    # Save class_mapping.json explicitly
    class_mapping = {
        "id2label": id2label,
        "label2id": label2id,
        "labels": classes
    }
    
    with open(os.path.join(output_dir, "class_mapping.json"), "w") as f:
        json.dump(class_mapping, f, indent=2)

    print(f"Model successfully saved to {output_dir}")

if __name__ == "__main__":
    main()
