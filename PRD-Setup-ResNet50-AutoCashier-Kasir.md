# PRD — Setup ResNet-50 Product Scanner untuk AutoCashier-Kasir

## 1. Informasi Dokumen

| Item | Detail |
|---|---|
| Nama Dokumen | Product Requirements Document — ResNet-50 Product Scanner |
| Project | AutoCashier-Kasir |
| Modul | AI Product Scanner / Vision Server |
| Versi | 1.0 |
| Target Implementasi | Fine-tune dan deploy ResNet-50 untuk klasifikasi 300 produk kasir |
| Format Model | Hugging Face Transformers |
| Model Base | `microsoft/resnet-50` |
| Target Penggunaan | Scanner produk kasir berbasis kamera |
| Status | Draft implementasi |

---

## 2. Latar Belakang

AutoCashier-Kasir adalah sistem POS berbasis web yang memiliki fitur utama scan produk menggunakan kamera dan AI Vision. Sistem ini memiliki alur transaksi dari scan produk, identifikasi member, cart, pembayaran QRIS, checkout, poin loyalitas, dan verifikasi struk.

Masalah utama pada scanner saat ini:

1. Deteksi produk masih sering salah.
2. Model similarity seperti DINOv2 tidak benar-benar dilatih khusus pada katalog produk toko.
3. Produk dengan kemasan mirip mudah tertukar.
4. Hasil dari satu frame kamera dapat langsung masuk ke cart.
5. Belum ada sistem validasi kuat berbasis confidence, gap, OCR, voting, dan konfirmasi manual.
6. Target penggunaan adalah langsung di lapangan, sehingga kesalahan otomatis harus ditekan semaksimal mungkin.

Untuk meningkatkan akurasi dan reliability, sistem akan menggunakan **ResNet-50 fine-tuned pada katalog 300 produk** sebagai model klasifikasi utama.

---

## 3. Tujuan

### 3.1 Tujuan Utama

Membangun dan mengintegrasikan model **ResNet-50 fine-tuned** ke dalam Vision Server AutoCashier-Kasir agar sistem dapat mengenali produk dari kamera kasir secara lebih akurat dan aman.

### 3.2 Tujuan Detail

1. Menyiapkan dataset gambar untuk 300 produk.
2. Melatih model `microsoft/resnet-50` sebagai classifier 300 class.
3. Mengintegrasikan model hasil training ke Vision Server.
4. Menambahkan response decision: `ACCEPT`, `NEED_CONFIRMATION`, dan `REJECT`.
5. Menambahkan validasi confidence dan gap antar kandidat.
6. Mengintegrasikan OCR sebagai verifier kedua.
7. Menambahkan mekanisme voting beberapa frame di frontend.
8. Menyediakan endpoint baru `/detect-v2` agar scanner lama tetap aman sebagai fallback.
9. Menyimpan log hasil scan untuk evaluasi dan retraining.
10. Mengurangi risiko produk salah masuk cart.

---

## 4. Non-Goal

Hal-hal berikut tidak termasuk dalam scope fase pertama:

1. Membuat object detection model baru dari nol.
2. Menghapus total scanner lama pada implementasi awal.
3. Menjamin 100% tidak ada kesalahan AI.
4. Menghilangkan kebutuhan konfirmasi kasir sepenuhnya.
5. Membuat sistem barcode scanner penuh.
6. Menggunakan Hugging Face hosted API sebagai scanner utama.
7. Deploy multi-server production penuh.
8. Auto-retraining otomatis tanpa validasi manusia.
9. Mendeteksi beberapa produk sekaligus dalam satu frame pada fase awal.

---

## 5. Definisi Sukses

Implementasi dianggap berhasil jika:

1. Model ResNet-50 berhasil di-fine-tune pada 300 produk.
2. Model dapat menghasilkan prediksi class produk berdasarkan crop gambar.
3. Vision Server memiliki endpoint `/detect-v2`.
4. Endpoint `/detect-v2` mengembalikan:
   - `decision`
   - `product`
   - `confidence`
   - `gap`
   - `classification`
   - `ocr`
5. Frontend dapat membedakan hasil:
   - `ACCEPT`
   - `NEED_CONFIRMATION`
   - `REJECT`
6. Produk hanya otomatis masuk cart jika confidence tinggi, gap aman, OCR cocok, dan voting lolos.
7. Hasil ragu masuk modal konfirmasi.
8. Hasil tidak yakin ditolak atau diminta scan ulang.
9. Scanner lama masih bisa digunakan sebagai fallback.
10. Semua hasil scan penting tersimpan untuk evaluasi.

---

## 6. Target Pengguna

### 6.1 Kasir

Kasir menggunakan kamera untuk scan produk dan mengelola cart.

Kebutuhan kasir:

1. Scan harus cepat.
2. Hasil scan harus jelas.
3. Jika sistem ragu, kasir diberi pilihan konfirmasi.
4. Kasir bisa membatalkan hasil scan yang salah.
5. Kasir tetap bisa bekerja jika AI gagal mengenali produk.

### 6.2 Admin / Branch Admin

Admin mengelola produk, dataset, dan validasi hasil scan.

Kebutuhan admin:

1. Menambahkan produk baru ke katalog.
2. Mengisi `ai_class_name`.
3. Mengisi `ocr_keywords`.
4. Melihat produk yang sering salah scan.
5. Menggunakan log scan untuk retraining.

### 6.3 Developer / ML Engineer

Developer menyiapkan dataset, training, dan deployment model.

Kebutuhan developer:

1. Script training yang jelas.
2. Struktur dataset konsisten.
3. Model output mudah diintegrasikan.
4. Endpoint Vision Server terdokumentasi.
5. Logging cukup untuk debugging.

---

## 7. Scope Fitur

### 7.1 Fitur dalam Scope

| Fitur | Status |
|---|---|
| Dataset 300 produk | In scope |
| Fine-tune ResNet-50 | In scope |
| Inference ResNet-50 lokal | In scope |
| `/detect-v2` endpoint | In scope |
| OCR verifier | In scope |
| Confidence threshold | In scope |
| Gap threshold | In scope |
| Decision engine | In scope |
| Frontend voting | In scope |
| Manual confirmation | In scope |
| Scan logging | In scope |
| Fallback ke scanner lama | In scope |

### 7.2 Fitur di Luar Scope

| Fitur | Status |
|---|---|
| Multi-object detection otomatis banyak produk | Out of scope fase 1 |
| Barcode scanner hardware integration | Out of scope fase 1 |
| Auto-training pipeline penuh | Out of scope fase 1 |
| Deployment cloud autoscaling | Out of scope fase 1 |
| Mobile app native | Out of scope fase 1 |

---

## 8. Ringkasan Solusi

Sistem baru menggunakan pipeline:

```text
Camera Frame
→ YOLO detect object
→ Crop produk
→ ResNet-50 classifier
→ Ambil top-5 prediction
→ Hitung confidence dan gap
→ Ambil product dari Supabase berdasarkan ai_class_name
→ OCR verifier membaca teks kemasan
→ Decision engine
→ Frontend voting
→ Add to cart / manual confirmation / reject
```

---

## 9. Arsitektur Sistem

### 9.1 Arsitektur Level Tinggi

```text
Frontend React Scanner
        |
        | image frame / crop
        v
Backend Express Vision Proxy
        |
        v
Vision Server FastAPI
        |
        | YOLO crop
        v
ResNet-50 Product Classifier
        |
        | predicted class
        v
Product Repository Supabase
        |
        | product metadata + ocr keywords
        v
OCR Verifier
        |
        v
Decision Engine
        |
        v
Frontend Result Handler
        |
        v
Cart / Confirmation / Reject
```

### 9.2 Endpoint Baru

Endpoint baru:

```text
POST /detect-v2
```

Endpoint lama tetap dipertahankan:

```text
POST /detect
```

Tujuan:

```text
/detect    = scanner lama / fallback
/detect-v2 = scanner baru ResNet-50 + OCR
```

---

## 10. Dataset Requirement

### 10.1 Jumlah Produk

Total produk:

```text
300 produk
```

Setiap produk menjadi satu class model.

### 10.2 Struktur Dataset

Folder dataset:

```text
vision/
└── dataset/
    └── products/
        ├── produk_001/
        │   ├── 001.jpg
        │   ├── 002.jpg
        │   └── ...
        ├── produk_002/
        │   ├── 001.jpg
        │   └── ...
        └── produk_300/
            ├── 001.jpg
            └── ...
```

Contoh nyata:

```text
dataset/products/indomie_goreng/
dataset/products/aqua_600ml/
dataset/products/teh_pucuk_350ml/
dataset/products/mie_sedaap_goreng/
```

### 10.3 Aturan Nama Class

Nama folder harus:

1. Huruf kecil.
2. Tanpa spasi.
3. Menggunakan underscore.
4. Tidak memakai simbol khusus.
5. Sama persis dengan `products.ai_class_name`.

Contoh benar:

```text
indomie_goreng
aqua_600ml
teh_pucuk_350ml
mie_sedaap_goreng
```

Contoh salah:

```text
Indomie Goreng
aqua 600 ml
teh-pucuk!
Mie Sedaap (Goreng)
```

### 10.4 Jumlah Foto

| Target | Foto per Produk | Total Foto |
|---|---:|---:|
| Prototype awal | 30 | 9.000 |
| Uji lapangan awal | 50 | 15.000 |
| Stabil | 100 | 30.000 |
| Ideal | 200–300 | 60.000–90.000 |

Rekomendasi fase awal:

```text
Minimal 50 foto per produk
Total sekitar 15.000 gambar
```

### 10.5 Variasi Foto

Setiap produk harus difoto dengan variasi:

1. Depan.
2. Belakang.
3. Samping kiri.
4. Samping kanan.
5. Sudut 45 derajat.
6. Pencahayaan terang.
7. Pencahayaan redup.
8. Produk agak miring.
9. Produk sedikit blur.
10. Produk dipegang tangan.
11. Background meja kasir.
12. Jarak scan asli.
13. Kamera yang sama dengan kamera kasir.

### 10.6 Produk Mirip

Produk mirip wajib diberi foto lebih banyak.

Contoh produk rawan tertukar:

```text
Indomie Goreng vs Indomie Rendang
Aqua 600ml vs Aqua 1500ml
Teh Pucuk 350ml vs Teh Pucuk 500ml
Kopi ABC Susu vs Kopi ABC Mocca
Mie Sedaap Goreng vs Indomie Goreng
```

Aturan:

```text
Produk mirip minimal 100 foto per produk.
```

---

## 11. Database Requirement

### 11.1 Update Tabel Products

Tambahkan kolom berikut ke tabel `products`:

```sql
alter table products
add column if not exists ai_class_name text;

alter table products
add column if not exists ocr_keywords text[] default '{}';

alter table products
add column if not exists ai_enabled boolean default true;
```

### 11.2 Fungsi Kolom

| Kolom | Tipe | Fungsi |
|---|---|---|
| `ai_class_name` | text | Nama class model, sama dengan nama folder dataset |
| `ocr_keywords` | text[] | Kata kunci OCR untuk validasi teks kemasan |
| `ai_enabled` | boolean | Menentukan apakah produk aktif untuk scanner AI |

### 11.3 Contoh Data

| name | ai_class_name | ocr_keywords | ai_enabled |
|---|---|---|---|
| Indomie Goreng | `indomie_goreng` | `{indomie,goreng}` | true |
| Aqua 600ml | `aqua_600ml` | `{aqua}` | true |
| Teh Pucuk 350ml | `teh_pucuk_350ml` | `{teh,pucuk}` | true |
| Mie Sedaap Goreng | `mie_sedaap_goreng` | `{sedaap,goreng}` | true |

### 11.4 Contoh Update SQL

```sql
update products
set
  ai_class_name = 'indomie_goreng',
  ocr_keywords = array['indomie', 'goreng'],
  ai_enabled = true
where name ilike '%indomie%goreng%';
```

---

## 12. Scan Logging Requirement

### 12.1 Tabel Log

Buat tabel:

```sql
create table if not exists product_scan_logs (
  id uuid primary key default gen_random_uuid(),
  product_id uuid null,
  predicted_class text,
  confidence numeric,
  gap numeric,
  decision text,
  ocr_text text,
  ocr_score numeric,
  is_correct boolean null,
  corrected_product_id uuid null,
  image_url text null,
  source text default 'detect-v2',
  created_at timestamp with time zone default now()
);
```

### 12.2 Tujuan Logging

Logging digunakan untuk:

1. Melacak produk yang sering salah.
2. Menganalisis confidence dan gap.
3. Mengumpulkan gambar untuk retraining.
4. Mengetahui apakah OCR sering gagal.
5. Memvalidasi apakah threshold terlalu ketat atau longgar.

### 12.3 Data yang Wajib Disimpan

| Field | Wajib | Keterangan |
|---|---|---|
| `predicted_class` | Ya | Class prediksi model |
| `confidence` | Ya | Confidence top-1 |
| `gap` | Ya | Selisih top-1 dan top-2 |
| `decision` | Ya | ACCEPT / NEED_CONFIRMATION / REJECT |
| `ocr_text` | Ya jika ada | Teks hasil OCR |
| `ocr_score` | Ya jika ada | Skor OCR |
| `product_id` | Jika dikenali | Product hasil prediksi |
| `is_correct` | Opsional | Diisi jika kasir/admin memberi feedback |
| `corrected_product_id` | Opsional | Produk benar jika prediksi salah |
| `image_url` | Direkomendasikan | URL crop produk |

---

## 13. Model Requirement

### 13.1 Base Model

Model yang digunakan:

```text
microsoft/resnet-50
```

### 13.2 Task

Task:

```text
Image Classification
```

Output:

```text
300 class produk
```

### 13.3 Input

Input model:

```text
RGB image
224 × 224 px
```

### 13.4 Output Model

Model menghasilkan logits untuk 300 class.

Output inference yang dibutuhkan:

```json
{
  "class_name": "indomie_goreng",
  "confidence": 0.93,
  "gap": 0.21,
  "top_results": [
    {
      "class_name": "indomie_goreng",
      "confidence": 0.93
    },
    {
      "class_name": "mie_sedaap_goreng",
      "confidence": 0.72
    },
    {
      "class_name": "indomie_rendang",
      "confidence": 0.41
    }
  ]
}
```

### 13.5 Training Hardware

Target laptop:

```text
RAM: 32 GB
GPU: RTX 3050 Laptop
VRAM: 4 GB
```

### 13.6 Training Configuration

Konfigurasi awal:

```python
MODEL_NAME = "microsoft/resnet-50"
BATCH_SIZE = 2
GRADIENT_ACCUMULATION_STEPS = 4
EPOCHS = 10
LEARNING_RATE = 5e-5
IMG_SIZE = 224
FP16 = True
```

Jika VRAM masih aman:

```python
BATCH_SIZE = 4
GRADIENT_ACCUMULATION_STEPS = 4
```

Jika terjadi CUDA out of memory:

```python
BATCH_SIZE = 1
GRADIENT_ACCUMULATION_STEPS = 8
```

---

## 14. Training Pipeline Requirement

### 14.1 Dependency

Install:

```bash
pip install transformers datasets evaluate accelerate torch torchvision pillow scikit-learn
```

Tambahan untuk Vision Server:

```bash
pip install fastapi uvicorn python-multipart opencv-python easyocr rapidfuzz supabase ultralytics numpy
```

### 14.2 Output Training

Training harus menghasilkan folder:

```text
vision/models/resnet50-product-classifier/
├── config.json
├── model.safetensors
├── preprocessor_config.json
├── training_args.bin
└── class_mapping.json
```

### 14.3 Class Mapping

File `class_mapping.json` harus berisi:

```json
{
  "id2label": {
    "0": "aqua_600ml",
    "1": "indomie_goreng"
  },
  "label2id": {
    "aqua_600ml": "0",
    "indomie_goreng": "1"
  },
  "labels": [
    "aqua_600ml",
    "indomie_goreng"
  ]
}
```

---

## 15. Script Training Requirement

File:

```text
vision/train_resnet50_product_classifier.py
```

Requirement script:

1. Membaca dataset dari `dataset/products`.
2. Melakukan split train/test 80:20.
3. Menggunakan stratified split berdasarkan label.
4. Menggunakan augmentation ringan.
5. Menggunakan `microsoft/resnet-50`.
6. Mengubah output head menjadi 300 class.
7. Menggunakan fp16 jika CUDA tersedia.
8. Menyimpan model terbaik.
9. Menyimpan image processor.
10. Menyimpan class mapping.

### 15.1 Konfigurasi Utama

```python
DATA_DIR = "dataset/products"
OUTPUT_DIR = "models/resnet50-product-classifier"
MODEL_NAME = "microsoft/resnet-50"

BATCH_SIZE = 2
GRADIENT_ACCUMULATION_STEPS = 4
EPOCHS = 10
LEARNING_RATE = 5e-5
IMG_SIZE = 224
```

---

## 16. Inference Requirement

### 16.1 File Classifier

File:

```text
vision/resnet50_product_classifier.py
```

Requirement:

1. Load model dari `models/resnet50-product-classifier`.
2. Load image processor.
3. Menerima input PIL Image.
4. Convert ke RGB.
5. Return top-5 prediction.
6. Hitung `confidence`.
7. Hitung `gap`.
8. Return format JSON-safe.

### 16.2 Output Function

```python
{
  "class_name": "indomie_goreng",
  "confidence": 0.93,
  "gap": 0.21,
  "top_results": [
    {"class_name": "indomie_goreng", "confidence": 0.93},
    {"class_name": "mie_sedaap_goreng", "confidence": 0.72}
  ]
}
```

---

## 17. OCR Requirement

### 17.1 OCR Engine

Fase awal menggunakan:

```text
EasyOCR
```

### 17.2 Fungsi OCR

OCR digunakan sebagai verifier, bukan sebagai classifier utama.

Input:

```text
crop produk
```

Output:

```json
{
  "passed": true,
  "reason": "matched",
  "ocr_text": "indomie goreng",
  "score": 92
}
```

### 17.3 OCR Matching

OCR mencocokkan teks dengan `products.ocr_keywords`.

Contoh:

```text
ocr_text = "indomie goreng spesial"
ocr_keywords = ["indomie", "goreng"]
result = passed
```

Contoh gagal:

```text
ocr_text = "abc kopi susu"
ocr_keywords = ["indomie", "goreng"]
result = failed
```

### 17.4 OCR Threshold

Threshold awal:

```text
OCR_SCORE_THR = 70
```

---

## 18. Product Repository Requirement

### 18.1 File

File:

```text
vision/product_repository.py
```

### 18.2 Fungsi

Product Repository harus:

1. Membaca produk dari Supabase.
2. Hanya mengambil produk `ai_enabled = true`.
3. Menyimpan cache `products_by_class`.
4. Mencari produk berdasarkan `ai_class_name`.
5. Memiliki fungsi refresh.

### 18.3 Environment Variable

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

Penting:

```text
Service role key hanya boleh berada di server.
Jangan pernah dimasukkan ke frontend.
```

---

## 19. Decision Engine Requirement

### 19.1 Decision Type

Sistem harus menghasilkan salah satu:

```text
ACCEPT
NEED_CONFIRMATION
REJECT
```

### 19.2 Aturan Awal

```text
ACCEPT:
confidence >= 0.90
gap >= 0.15
OCR passed = true

NEED_CONFIRMATION:
confidence >= 0.70
gap >= 0.10
tetapi belum memenuhi ACCEPT

REJECT:
confidence < 0.70
atau gap < 0.10
atau product tidak ditemukan
```

### 19.3 Produk Mirip

Untuk produk yang sangat mirip, threshold bisa dinaikkan:

```text
ACCEPT:
confidence >= 0.93
gap >= 0.20
OCR passed = true
```

### 19.4 Matrix

| Confidence | Gap | OCR | Decision |
|---:|---:|---|---|
| >= 0.90 | >= 0.15 | Match | ACCEPT |
| >= 0.90 | >= 0.15 | Tidak match | NEED_CONFIRMATION |
| 0.70–0.89 | >= 0.10 | Apa pun | NEED_CONFIRMATION |
| < 0.70 | Apa pun | Apa pun | REJECT |
| Apa pun | < 0.10 | Apa pun | REJECT / NEED_CONFIRMATION |

---

## 20. API Requirement

### 20.1 Endpoint

```http
POST /detect-v2
Content-Type: multipart/form-data
```

### 20.2 Request

Field:

```text
file: image
```

Optional:

```text
branch_id
camera_id
debug
```

### 20.3 Success Response — ACCEPT

```json
{
  "success": true,
  "decision": "ACCEPT",
  "product": {
    "id": "uuid",
    "name": "Indomie Goreng",
    "price": 3500,
    "ai_class_name": "indomie_goreng"
  },
  "confidence": 0.94,
  "gap": 0.22,
  "classification": {
    "class_name": "indomie_goreng",
    "confidence": 0.94,
    "gap": 0.22,
    "top_results": [
      {
        "class_name": "indomie_goreng",
        "confidence": 0.94
      },
      {
        "class_name": "mie_sedaap_goreng",
        "confidence": 0.72
      }
    ]
  },
  "ocr": {
    "passed": true,
    "reason": "matched",
    "ocr_text": "indomie goreng",
    "score": 92
  }
}
```

### 20.4 Success Response — NEED_CONFIRMATION

```json
{
  "success": true,
  "decision": "NEED_CONFIRMATION",
  "product": {
    "id": "uuid",
    "name": "Indomie Goreng",
    "price": 3500,
    "ai_class_name": "indomie_goreng"
  },
  "confidence": 0.76,
  "gap": 0.13,
  "classification": {
    "class_name": "indomie_goreng",
    "confidence": 0.76,
    "gap": 0.13,
    "top_results": []
  },
  "ocr": {
    "passed": false,
    "reason": "no_text_detected",
    "ocr_text": "",
    "score": 0
  }
}
```

### 20.5 Response — REJECT

```json
{
  "success": false,
  "decision": "REJECT",
  "product": null,
  "reason": "low_confidence",
  "confidence": 0.42,
  "gap": 0.04,
  "classification": {
    "class_name": "indomie_goreng",
    "confidence": 0.42,
    "gap": 0.04,
    "top_results": []
  },
  "ocr": {
    "passed": false,
    "reason": "not_run",
    "ocr_text": "",
    "score": 0
  }
}
```

### 20.6 Error Response

```json
{
  "success": false,
  "decision": "REJECT",
  "error": "model_not_loaded",
  "message": "ResNet-50 classifier failed to load"
}
```

---

## 21. Frontend Requirement

### 21.1 Scanner Flow

Frontend harus menangani response:

```text
ACCEPT
NEED_CONFIRMATION
REJECT
```

### 21.2 ACCEPT

Jika `decision = ACCEPT`, frontend tidak langsung add to cart sebelum voting lolos.

Flow:

```text
ACCEPT dari backend
→ masukkan product_id ke detectionBuffer
→ jika product_id muncul minimal 3 dari 5 frame
→ add to cart
```

### 21.3 NEED_CONFIRMATION

Jika `decision = NEED_CONFIRMATION`, tampilkan modal:

```text
Apakah produk ini benar?

Produk: Indomie Goreng
Confidence: 76%
OCR: tidak terbaca
Tombol:
[Benar, tambahkan]
[Salah, scan ulang]
```

### 21.4 REJECT

Jika `decision = REJECT`, tampilkan status:

```text
Produk tidak dikenali, coba scan ulang.
```

### 21.5 Voting

Konfigurasi:

```text
VOTE_WINDOW = 5
VOTE_THRESHOLD = 3
```

Artinya:

```text
Produk harus muncul minimal 3 kali dari 5 frame terakhir.
```

---

## 22. Backend Express Requirement

Jika backend Express menjadi proxy ke Vision Server:

### 22.1 Route Baru

Tambahkan route:

```text
POST /api/kasir/vision/detect-v2
```

Route ini meneruskan gambar ke:

```text
Vision Server POST /detect-v2
```

### 22.2 Response

Backend harus meneruskan response Vision Server tanpa menghilangkan field:

```text
decision
product
confidence
gap
classification
ocr
```

### 22.3 Auth

Route harus hanya bisa digunakan oleh role:

```text
kasir
admin
branch_admin
super_admin
```

---

## 23. Performance Requirement

### 23.1 Target Latency

Target awal:

| Proses | Target |
|---|---:|
| Upload frame frontend ke backend | < 300 ms |
| Backend proxy ke Vision Server | < 300 ms |
| YOLO crop | < 800 ms |
| ResNet-50 inference | < 500 ms |
| OCR verifier | < 1000 ms |
| Total ideal | 1–3 detik |

Catatan:

```text
OCR boleh hanya dijalankan setelah classifier confidence cukup,
agar proses tidak terlalu lambat.
```

### 23.2 Optimasi

Strategi optimasi:

1. Jalankan OCR hanya jika confidence >= 0.70.
2. Gunakan crop produk, bukan full frame.
3. Gunakan image size 224.
4. Gunakan `torch.no_grad()` saat inference.
5. Gunakan `model.eval()`.
6. Jalankan model lokal.
7. Gunakan GPU jika tersedia.
8. Hindari menjalankan OCR pada setiap frame jika tidak perlu.

---

## 24. Hardware Requirement

### 24.1 Training

Laptop target:

```text
RAM: 32 GB
GPU: RTX 3050 Laptop
VRAM: 4 GB
```

Konfigurasi training:

```text
Batch size: 2
Gradient accumulation: 4
FP16: true
Image size: 224
```

### 24.2 Inference

Untuk Vision Server lokal:

```text
RAM minimal: 8 GB
RAM disarankan: 16 GB
VRAM minimal: 4 GB jika pakai GPU
CPU-only: bisa, tapi lebih lambat
```

---

## 25. Security Requirement

### 25.1 Secret

Secret berikut hanya boleh ada di server:

```text
SUPABASE_SERVICE_ROLE_KEY
HF_TOKEN jika digunakan
DATABASE_URL
```

### 25.2 Forbidden

Tidak boleh:

1. Menaruh service role key di frontend.
2. Commit `.env` ke repository.
3. Commit dataset sensitif tanpa kontrol.
4. Commit `.venv`.
5. Commit model besar tanpa strategi storage yang jelas jika repository menjadi berat.

### 25.3 Gitignore

Tambahkan:

```gitignore
.env
.venv/
__pycache__/
*.pyc
dataset/
models/
*.pth
*.pt
*.onnx
*.safetensors
```

Jika model perlu dibagikan, gunakan release artifact, cloud storage, atau model registry.

---

## 26. Reliability Requirement

Sistem harus tetap aman jika:

1. Model gagal load.
2. OCR gagal membaca teks.
3. Supabase tidak mengembalikan produk.
4. Confidence rendah.
5. Gap terlalu kecil.
6. Kamera blur.
7. Produk tidak ada dalam 300 class.
8. Vision Server timeout.

Behavior aman:

```text
Jangan add to cart.
Return REJECT atau NEED_CONFIRMATION.
```

---

## 27. Fallback Requirement

Scanner lama tetap dipertahankan sampai scanner baru stabil.

Fallback:

```text
Primary: /detect-v2
Fallback: /detect
Manual: search produk manual
```

Jika `/detect-v2` error:

```text
Tampilkan pesan ke kasir:
"Scanner AI v2 bermasalah. Gunakan scanner lama atau cari produk manual."
```

---

## 28. Testing Requirement

### 28.1 Unit Test

Test untuk:

1. `resnet50_product_classifier.predict()`.
2. OCR normalizer.
3. OCR verifier.
4. Decision engine.
5. Product repository mapping.
6. API response format.

### 28.2 Integration Test

Test flow:

```text
image → detect-v2 → classification → product lookup → OCR → decision
```

### 28.3 Manual Field Test

Gunakan minimal:

```text
20 produk × 20 scan = 400 scan awal
```

Untuk 300 produk, ideal:

```text
300 produk × 10 scan = 3.000 scan
```

### 28.4 Test Produk Mirip

Wajib test khusus:

```text
Indomie variant
Aqua size variant
Teh Pucuk size variant
Kopi sachet variant
Mie instan brand berbeda
```

---

## 29. Acceptance Criteria

### 29.1 Model

- [ ] Model berhasil training tanpa error.
- [ ] Model tersimpan di `models/resnet50-product-classifier`.
- [ ] Class mapping sesuai dengan 300 folder produk.
- [ ] Model bisa melakukan inference pada gambar lokal.
- [ ] Output berisi top-5 prediction.

### 29.2 Vision Server

- [ ] `/detect-v2` tersedia.
- [ ] `/detect-v2` bisa menerima image upload.
- [ ] Response memiliki `decision`.
- [ ] Response memiliki `confidence`.
- [ ] Response memiliki `gap`.
- [ ] Response memiliki `classification`.
- [ ] Response memiliki `ocr`.
- [ ] Jika produk tidak ditemukan, response `REJECT`.
- [ ] Jika confidence rendah, response `REJECT`.
- [ ] Jika confidence sedang, response `NEED_CONFIRMATION`.
- [ ] Jika confidence tinggi + OCR cocok, response `ACCEPT`.

### 29.3 Frontend

- [ ] Frontend menggunakan `/detect-v2`.
- [ ] ACCEPT masuk voting dulu.
- [ ] Voting 3 dari 5 frame berjalan.
- [ ] NEED_CONFIRMATION memunculkan modal.
- [ ] REJECT menampilkan scan ulang.
- [ ] Produk tidak langsung masuk cart dari satu frame.

### 29.4 Logging

- [ ] Scan log tersimpan.
- [ ] Predicted class tersimpan.
- [ ] Confidence tersimpan.
- [ ] Gap tersimpan.
- [ ] OCR text tersimpan jika ada.
- [ ] Decision tersimpan.
- [ ] Feedback koreksi bisa disimpan.

---

## 30. Metrics

### 30.1 ML Metrics

Pantau:

1. Validation accuracy.
2. Top-1 accuracy.
3. Top-3 accuracy.
4. Confusion matrix.
5. False positive rate.
6. Produk yang sering tertukar.
7. Confidence distribution.
8. Gap distribution.

### 30.2 Product Metrics

Pantau:

1. Persentase `ACCEPT`.
2. Persentase `NEED_CONFIRMATION`.
3. Persentase `REJECT`.
4. Jumlah koreksi kasir.
5. Waktu rata-rata scan.
6. Produk yang paling sering salah.
7. Produk yang paling sering OCR gagal.

### 30.3 Target Awal

Target awal uji lapangan:

```text
ACCEPT benar: >= 90%
Kesalahan otomatis masuk cart: mendekati 0
NEED_CONFIRMATION: boleh tinggi di awal
REJECT: boleh tinggi jika model belum matang
```

Prioritas utama:

```text
Lebih baik sering minta konfirmasi daripada otomatis salah masuk cart.
```

---

## 31. Rollout Plan

### 31.1 Phase 0 — Preparation

1. Backup project.
2. Buat branch:
   ```bash
   git checkout -b feature/resnet50-scanner-v2
   ```
3. Tambah kolom Supabase.
4. Siapkan folder dataset.
5. Siapkan environment Python.

### 31.2 Phase 1 — Dataset

1. Ambil foto 300 produk.
2. Minimal 50 foto per produk.
3. Validasi nama folder.
4. Pastikan nama folder sama dengan `ai_class_name`.
5. Pisahkan produk mirip.

### 31.3 Phase 2 — Training

1. Jalankan training ResNet-50.
2. Simpan model.
3. Test inference lokal.
4. Evaluasi top-1 dan top-3.
5. Cek confusion matrix.

### 31.4 Phase 3 — Vision Server

1. Tambah classifier.
2. Tambah product repository.
3. Tambah OCR verifier.
4. Tambah decision engine.
5. Tambah `/detect-v2`.

### 31.5 Phase 4 — Frontend

1. Arahkan scanner ke `/detect-v2`.
2. Tambah voting.
3. Tambah modal confirmation.
4. Tambah handling reject.
5. Tambah mode fallback.

### 31.6 Phase 5 — Field Test

1. Test dengan kamera kasir.
2. Test produk mirip.
3. Catat hasil scan.
4. Analisis log.
5. Adjust threshold.

### 31.7 Phase 6 — Default Rollout

1. Jika hasil stabil, jadikan `/detect-v2` default.
2. Scanner lama tetap tersedia sementara.
3. Mulai retraining berdasarkan log.
4. Dokumentasikan threshold final.

---

## 32. Risiko dan Mitigasi

| Risiko | Dampak | Mitigasi |
|---|---|---|
| Dataset kurang variasi | Model salah di lapangan | Ambil foto dengan kondisi toko nyata |
| Produk mirip tertukar | Salah transaksi | OCR, threshold ketat, confirmation |
| VRAM 4 GB tidak cukup | Training gagal | Batch size 1–2, fp16, accumulation |
| OCR lambat | Scan terasa lama | OCR hanya setelah confidence cukup |
| OCR gagal baca | Banyak confirmation | Keyword fleksibel, crop lebih baik |
| Supabase mapping salah | Produk tidak ditemukan | Validasi `ai_class_name` |
| API timeout | Scanner gagal | Fallback scanner lama/manual |
| Model overfit | Bagus di train, buruk di kamera | Augmentation dan validasi foto kamera |
| Cart salah | Kerugian transaksi | Voting + manual confirmation |

---

## 33. Open Questions

1. Apakah semua 300 produk sudah memiliki foto dataset?
2. Apakah semua produk sudah punya `ai_class_name`?
3. Apakah semua produk punya `ocr_keywords`?
4. Apakah kamera kasir sudah fixed?
5. Apakah Vision Server akan dijalankan di laptop yang sama?
6. Apakah OCR harus berjalan di CPU atau GPU?
7. Apakah produk bisa discan satu per satu saja pada fase awal?
8. Apakah perlu integrasi barcode sebagai fallback?
9. Apakah model akan disimpan lokal atau di server pusat?
10. Apakah tiap cabang punya katalog produk yang sama?

---

## 34. Deliverables

### 34.1 Code

1. `train_resnet50_product_classifier.py`
2. `resnet50_product_classifier.py`
3. `ocr_verifier.py`
4. `product_repository.py`
5. Update `vision_server.py`
6. Update frontend scanner page
7. Update backend proxy route jika diperlukan

### 34.2 Database

1. Kolom baru di `products`.
2. Tabel `product_scan_logs`.

### 34.3 Model

1. Folder `models/resnet50-product-classifier`.
2. File `class_mapping.json`.
3. Model weight.

### 34.4 Documentation

1. PRD ini.
2. Panduan training.
3. Panduan deployment.
4. Panduan retraining.
5. Checklist testing.

---

## 35. Implementation Checklist

### Database

- [ ] Tambah `ai_class_name`.
- [ ] Tambah `ocr_keywords`.
- [ ] Tambah `ai_enabled`.
- [ ] Buat `product_scan_logs`.
- [ ] Isi `ai_class_name` untuk 300 produk.
- [ ] Isi `ocr_keywords`.

### Dataset

- [ ] Buat folder 300 class.
- [ ] Minimal 50 foto per produk.
- [ ] Foto dari kamera kasir.
- [ ] Produk mirip punya ekstra foto.
- [ ] Nama folder valid.
- [ ] Nama folder sama dengan database.

### Training

- [ ] Install dependency.
- [ ] Buat script training.
- [ ] Jalankan training.
- [ ] Model tersimpan.
- [ ] Mapping tersimpan.
- [ ] Test inference lokal.
- [ ] Evaluasi akurasi.

### Vision Server

- [ ] Tambah classifier.
- [ ] Tambah OCR.
- [ ] Tambah repository.
- [ ] Tambah decision engine.
- [ ] Tambah `/detect-v2`.
- [ ] Tambah logging.
- [ ] Test endpoint.

### Frontend

- [ ] Ubah endpoint ke `/detect-v2`.
- [ ] Tambah voting.
- [ ] Tambah modal confirmation.
- [ ] Tambah reject handling.
- [ ] Tambah fallback.
- [ ] Test flow cart.

### Field Test

- [ ] Test 20 produk awal.
- [ ] Test produk mirip.
- [ ] Test semua 300 produk.
- [ ] Analisis log.
- [ ] Adjust threshold.
- [ ] Retrain jika perlu.

---

## 36. Kesimpulan

Implementasi ResNet-50 untuk AutoCashier-Kasir bertujuan membuat scanner produk lebih akurat dan aman untuk penggunaan lapangan.

Keputusan utama:

```text
Gunakan ResNet-50 sebagai classifier 300 produk.
YOLO tetap digunakan untuk crop produk.
OCR digunakan sebagai verifier.
Voting digunakan untuk menghindari kesalahan satu frame.
Manual confirmation digunakan untuk hasil ragu.
Scanner lama tetap tersedia sebagai fallback.
```

Target utama bukan membuat AI selalu benar 100%, tetapi membuat sistem:

```text
hanya otomatis saat sangat yakin,
minta konfirmasi saat ragu,
dan menolak saat tidak yakin.
```

Dengan pendekatan ini, risiko produk salah masuk cart dapat ditekan jauh lebih rendah dibanding scanner berbasis satu frame atau similarity matching saja.
