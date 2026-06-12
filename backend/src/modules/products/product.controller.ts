import { Request, Response } from 'express';
import * as productService from './product.service.js';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { generateOcrKeywords } from './product-ai.utils.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const VISION_SERVER_URL = process.env.VISION_SERVER_URL || 'http://localhost:5002';

async function deleteLocalProductDataset(aiClassName?: string | null): Promise<boolean> {
  const className = String(aiClassName || '').trim();
  if (!className || className === 'background' || !/^[a-zA-Z0-9_-]+$/.test(className)) {
    return false;
  }

  // Also call the vision server to delete its local dataset folder
  try {
    await fetch(`${VISION_SERVER_URL}/delete-product-media?ai_class_name=${encodeURIComponent(className)}`, { method: 'DELETE' });
    console.log(`[deleteProduct] Requested vision server to delete dataset for: ${className}`);
  } catch (e) {
    console.warn('[deleteProduct] Could not reach vision server for dataset deletion:', e);
  }

  // Also delete via local filesystem path (redundant but safe)
  try {
    const projectRoot = path.resolve(__dirname, '../../../..');
    const datasetRoot = path.resolve(projectRoot, 'vision', 'dataset', 'products');
    const target = path.resolve(datasetRoot, className);
    const datasetRootWithSep = datasetRoot.endsWith(path.sep) ? datasetRoot : `${datasetRoot}${path.sep}`;
    if (target !== datasetRoot && target.startsWith(datasetRootWithSep)) {
      await fs.rm(target, { recursive: true, force: true });
      console.log(`[deleteProduct] Removed local dataset folder: ${target}`);
    }
  } catch (e) {
    console.warn('[deleteProduct] Local dataset folder deletion failed:', e);
  }

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
    const aiClassName = (ai_label || name).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    const ocrKeywords = generateOcrKeywords(name, aiClassName);

    // First, create the product in DB (without image_url yet)
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

    // Forward all angle images directly to the vision server (stored locally, not in Supabase Storage)
    const ANGLE_FIELDS = [
      { field: 'imageFront', angle: 'front' },
      { field: 'imageBack',  angle: 'back'  },
      { field: 'imageLeft',  angle: 'left'  },
      { field: 'imageRight', angle: 'right' },
    ];

    const imageEntries: { angle: string; filename: string; storagePath: string; imageUrl: string }[] = [];
    let frontLocalPath: string | null = null;

    for (const { field, angle } of ANGLE_FIELDS) {
      const file = files?.[field]?.[0];
      if (!file) continue;

      // Forward photo to vision server — it saves the file and its mirror to disk
      const fwdResult = await productService.forwardMediaToVisionServer(
        file.buffer, file.originalname, file.mimetype, aiClassName, angle
      );

      if (!fwdResult.ok || !fwdResult.localPath) {
        console.warn(`[createProduct] ⚠️  Failed to forward ${angle} to vision server:`, fwdResult.error);
        continue;
      }

      // Store local:// pseudo-path for tracking in the database
      imageEntries.push({ angle, filename: file.originalname, storagePath: fwdResult.localPath, imageUrl: fwdResult.localPath });
      if (angle === 'front') frontLocalPath = fwdResult.localPath;
      console.log(`[createProduct] 📁 ${angle} → ${fwdResult.localPath} (${fwdResult.files_saved} file(s))`);
    }

    // Forward product videos to vision server (frames extracted server-side on-the-fly)
    const videoFiles = files?.['video'] || [];
    for (const [index, videoFile] of videoFiles.entries()) {
      const fwdResult = await productService.forwardMediaToVisionServer(
        videoFile.buffer, videoFile.originalname, videoFile.mimetype, aiClassName, 'video'
      );
      if (fwdResult.ok && fwdResult.localPath) {
        imageEntries.push({ angle: 'video', filename: videoFile.originalname, storagePath: fwdResult.localPath, imageUrl: fwdResult.localPath });
        console.log(`[createProduct] 🎥 Video ${index + 1}/${videoFiles.length} → ${fwdResult.files_saved} frames extracted`);
      } else {
        console.warn('[createProduct] Failed to forward video:', fwdResult.error);
      }
    }

    // Build a browser-accessible thumbnail URL pointing to the vision server
    if (frontLocalPath) {
      const [, classAndFile] = frontLocalPath.split('local://');
      const thumbnailUrl = `${VISION_SERVER_URL}/dataset-image/${classAndFile}`;
      await productService.updateProduct(createdProduct.id, { image_url: thumbnailUrl });
      createdProduct.image_url = thumbnailUrl;
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
      console.log(`[createProduct] ✅ ${imageEntries.length} entry berhasil diforward & didaftarkan untuk produk: ${createdProduct.name}`);
    }

    // Trigger vision server product cache refresh so new product is immediately scannable
    try {
      fetch(`${VISION_SERVER_URL}/refresh-cache`, { method: 'POST' }).catch(() => {});
      console.log('[createProduct] 🔄 Vision server cache refreshed');
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

      // Delete existing DB rows + any Supabase Storage files for a single angle
      const replaceAngle = async (angleVal: string) => {
        const { data: olds } = await (client as any)
          .from('product_images').select('storage_path').eq('product_id', id).eq('angle', angleVal);
        const paths = (olds || []).map((r: any) => r.storage_path).filter(Boolean);
        if (paths.length) await productService.deleteImagesFromStorage(paths);
        await (client as any).from('product_images').delete().eq('product_id', id).eq('angle', angleVal);
      };

      // Fetch current ai_class_name for this product
      const productData = await productService.getProductById(id);
      const editAiClass = (productData.data?.ai_class_name as string) || id;

      const ANGLE_FIELDS = [
        { field: 'imageFront', angle: 'front' },
        { field: 'imageBack',  angle: 'back'  },
        { field: 'imageLeft',  angle: 'left'  },
        { field: 'imageRight', angle: 'right' },
      ];

      const imageEntries: { angle: string; filename: string; storagePath: string; imageUrl: string }[] = [];
      let frontLocalPath: string | null = null;

      for (const { field, angle } of ANGLE_FIELDS) {
        const file = files[field]?.[0];
        if (!file) continue;

        await replaceAngle(angle);

        const fwdResult = await productService.forwardMediaToVisionServer(
          file.buffer, file.originalname, file.mimetype, editAiClass, angle
        );
        if (!fwdResult.ok || !fwdResult.localPath) continue;

        imageEntries.push({ angle, filename: file.originalname, storagePath: fwdResult.localPath, imageUrl: fwdResult.localPath });
        if (angle === 'front') frontLocalPath = fwdResult.localPath;
      }

      // Append new videos (do not replace existing)
      const videoFiles = files['video'] || [];
      for (const [index, videoFile] of videoFiles.entries()) {
        const fwdResult = await productService.forwardMediaToVisionServer(
          videoFile.buffer, videoFile.originalname, videoFile.mimetype, editAiClass, 'video'
        );
        if (fwdResult.ok && fwdResult.localPath) {
          imageEntries.push({ angle: 'video', filename: videoFile.originalname, storagePath: fwdResult.localPath, imageUrl: fwdResult.localPath });
          console.log(`[updateProduct] 🎥 Video ${index + 1}/${videoFiles.length} → ${fwdResult.files_saved} frames`);
        }
      }

      // Update thumbnail to vision server URL
      if (frontLocalPath) {
        const [, classAndFile] = frontLocalPath.split('local://');
        const thumbnailUrl = `${VISION_SERVER_URL}/dataset-image/${classAndFile}`;
        await productService.updateProduct(id, { image_url: thumbnailUrl });
      }

      // Insert new image records
      if (imageEntries.length > 0) {
        await productService.insertProductImages(id, imageEntries);
      }

      // Refresh vision product cache
      try {
        fetch(`${VISION_SERVER_URL}/refresh-cache`, { method: 'POST' }).catch(() => {});
      } catch {}

      console.log(`[updateProduct] ✅ ${imageEntries.length} new images forwarded to vision server for product ${id}`);
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

  // 1. Collect Supabase Storage paths BEFORE deleting from DB
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

  // 3. Delete any remaining files from Supabase Storage (skips local:// paths automatically)
  await productService.deleteImagesFromStorage(storagePaths);

  // 3b. Delete local vision dataset folder for this product class
  const localDatasetDeleted = await deleteLocalProductDataset(aiClassName);

  // 4. Also attempt to clean remaining Supabase Storage product folder
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

  // 5. Refresh vision product cache
  try {
    fetch(`${VISION_SERVER_URL}/refresh-cache`, { method: 'POST' }).catch(() => {});
  } catch {}

  console.log(`[deleteProduct] ✅ Product ${id} deleted, ${storagePaths.length} Supabase file(s) removed.`);
  return res.json({ status: 'success', deletedFiles: storagePaths.length, localDatasetDeleted });
}

/**
 * POST /api/shared/products/background
 * Forward background media (empty-scene photos/videos) to the vision server to be stored locally.
 * Used as the 'background' training class so the scanner rejects non-products.
 */
export async function uploadBackground(req: Request, res: Response) {
  try {
    const files = (req.files as Express.Multer.File[]) || [];
    if (!files.length) return res.status(400).json({ status: 'error', error: 'Tidak ada file diunggah.' });

    let uploaded = 0;
    for (const f of files) {
      const fwdResult = await productService.forwardMediaToVisionServer(
        f.buffer, f.originalname, f.mimetype, 'background', 'bg'
      );
      if (fwdResult.ok) {
        uploaded++;
      } else {
        console.warn('[uploadBackground] failed to forward background file:', fwdResult.error);
      }
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
    const resp = await fetch(`${VISION_SERVER_URL}/list-product-media/background`);
    if (!resp.ok) {
      throw new Error(`Vision server list-product-media returned status ${resp.status}`);
    }
    const data = await resp.json() as any;
    return res.json({ status: 'success', count: data.count || 0 });
  } catch (err: any) {
    console.warn('[getBackground] Vision server error, falling back to local files:', err);
    try {
      const projectRoot = path.resolve(__dirname, '../../../..');
      const bgDir = path.resolve(projectRoot, 'vision', 'dataset', 'products', 'background');
      const files = await fs.readdir(bgDir).catch(() => []);
      const imgFiles = files.filter(f => /\.(jpe?g|png)$/i.test(f));
      return res.json({ status: 'success', count: imgFiles.length });
    } catch (e: any) {
      return res.status(500).json({ status: 'error', error: err.message });
    }
  }
}

export async function clearBackground(_req: Request, res: Response) {
  try {
    const resp = await fetch(`${VISION_SERVER_URL}/delete-product-media?ai_class_name=background`, { method: 'DELETE' });
    if (!resp.ok) {
      throw new Error(`Vision server delete-product-media returned status ${resp.status}`);
    }
    const data = await resp.json() as any;
    return res.json({ status: 'success', removed: data.success ? 1 : 0 });
  } catch (err: any) {
    console.warn('[clearBackground] Vision server error, falling back to local files:', err);
    try {
      const projectRoot = path.resolve(__dirname, '../../../..');
      const bgDir = path.resolve(projectRoot, 'vision', 'dataset', 'products', 'background');
      await fs.rm(bgDir, { recursive: true, force: true }).catch(() => {});
      await fs.mkdir(bgDir, { recursive: true }).catch(() => {});
      return res.json({ status: 'success', removed: 1 });
    } catch (e: any) {
      return res.status(500).json({ status: 'error', error: err.message });
    }
  }
}
