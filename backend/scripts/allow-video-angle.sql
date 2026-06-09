-- Izinkan nilai angle='video' pada product_images (untuk upload video training).
-- Jalankan SEKALI di Supabase SQL Editor.

-- Cara paling sederhana: hapus whitelist angle (aplikasi sudah mengontrol nilainya).
ALTER TABLE product_images DROP CONSTRAINT IF EXISTS product_images_angle_check;

-- (Opsional) Kalau ingin tetap ada validasi whitelist, hapus baris DROP di atas
-- dan pakai versi di bawah ini sebagai gantinya:
--
-- ALTER TABLE product_images DROP CONSTRAINT IF EXISTS product_images_angle_check;
-- ALTER TABLE product_images ADD CONSTRAINT product_images_angle_check
--   CHECK (angle IN (
--     'front','back','left','right',
--     'front-left','front-right','back-left','back-right',
--     'video'
--   ));
