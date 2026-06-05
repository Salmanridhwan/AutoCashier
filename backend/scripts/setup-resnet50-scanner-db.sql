-- Migration Script untuk Setup ResNet-50 Scanner
-- Jalankan skrip ini di Supabase SQL Editor

-- 1. Tambahkan kolom pendukung AI ke tabel products
ALTER TABLE products
ADD COLUMN IF NOT EXISTS ai_class_name text;

ALTER TABLE products
ADD COLUMN IF NOT EXISTS ocr_keywords text[] default '{}';

ALTER TABLE products
ADD COLUMN IF NOT EXISTS ai_enabled boolean default true;

-- Tambahkan index untuk pencarian produk cepat berdasarkan class name
CREATE INDEX IF NOT EXISTS idx_products_ai_class_name ON products(ai_class_name);

-- 2. Buat tabel product_scan_logs untuk logging hasil scanner AI
CREATE TABLE IF NOT EXISTS product_scan_logs (
  id uuid primary key default gen_random_uuid(),
  product_id uuid null references products(id) on delete set null,
  predicted_class text,
  confidence numeric,
  gap numeric,
  decision text check (decision in ('ACCEPT', 'NEED_CONFIRMATION', 'REJECT')),
  ocr_text text,
  ocr_score numeric,
  is_correct boolean null,
  corrected_product_id uuid null references products(id) on delete set null,
  image_url text null,
  source text default 'detect-v2',
  created_at timestamp with time zone default now()
);

-- Indexing tabel logs untuk analisis statistik (dashboard/admin metrics)
CREATE INDEX IF NOT EXISTS idx_product_scan_logs_predicted ON product_scan_logs(predicted_class);
CREATE INDEX IF NOT EXISTS idx_product_scan_logs_decision ON product_scan_logs(decision);
CREATE INDEX IF NOT EXISTS idx_product_scan_logs_product_id ON product_scan_logs(product_id);
CREATE INDEX IF NOT EXISTS idx_product_scan_logs_created_at ON product_scan_logs(created_at);

-- Disable RLS agar backend service role key bisa akses secara bebas
ALTER TABLE product_scan_logs DISABLE ROW LEVEL SECURITY;
