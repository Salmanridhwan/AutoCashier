"""
Export the trained AutoCashier vision server into a single deployable .zip file.

Usage (from the vision/ directory):
    .venv\\Scripts\\python.exe export_model.py

This produces:  autocashier_vision_deploy.zip
Copy this file to the cashier laptop, extract it, create a venv,
install requirements_serve.txt, fill in .env, and run vision_server.py.
"""

import os
import shutil
import zipfile
import sys
import json
from datetime import datetime


# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))

# Python source files required by the vision server at runtime
REQUIRED_PYTHON_FILES = [
    "vision_server.py",
    "resnet50_product_classifier.py",
    "ocr_verifier.py",
    "product_repository.py",
    "product_cropper.py",
    "multi_crop_consensus.py",
    "scanner_decision.py",
    "temperature_scaling.py",
    "prepare_classifier_dataset.py",
    "evaluate_end_to_end.py",
    "train_resnet50_product_classifier.py",
    "calibrate_temperature.py",
]

# Model directory that contains the trained weights
MODEL_DIR = os.path.join(SCRIPT_DIR, "models", "resnet50-product-classifier")

# Essential model files (skip large checkpoint folders, evaluation reports, etc.)
ESSENTIAL_MODEL_FILES = [
    "model.safetensors",
    "config.json",
    "preprocessor_config.json",
    "calibration.json",
    "class_mapping.json",
    "metrics.json",
    "split_manifest.json",
]

# YOLO-World weights
YOLO_WEIGHTS = "yolov8s-world.pt"

# Inference-only requirements
REQUIREMENTS_FILE = "requirements_serve.txt"

# Output zip name
OUTPUT_ZIP = os.path.join(SCRIPT_DIR, "autocashier_vision_deploy.zip")


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def check_prerequisites():
    """Verify all required files exist before packaging."""
    missing = []

    for fname in REQUIRED_PYTHON_FILES:
        path = os.path.join(SCRIPT_DIR, fname)
        if not os.path.isfile(path):
            missing.append(f"Python file: {fname}")

    if not os.path.isdir(MODEL_DIR):
        missing.append(f"Model directory: {MODEL_DIR}")
    else:
        for mfile in ESSENTIAL_MODEL_FILES:
            path = os.path.join(MODEL_DIR, mfile)
            if not os.path.isfile(path):
                missing.append(f"Model file: models/resnet50-product-classifier/{mfile}")

    yolo_path = os.path.join(SCRIPT_DIR, YOLO_WEIGHTS)
    if not os.path.isfile(yolo_path):
        missing.append(f"YOLO weights: {YOLO_WEIGHTS}")

    req_path = os.path.join(SCRIPT_DIR, REQUIREMENTS_FILE)
    if not os.path.isfile(req_path):
        missing.append(f"Requirements file: {REQUIREMENTS_FILE}")

    return missing


def create_env_example():
    """Generate a .env.example template string."""
    return (
        "# AutoCashier Vision Server environment variables\n"
        "# Copy this file to .env and fill in the values.\n"
        "\n"
        "SUPABASE_URL=https://your-project.supabase.co\n"
        "SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here\n"
        "\n"
        "# Optional overrides\n"
        "# MODEL_DIR=models/resnet50-product-classifier\n"
    )


def create_readme():
    """Generate a README for the deployment package."""
    return """# AutoCashier Vision Server — Deployment Package

## Langkah-langkah Setup di Laptop Kasir

### 1. Ekstrak file zip ini ke folder pilihan Anda
Contoh: `C:\\AutoCashier\\vision\\`

### 2. Buat Virtual Environment
```powershell
cd C:\\AutoCashier\\vision
python -m venv .venv
```

### 3. Aktifkan Virtual Environment
```powershell
.\\.venv\\Scripts\\Activate.ps1
```

### 4. Install Dependencies
```powershell
pip install -r requirements_serve.txt
```

> **Catatan**: Jika laptop kasir memiliki GPU NVIDIA, install PyTorch versi CUDA:
> ```powershell
> pip install torch torchvision --index-url https://download.pytorch.org/whl/cu126
> pip install -r requirements_serve.txt
> ```
> Jika tidak ada GPU, PyTorch CPU akan otomatis terinstall dan server tetap berjalan
> (hanya sedikit lebih lambat).

### 5. Konfigurasi Environment
```powershell
Copy-Item .env.example .env
```
Edit file `.env` dan isi kredensial Supabase Anda.

### 6. Jalankan Server
```powershell
.\\.venv\\Scripts\\python.exe vision_server.py
```

Server akan berjalan di `http://localhost:5002`.

### 7. Verifikasi
Buka browser dan akses: `http://localhost:5002/health`
Jika muncul response JSON, server berjalan dengan benar.

## Update Model
Jika model dilatih ulang di laptop pelatihan, jalankan kembali `export_model.py`
di laptop pelatihan, salin file `.zip` baru, dan ekstrak ulang (timpa file lama).
"""


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    print("=" * 60)
    print("  AutoCashier Vision Server — Model Export Tool")
    print("=" * 60)
    print()

    # 1. Check prerequisites
    missing = check_prerequisites()
    if missing:
        print("❌ Beberapa file yang dibutuhkan tidak ditemukan:\n")
        for item in missing:
            print(f"   - {item}")
        print("\nPastikan Anda sudah melatih model sebelum menjalankan export.")
        sys.exit(1)

    print("✅ Semua file yang dibutuhkan ditemukan.\n")

    # 2. Build the zip
    if os.path.exists(OUTPUT_ZIP):
        os.remove(OUTPUT_ZIP)

    file_count = 0
    total_size = 0

    with zipfile.ZipFile(OUTPUT_ZIP, "w", zipfile.ZIP_DEFLATED, compresslevel=6) as zf:
        # Python source files
        for fname in REQUIRED_PYTHON_FILES:
            src = os.path.join(SCRIPT_DIR, fname)
            zf.write(src, fname)
            file_count += 1
            total_size += os.path.getsize(src)
            print(f"  + {fname}")

        # requirements_serve.txt
        req_src = os.path.join(SCRIPT_DIR, REQUIREMENTS_FILE)
        zf.write(req_src, REQUIREMENTS_FILE)
        file_count += 1
        total_size += os.path.getsize(req_src)
        print(f"  + {REQUIREMENTS_FILE}")

        # Model files
        for mfile in ESSENTIAL_MODEL_FILES:
            src = os.path.join(MODEL_DIR, mfile)
            if os.path.isfile(src):
                arcname = f"models/resnet50-product-classifier/{mfile}"
                zf.write(src, arcname)
                fsize = os.path.getsize(src)
                file_count += 1
                total_size += fsize
                print(f"  + {arcname} ({fsize / (1024*1024):.1f} MB)" if fsize > 1024*1024 else f"  + {arcname}")

        # YOLO weights
        yolo_src = os.path.join(SCRIPT_DIR, YOLO_WEIGHTS)
        zf.write(yolo_src, YOLO_WEIGHTS)
        yolo_size = os.path.getsize(yolo_src)
        file_count += 1
        total_size += yolo_size
        print(f"  + {YOLO_WEIGHTS} ({yolo_size / (1024*1024):.1f} MB)")

        # .env.example
        zf.writestr(".env.example", create_env_example())
        file_count += 1
        print("  + .env.example")

        # README
        zf.writestr("README.md", create_readme())
        file_count += 1
        print("  + README.md")

        # Export metadata
        metadata = {
            "exported_at": datetime.now().isoformat(),
            "source_machine": os.environ.get("COMPUTERNAME", "unknown"),
            "files_count": file_count,
            "total_uncompressed_bytes": total_size,
        }

        # Read model metrics if available
        metrics_path = os.path.join(MODEL_DIR, "metrics.json")
        if os.path.isfile(metrics_path):
            try:
                with open(metrics_path, encoding="utf-8") as f:
                    metrics = json.load(f)
                metadata["model_accuracy"] = metrics.get("accuracy")
                metadata["model_classes"] = metrics.get("num_classes")
                metadata["model_labels"] = metrics.get("labels")
            except Exception:
                pass

        zf.writestr("export_metadata.json", json.dumps(metadata, indent=2))
        file_count += 1
        print("  + export_metadata.json")

    zip_size = os.path.getsize(OUTPUT_ZIP)
    print()
    print("=" * 60)
    print(f"✅ Export berhasil!")
    print(f"   File: {OUTPUT_ZIP}")
    print(f"   Ukuran: {zip_size / (1024*1024):.1f} MB ({file_count} files)")
    print(f"   Uncompressed: {total_size / (1024*1024):.1f} MB")
    print()
    print("📋 Langkah selanjutnya:")
    print("   1. Salin file .zip ke laptop kasir")
    print("   2. Ekstrak ke folder vision/")
    print("   3. Buat venv & install: pip install -r requirements_serve.txt")
    print("   4. Isi file .env dengan kredensial Supabase")
    print("   5. Jalankan: python vision_server.py")
    print("=" * 60)


if __name__ == "__main__":
    main()
