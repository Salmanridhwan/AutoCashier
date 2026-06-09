import { Request, Response } from 'express';
import * as productService from './product.service.js';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { generateOcrKeywords } from './product-ai.utils.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function deleteLocalProductDataset(aiClassName?: string | null): Promise<boolean> {
  const className = String(aiClassName || '').trim();
  if (!className || className === 'background' || !/^[a-zA-Z0-9_-]+$/.test(className)) {
    return false;
  }

  const projectRoot = path.resolve(__dirname, '../../../..');
  const datasetRoot = path.resolve(projectRoot, 'vision', 'dataset', 'products');
  const target = path.resolve(datasetRoot, className);
  const datasetRootWithSep = datasetRoot.endsWith(path.sep) ? datasetRoot : `${datasetRoot}${path.sep}`;

  if (target === datasetRoot || !target.startsWith(datasetRootWithSep)) {
    console.warn(`[deleteProduct] Refusing to delete unsafe dataset path: ${target}`);
    return false;
  }

  await fs.rm(target, { recursive: true, force: true });
  console.log(`[deleteProduct] Removed local dataset folder: ${target}`);
  return true;
}

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

    // Derive AI fields so new products are usable by the scanner/training right away.
    // ai_class_name = dataset folder name; keywords include phrases, tokens, and
    // conservative spelling variants used by the OCR verifier.
    const aiClassName = (ai_label || name).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    const ocrKeywords = generateOcrKeywords(name, aiClassName);

    // First, create the product in DB (without image_url yet; we need product ID for storage path)
    const result = await productService.createProduct({
      sku: finalSku,
      name,
      price: Number(price),
      category: category || null,
      ai_label: ai_label || null,
      ai_class_name: aiClassName,
      ai_enabled: true,
      ocr_keywords: ocrKeywords,
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

    // Upload all angle images to Supabase Storage (4 main angles)
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

    // Upload product videos for AI training frame extraction.
    const videoFiles = files?.['video'] || [];
    for (const [index, videoFile] of videoFiles.entries()) {
      const videoPath = `products/${createdProduct.id}/video-${Date.now()}-${index}-${videoFile.originalname}`;
      const videoUpload = await productService.uploadImageToStorage(videoFile.buffer, videoPath, videoFile.mimetype);
      if (videoUpload.ok && videoUpload.url) {
        imageEntries.push({ angle: 'video', filename: videoFile.originalname, storagePath: videoPath, imageUrl: videoUpload.url });
        console.log(`[createProduct] Video uploaded for training (${index + 1}/${videoFiles.length})`);
      } else {
        console.warn('[createProduct] Failed to upload video:', videoUpload.error);
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
  const { name, category, price, stock, ai_label, ocr_keywords } = req.body;
  const files = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined;

  try {
    // Update basic product info
    const updatePayload: any = {};
    if (name !== undefined) updatePayload.name = name;
    if (category !== undefined) updatePayload.category = category || null;
    if (price !== undefined) updatePayload.price = Number(price);
    if (stock !== undefined) updatePayload.stock = Number(stock);
    if (ai_label !== undefined) updatePayload.ai_label = ai_label || null;
    if (ocr_keywords !== undefined) {
      const parsedKeywords = Array.isArray(ocr_keywords)
        ? ocr_keywords
        : String(ocr_keywords).split(',');
      updatePayload.ocr_keywords = parsedKeywords.map((value: unknown) => String(value).trim()).filter(Boolean);
    } else if (name !== undefined) {
      updatePayload.ocr_keywords = generateOcrKeywords(name, ai_label);
    }

    const result = await productService.updateProduct(id, updatePayload);
    if (!result.ok) return res.status(500).json({ status: 'error', error: result.error?.message || result.error });

    // If new media was uploaded, replace ONLY photo angles being re-uploaded.
    // Existing videos are preserved; newly uploaded videos are appended.
    if (files && Object.keys(files).length > 0) {
      const client = (await import('../../config/supabaseClient.js')).supabaseAdmin || (await import('../../config/supabaseClient.js')).supabase;

      // Delete existing storage files + DB rows for a single angle (incl. its mirror)
      const replaceAngle = async (angleVal: string) => {
        const { data: olds } = await (client as any)
          .from('product_images').select('storage_path').eq('product_id', id).eq('angle', angleVal);
        const paths = (olds || []).map((r: any) => r.storage_path).filter(Boolean);
        if (paths.length) await productService.deleteImagesFromStorage(paths);
        await (client as any).from('product_images').delete().eq('product_id', id).eq('angle', angleVal);
      };

      // Upload new images (4 main angles)
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

        await replaceAngle(angle); // replace only this angle

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

      // 3b. Upload product videos (optional on edit). Append, do not replace old videos.
      const videoFiles = files['video'] || [];
      for (const [index, videoFile] of videoFiles.entries()) {
        const videoPath = `products/${id}/video-${Date.now()}-${index}-${videoFile.originalname}`;
        const videoUpload = await productService.uploadImageToStorage(videoFile.buffer, videoPath, videoFile.mimetype);
        if (videoUpload.ok && videoUpload.url) {
          imageEntries.push({ angle: 'video', filename: videoFile.originalname, storagePath: videoPath, imageUrl: videoUpload.url });
        }
      }

      // 4. Update product image_url with front image
      if (frontPublicUrl) {
        await productService.updateProduct(id, { image_url: frontPublicUrl });
      }

      // 5. Insert new image records
      if (imageEntries.length > 0) {
        await productService.insertProductImages(id, imageEntries);
      }

      // 6. Refresh vision product cache so changes apply without restart
      try {
        const visionUrl = process.env.VISION_SERVER_URL || 'http://localhost:5002';
        fetch(`${visionUrl}/refresh-cache`, { method: 'POST' }).catch(() => {});
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

  const productBeforeDelete = await productService.getProductById(id);
  const aiClassName = productBeforeDelete.ok ? productBeforeDelete.data?.ai_class_name : null;

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

  // 3b. Delete local vision dataset folder for this product class
  const localDatasetDeleted = await deleteLocalProductDataset(aiClassName);

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

  // 5. Refresh vision product cache so the scanner forgets the deleted product
  try {
    const visionUrl = process.env.VISION_SERVER_URL || 'http://localhost:5002';
    fetch(`${visionUrl}/refresh-cache`, { method: 'POST' }).catch(() => {});
  } catch {}

  console.log(`[deleteProduct] ✅ Product ${id} deleted, ${storagePaths.length} file(s) removed from storage.`);
  return res.json({ status: 'success', deletedFiles: storagePaths.length, localDatasetDeleted });
}

/**
 * POST /api/shared/products/background
 * Upload background media (empty-scene photos/videos) to Supabase Storage `background/`.
 * Used as the 'background' training class so the scanner rejects non-products.
 */
export async function uploadBackground(req: Request, res: Response) {
  try {
    const files = (req.files as Express.Multer.File[]) || [];
    if (!files.length) return res.status(400).json({ status: 'error', error: 'Tidak ada file diunggah.' });

    let uploaded = 0;
    for (const f of files) {
      const ts = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const path = `background/${ts}-${f.originalname}`;
      const up = await productService.uploadImageToStorage(f.buffer, path, f.mimetype);
      if (up.ok) uploaded++;
      else console.warn('[uploadBackground] failed:', up.error);
    }
    return res.json({ status: 'success', uploaded });
  } catch (err: any) {
    console.error('[uploadBackground] Error:', err);
    return res.status(500).json({ status: 'error', error: err.message });
  }
}

/**
 * GET /api/shared/products/background  → count of background files in storage
 * DELETE /api/shared/products/background → clear all background files
 */
export async function getBackground(_req: Request, res: Response) {
  try {
    const { supabaseAdmin, supabase } = await import('../../config/supabaseClient.js');
    const client: any = supabaseAdmin || supabase;
    const { data } = await client.storage.from('product-images').list('background');
    const files = (data || []).filter((f: any) => f.name !== '.emptyFolderPlaceholder');
    return res.json({ status: 'success', count: files.length });
  } catch (err: any) {
    return res.status(500).json({ status: 'error', error: err.message });
  }
}

export async function clearBackground(_req: Request, res: Response) {
  try {
    const { supabaseAdmin, supabase } = await import('../../config/supabaseClient.js');
    const client: any = supabaseAdmin || supabase;
    const { data } = await client.storage.from('product-images').list('background');
    const paths = (data || [])
      .filter((f: any) => f.name !== '.emptyFolderPlaceholder')
      .map((f: any) => `background/${f.name}`);
    if (paths.length) await client.storage.from('product-images').remove(paths);
    return res.json({ status: 'success', removed: paths.length });
  } catch (err: any) {
    return res.status(500).json({ status: 'error', error: err.message });
  }
}
