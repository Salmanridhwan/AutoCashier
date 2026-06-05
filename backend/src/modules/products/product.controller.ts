import { Request, Response } from 'express';
import * as productService from './product.service.js';
import { v4 as uuidv4 } from 'uuid';

export async function listProducts(req: Request, res: Response) {
  const result = await productService.getAllProducts();
  if (!result.ok) return res.status(500).json({ status: 'error', error: result.error?.message || result.error });
  return res.json({ status: 'success', data: result.data });
}

export async function searchProduct(req: Request, res: Response) {
  const { label } = req.query;
  if (!label) return res.status(400).json({ status: 'error', error: 'Label is required' });
  
  const result = await productService.searchProductByLabel(label as string);
  if (!result.ok) return res.status(500).json({ status: 'error', error: result.error });
  if (!result.data) return res.status(404).json({ status: 'error', error: 'Product not found' });
  
  return res.json({ status: 'success', data: result.data });
}

export async function getProduct(req: Request, res: Response) {
  const { id } = req.params;
  const result = await productService.getProductById(id);
  if (!result.ok) return res.status(404).json({ status: 'error', error: result.error?.message || result.error });
  return res.json({ status: 'success', data: result.data });
}

export async function createProduct(req: Request, res: Response) {
  try {
    const { sku, name, category, price, ai_label, stock } = req.body;
    const files = req.files as { [fieldname: string]: Express.Multer.File[] };

    if (!name || !price) {
      return res.status(400).json({ status: 'error', error: 'Nama dan harga produk wajib diisi.' });
    }

    // Generate unique SKU if not provided
    const finalSku = sku || `PROD-${name.substring(0, 3).toUpperCase()}-${uuidv4().substring(0, 8).toUpperCase()}`;

    // First, create the product in DB (without image_url yet; we need product ID for storage path)
    const result = await productService.createProduct({
      sku: finalSku,
      name,
      price: Number(price),
      category: category || null,
      ai_label: ai_label || null,
      image_url: null,
      stock: stock !== undefined ? Number(stock) : 0,
    });

    if (!result.ok) {
      console.error('[createProduct] Supabase Error:', JSON.stringify(result.error, null, 2));
      return res.status(500).json({
        status: 'error',
        error: result.error?.message || String(result.error),
        code: result.error?.code,
      });
    }

    const createdProduct = result.data;
    if (!createdProduct?.id) {
      throw new Error('Product ID not found after creation.');
    }

    // Upload all angle images to Supabase Storage
    const ANGLE_FIELDS = [
      { field: 'imageFront', angle: 'front' },
      { field: 'imageBack',  angle: 'back'  },
      { field: 'imageLeft',  angle: 'left'  },
      { field: 'imageRight', angle: 'right' },
    ];

    const imageEntries: { angle: string; filename: string; storagePath: string; imageUrl: string }[] = [];
    let frontPublicUrl: string | null = null;

    for (const { field, angle } of ANGLE_FIELDS) {
      const file = files?.[field]?.[0];
      if (!file) continue;

      // ── Upload original image ──
      const storagePath = `products/${createdProduct.id}/${angle}-${file.originalname}`;
      const uploadResult = await productService.uploadImageToStorage(file.buffer, storagePath, file.mimetype);

      if (!uploadResult.ok || !uploadResult.url) {
        console.warn(`[createProduct] ⚠️  Failed to upload ${angle} image:`, uploadResult.error);
        continue;
      }

      imageEntries.push({ angle, filename: file.originalname, storagePath, imageUrl: uploadResult.url });

      if (angle === 'front') {
        frontPublicUrl = uploadResult.url;
      }

      // ── Generate & upload mirrored version ──
      try {
        const mirroredBuffer = await productService.mirrorImageBuffer(file.buffer, file.mimetype);
        const mirrorFilename = `mirror-${file.originalname}`;
        const mirrorStoragePath = `products/${createdProduct.id}/${angle}-mirror-${file.originalname}`;

        const mirrorUpload = await productService.uploadImageToStorage(mirroredBuffer, mirrorStoragePath, file.mimetype);

        if (mirrorUpload.ok && mirrorUpload.url) {
          // Use same angle value (passes DB check constraint) but different filename/path
          imageEntries.push({ angle, filename: mirrorFilename, storagePath: mirrorStoragePath, imageUrl: mirrorUpload.url });
          console.log(`[createProduct] 🪞 Mirror created for ${angle}`);
        }
      } catch (mirrorErr) {
        console.warn(`[createProduct] ⚠️  Failed to create mirror for ${angle}:`, mirrorErr);
      }
    }

    // Update product image_url with front image's public URL
    if (frontPublicUrl) {
      await productService.updateProduct(createdProduct.id, { image_url: frontPublicUrl });
      createdProduct.image_url = frontPublicUrl;
    }

    // Save all angle metadata to product_images table
    if (imageEntries.length > 0) {
      const imgResult = await productService.insertProductImages(createdProduct.id, imageEntries);
      if (!imgResult.ok) {
        console.error('[createProduct] ❌ DATABASE ERROR (product_images):', JSON.stringify(imgResult.error, null, 2));
        return res.status(500).json({
          status: 'error',
          error: 'Gagal menyimpan metadata foto ke database.',
          details: imgResult.error
        });
      }
      console.log(`[createProduct] ✅ ${imageEntries.length} foto berhasil diupload & didaftarkan untuk produk: ${createdProduct.name}`);
    }

    // Auto-trigger vision server sync so new product is immediately scannable
    try {
      const visionUrl = process.env.VISION_SERVER_URL || 'http://localhost:5002';
      fetch(`${visionUrl}/sync`, { method: 'POST' }).catch(() => {});
      console.log('[createProduct] 🔄 Vision server sync triggered');
    } catch {}

    return res.status(201).json({
      status: 'success',
      data: createdProduct
    });
  } catch (err: any) {
    console.error('[createProduct] Unexpected Error:', err);
    return res.status(500).json({ status: 'error', error: err.message });
  }
}

export async function updateProductController(req: Request, res: Response) {
  const { id } = req.params;
  const { name, category, price, stock, ai_label } = req.body;
  const files = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined;

  try {
    // Update basic product info
    const updatePayload: any = {};
    if (name !== undefined) updatePayload.name = name;
    if (category !== undefined) updatePayload.category = category || null;
    if (price !== undefined) updatePayload.price = Number(price);
    if (stock !== undefined) updatePayload.stock = Number(stock);
    if (ai_label !== undefined) updatePayload.ai_label = ai_label || null;

    const result = await productService.updateProduct(id, updatePayload);
    if (!result.ok) return res.status(500).json({ status: 'error', error: result.error?.message || result.error });

    // If new images were uploaded, delete old ones and upload new
    if (files && Object.keys(files).length > 0) {
      // 1. Delete old images from storage
      const oldPaths = await productService.getProductImagePaths(id);
      await productService.deleteImagesFromStorage(oldPaths);

      // 2. Delete old product_images records
      const client = (await import('../../config/supabaseClient.js')).supabaseAdmin || (await import('../../config/supabaseClient.js')).supabase;
      await (client as any).from('product_images').delete().eq('product_id', id);

      // 3. Upload new images
      const ANGLE_FIELDS = [
        { field: 'imageFront', angle: 'front' },
        { field: 'imageBack', angle: 'back' },
        { field: 'imageLeft', angle: 'left' },
        { field: 'imageRight', angle: 'right' },
      ];

      const imageEntries: { angle: string; filename: string; storagePath: string; imageUrl: string }[] = [];
      let frontPublicUrl: string | null = null;

      for (const { field, angle } of ANGLE_FIELDS) {
        const file = files[field]?.[0];
        if (!file) continue;

        const storagePath = `products/${id}/${angle}-${file.originalname}`;
        const uploadResult = await productService.uploadImageToStorage(file.buffer, storagePath, file.mimetype);
        if (!uploadResult.ok || !uploadResult.url) continue;

        imageEntries.push({ angle, filename: file.originalname, storagePath, imageUrl: uploadResult.url });
        if (angle === 'front') frontPublicUrl = uploadResult.url;

        // Generate mirror
        try {
          const mirroredBuffer = await productService.mirrorImageBuffer(file.buffer, file.mimetype);
          const mirrorStoragePath = `products/${id}/${angle}-mirror-${file.originalname}`;
          const mirrorUpload = await productService.uploadImageToStorage(mirroredBuffer, mirrorStoragePath, file.mimetype);
          if (mirrorUpload.ok && mirrorUpload.url) {
            imageEntries.push({ angle, filename: `mirror-${file.originalname}`, storagePath: mirrorStoragePath, imageUrl: mirrorUpload.url });
          }
        } catch {}
      }

      // 4. Update product image_url with front image
      if (frontPublicUrl) {
        await productService.updateProduct(id, { image_url: frontPublicUrl });
      }

      // 5. Insert new image records
      if (imageEntries.length > 0) {
        await productService.insertProductImages(id, imageEntries);
      }

      // 6. Trigger vision sync
      try {
        const visionUrl = process.env.VISION_SERVER_URL || 'http://localhost:5002';
        fetch(`${visionUrl}/sync`, { method: 'POST' }).catch(() => {});
      } catch {}

      console.log(`[updateProduct] ✅ ${imageEntries.length} new images uploaded for product ${id}`);
    }

    return res.json({ status: 'success', data: result.data });
  } catch (err: any) {
    console.error('[updateProduct] Error:', err);
    return res.status(500).json({ status: 'error', error: err.message });
  }
}

export async function deleteProductController(req: Request, res: Response) {
  const { id } = req.params;

  // 1. Collect storage paths BEFORE deleting from DB (because deleteProduct removes product_images records)
  const storagePaths = await productService.getProductImagePaths(id);

  // 2. Delete product from DB (cascades to product_images, branch_inventory)
  const result = await productService.deleteProduct(id);
  if (!result.ok) {
    const errMsg = result.error?.message || String(result.error);
    const errCode = result.error?.code;

    if (errCode === '23503' || errMsg.includes('violates foreign key constraint') || errMsg.includes('violates not-null constraint')) {
      const friendlyMessage = 'Produk ini tidak dapat dihapus secara permanen karena kolom product_id di riwayat transaksi diatur sebagai NOT NULL.\n\n💡 Solusi:\nJalankan query DDL berikut di Supabase SQL Editor agar produk bisa dihapus dan otomatis diset menjadi NULL di riwayat transaksi:\n\nALTER TABLE transaction_items ALTER COLUMN product_id DROP NOT NULL;\n\nALTER TABLE transaction_items DROP CONSTRAINT IF EXISTS transaction_items_product_id_fkey, ADD CONSTRAINT transaction_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL;';
      return res.status(409).json({
        status: 'error',
        message: friendlyMessage,
        error: friendlyMessage,
        code: 'FOREIGN_KEY_VIOLATION'
      });
    }

    return res.status(500).json({ status: 'error', error: errMsg });
  }

  // 3. Delete files from Supabase Storage
  await productService.deleteImagesFromStorage(storagePaths);

  // 4. Also delete the entire product folder from storage
  try {
    const { supabaseAdmin, supabase } = await import('../../config/supabaseClient.js');
    const client: any = supabaseAdmin || supabase;
    const { data: folderFiles } = await client.storage.from('product-images').list(`products/${id}`);
    if (folderFiles && folderFiles.length > 0) {
      const paths = folderFiles.map((f: any) => `products/${id}/${f.name}`);
      await client.storage.from('product-images').remove(paths);
      console.log(`[deleteProduct] 🗑️ Cleaned ${paths.length} remaining files from storage folder`);
    }
  } catch (e) {
    console.warn('[deleteProduct] ⚠️ Folder cleanup failed:', e);
  }

  console.log(`[deleteProduct] ✅ Product ${id} deleted, ${storagePaths.length} file(s) removed from storage.`);
  return res.json({ status: 'success', deletedFiles: storagePaths.length });
}
