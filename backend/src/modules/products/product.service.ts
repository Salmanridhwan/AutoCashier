import { supabase, supabaseAdmin } from '../../config/supabaseClient.js';
import { Product } from '../../models/Product.js';
import sharp from 'sharp';
import FormDataNode from 'form-data';
import fetch from 'node-fetch';

const STORAGE_BUCKET = 'product-images';
const VISION_SERVER_URL = process.env.VISION_SERVER_URL || 'http://localhost:5002';

const PRODUCT_COLUMNS = 'id, sku, name, price, stock, ai_label, category, image_url, ai_class_name, ai_enabled, ocr_keywords, created_at';

/**
 * Forward a media file (photo or video) directly to the vision server.
 * The vision server saves the file to its local dataset folder and extracts
 * video frames on the fly. Returns a local:// pseudo-URL for DB storage.
 */
export async function forwardMediaToVisionServer(
  buffer: Buffer,
  filename: string,
  mimetype: string,
  aiClassName: string,
  angle: string
): Promise<{ ok: boolean; localPath?: string; files_saved?: number; error?: any }> {
  try {
    const form = new FormDataNode();
    form.append('ai_class_name', aiClassName);
    form.append('angle', angle);
    form.append('file', buffer, { filename, contentType: mimetype });

    const resp = await fetch(`${VISION_SERVER_URL}/upload-product-media`, {
      method: 'POST',
      body: form as any,
      headers: form.getHeaders(),
    });

    if (!resp.ok) {
      const text = await resp.text();
      console.error(`[forwardMediaToVisionServer] Vision server error ${resp.status}: ${text}`);
      return { ok: false, error: text };
    }

    const json = (await resp.json()) as any;
    const firstPath: string = json.local_paths?.[0] ?? `local://${aiClassName}/${filename}`;
    console.log(`[forwardMediaToVisionServer] ✅ ${json.files_saved} file(s) saved for class '${aiClassName}' (${angle})`);
    return { ok: true, localPath: firstPath, files_saved: json.files_saved };
  } catch (err: any) {
    console.error('[forwardMediaToVisionServer] ❌ Error:', err.message);
    return { ok: false, error: err.message };
  }
}

export async function getAllProducts(): Promise<{ ok: boolean; data?: Product[]; error?: any }> {
  try {
    // Use admin client to bypass RLS for backend reads
    const client = supabaseAdmin || supabase;
    const res: any = await client
      .from('products')
      .select(PRODUCT_COLUMNS)
      .order('created_at', { ascending: false });
    if (res?.error) return { ok: false, error: res.error };
    return { ok: true, data: res?.data || [] };
  } catch (err) {
    return { ok: false, error: err };
  }
}

export async function getProductById(id: string) {
  try {
    const client = supabaseAdmin || supabase;
    const res: any = await client
      .from('products')
      .select(PRODUCT_COLUMNS)
      .eq('id', id)
      .limit(1)
      .maybeSingle();
    if (res?.error) return { ok: false, error: res.error };
    return { ok: true, data: res?.data || null };
  } catch (err) {
    return { ok: false, error: err };
  }
}

export async function createProduct(payload: any) {
  try {
    const client = supabaseAdmin || supabase;
    console.log(`[productService] 🏗️  Creating product using ${client === supabaseAdmin ? 'ADMIN' : 'ANON'} client`);

    const safePayload: any = {
      sku: payload.sku,
      name: payload.name,
      price: payload.price || 0,
      category: payload.category || null,
      image_url: payload.image_url ?? null,
      ai_label: payload.ai_label ?? null,
      stock: payload.stock ?? 0,
    };
    // AI fields (optional columns) — only include when provided
    if (payload.ai_class_name !== undefined) safePayload.ai_class_name = payload.ai_class_name;
    if (payload.ai_enabled !== undefined) safePayload.ai_enabled = payload.ai_enabled;
    if (payload.ocr_keywords !== undefined) safePayload.ocr_keywords = payload.ocr_keywords;

    // Use .select().single() to get back the full created row
    const res: any = await client
      .from('products')
      .insert([safePayload])
      .select('id, sku, name, price, stock, ai_label, category, image_url, created_at')
      .single();

    if (res?.error) {
      return { ok: false, error: res.error };
    }

    return { ok: true, data: res?.data };
  } catch (err) {
    return { ok: false, error: err };
  }
}

/**
 * Upload a single image buffer to Supabase Storage.
 * Returns the public URL of the uploaded file.
 * (Still used for background images and profile photos.)
 */
export async function uploadImageToStorage(
  buffer: Buffer,
  storagePath: string,
  mimetype: string
): Promise<{ ok: boolean; url?: string; error?: any }> {
  try {
    const client = supabaseAdmin || supabase;
    const { error: uploadError } = await client.storage
      .from(STORAGE_BUCKET)
      .upload(storagePath, buffer, {
        contentType: mimetype,
        upsert: true,
      });

    if (uploadError) {
      console.error('[productService] ❌ Storage upload error:', uploadError);
      return { ok: false, error: uploadError };
    }

    const { data: publicUrlData } = client.storage
      .from(STORAGE_BUCKET)
      .getPublicUrl(storagePath);

    const url = publicUrlData?.publicUrl;
    console.log(`[productService] ✅ Uploaded to storage: ${storagePath} => ${url}`);
    return { ok: true, url };
  } catch (err) {
    return { ok: false, error: err };
  }
}

/**
 * Delete a list of storage paths from Supabase Storage.
 * Skips local:// pseudo-paths (handled by vision server instead).
 */
export async function deleteImagesFromStorage(storagePaths: string[]): Promise<void> {
  const realPaths = storagePaths.filter(p => p && !p.startsWith('local://'));
  if (realPaths.length === 0) return;
  try {
    const client = supabaseAdmin || supabase;
    const { error } = await client.storage.from(STORAGE_BUCKET).remove(realPaths);
    if (error) {
      console.warn('[productService] ⚠️  Storage delete error:', error);
    } else {
      console.log(`[productService] 🗑️  Deleted ${realPaths.length} file(s) from storage.`);
    }
  } catch (err) {
    console.warn('[productService] ⚠️  deleteImagesFromStorage exception:', err);
  }
}

// Save angle images to product_images table
export async function insertProductImages(
  productId: string,
  images: { angle: string; filename: string; storagePath: string; imageUrl?: string }[]
) {
  try {
    const client = supabaseAdmin || supabase;
    console.log(`[productService] 📸 Inserting product images using ${client === supabaseAdmin ? 'ADMIN' : 'ANON'} client`);
    const rows = images.map(img => ({
      product_id: productId,
      angle: img.angle,
      filename: img.filename,
      storage_path: img.storagePath,
      image_url: img.imageUrl,
    }));
    const res: any = await client.from('product_images').insert(rows);
    if (res?.error) return { ok: false, error: res.error };
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err };
  }
}

export async function updateProduct(id: string, payload: Partial<Product>) {
  try {
    const client = supabaseAdmin || supabase;
    const res: any = await client.from('products').update(payload).eq('id', id);
    if (res?.error) return { ok: false, error: res.error };
    return { ok: true, data: res?.data };
  } catch (err) {
    return { ok: false, error: err };
  }
}

/**
 * Returns Supabase Storage paths (keys) for all images of a product.
 * Used before deletion to clean up storage. Skips local:// paths.
 */
export async function getProductImagePaths(id: string): Promise<string[]> {
  try {
    const client = supabaseAdmin || supabase;
    const paths: string[] = [];

    console.log(`[productService] 🔍 Fetching storage paths for product ID: ${id}`);

    const { data: imgs, error: imgErr } = await client
      .from('product_images')
      .select('storage_path')
      .eq('product_id', id);

    if (imgErr) console.error('[productService] Error fetching product_images:', imgErr);

    if (imgs && imgs.length > 0) {
      imgs.forEach((r: any) => {
        if (r.storage_path && !r.storage_path.startsWith('local://') && !paths.includes(r.storage_path)) {
          paths.push(r.storage_path);
        }
      });
      console.log(`[productService] 📸 Found ${paths.length} real storage paths in product_images table.`);
    } else {
      console.log('[productService] ❓ No storage paths found in product_images table.');
    }

    return paths;
  } catch (err) {
    console.error('[productService] Critical error in getProductImagePaths:', err);
    return [];
  }
}

export async function deleteProduct(id: string) {
  try {
    const client = supabaseAdmin || supabase;

    // 1. Delete related records to avoid FK constraint errors
    await client.from('product_images').delete().eq('product_id', id);
    await client.from('branch_inventory').delete().eq('product_id', id);

    // 2. Delete from products
    const res: any = await client.from('products').delete().eq('id', id);
    if (res?.error) return { ok: false, error: res.error };
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err };
  }
}

/**
 * Automatically creates stock entries for a new product in ALL existing branches
 */
export async function initializeProductInAllBranches(productId: string, initialPrice: number) {
  try {
    const client = supabaseAdmin || supabase;

    // 1. Get all branch IDs
    const { data: branches, error: bErr } = await client.from('branches').select('id');
    if (bErr) throw bErr;
    if (!branches || branches.length === 0) return { ok: true, message: 'No branches to initialize' };

    // 2. Prepare inventory rows
    const inventoryRows = branches.map((branch: any) => ({
      branch_id: branch.id,
      product_id: productId,
      stock: 0,
      last_updated: new Date().toISOString()
    }));

    // 3. Bulk insert to branch_inventory
    const { error: iErr } = await client.from('branch_inventory').insert(inventoryRows);
    if (iErr) {
      console.error(`[productService] ❌ branch_inventory insert error:`, JSON.stringify(iErr, null, 2));
      throw iErr;
    }

    console.log(`[productService] 🚀 Initialized product ${productId} in ${branches.length} branches.`);
    return { ok: true };
  } catch (err) {
    console.error('[productService] ❌ Failed to initialize product in branches:', err);
    return { ok: false, error: err };
  }
}

export async function searchProductByLabel(label: string) {
  try {
    const client = supabaseAdmin || supabase;
    const { data, error } = await client
      .from('products')
      .select(PRODUCT_COLUMNS)
      .eq('ai_label', label)
      .maybeSingle();

    if (error) throw error;
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: err };
  }
}

/**
 * Generate a horizontally mirrored (flipped) version of an image buffer.
 * Used to create augmented product images for better AI detection at various orientations.
 */
export async function mirrorImageBuffer(buffer: Buffer, mimetype: string): Promise<Buffer> {
  return sharp(buffer).flop().toBuffer(); // flop = horizontal mirror
}
