-- Tabel product_requests untuk alur pengajuan produk baru dari admin cabang
-- Jalankan di Supabase SQL Editor jika tabel belum ada

CREATE TABLE IF NOT EXISTS product_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id UUID REFERENCES branches(id),
  requested_by UUID REFERENCES users(id),
  reviewed_by UUID REFERENCES users(id),
  name TEXT NOT NULL,
  category TEXT DEFAULT 'Uncategorized',
  price NUMERIC NOT NULL DEFAULT 0,
  sku TEXT,
  description TEXT,
  unit TEXT DEFAULT 'pcs',
  image_url TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  rejection_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ
);

-- Index untuk query cepat
CREATE INDEX IF NOT EXISTS idx_product_requests_status ON product_requests(status);
CREATE INDEX IF NOT EXISTS idx_product_requests_branch ON product_requests(branch_id);

-- Disable RLS agar backend bisa akses dengan service role key
ALTER TABLE product_requests DISABLE ROW LEVEL SECURITY;
