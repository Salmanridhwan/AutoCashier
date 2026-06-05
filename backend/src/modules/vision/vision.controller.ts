import { Request, Response } from 'express';
import { env } from '../../config/environment.js';
import { supabase } from '../../config/supabaseClient.js';

const VISION_SERVER_URL = env.visionServerUrl;
const DETECT_TIMEOUT = 15000; // 15 seconds
const REGISTER_TIMEOUT = 60000; // 60 seconds for registration (heavier operation)
const HEALTH_TIMEOUT = 3000;
const SYNC_TIMEOUT_SHORT = 5000;
const SYNC_TIMEOUT_LONG = 120000;

/**
 * Resolve the best product image URL by prioritizing the "front" angle
 * from the `product_images` table, falling back to the first available image.
 */
async function resolveProductImageUrl(product: any): Promise<string | null> {
  try {
    const { data: frontImg } = await supabase
      .from('product_images')
      .select('image_url')
      .eq('product_id', product.id)
      .eq('angle', 'front')
      .maybeSingle();

    if (frontImg) return frontImg.image_url;

    if (!product.image_url) {
      const { data: firstImg } = await supabase
        .from('product_images')
        .select('image_url')
        .eq('product_id', product.id)
        .limit(1);
      if (firstImg && firstImg.length > 0) return firstImg[0].image_url;
    }
  } catch (err) {
    console.warn('[VISION] product_images lookup failed:', err);
  }
  return product.image_url || null;
}

/**
 * POST /api/kasir/detect
 * AI product detection via YOLO-World + DINOv2 vision server.
 * Includes 15s timeout and graceful degradation.
 */
export async function detect(req: Request, res: Response): Promise<void> {
  try {
    const { image } = req.body;
    if (!image) {
      res.status(400).json({ success: false, message: 'No image provided' });
      return;
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), DETECT_TIMEOUT);

      const visionRes = await fetch(`${VISION_SERVER_URL}/detect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      const visionData = await visionRes.json();

      if (visionRes.ok && visionData.success) {
        const { label, confidence, similarity, bbox, source } = visionData;
        console.log(
          `[VISION] ✅ Detected '${label}' conf=${(confidence * 100).toFixed(1)}% sim=${similarity?.toFixed(2)} [${source}]`
        );

        // Enrich detection result with product data from Supabase
        let product = visionData.product || null;
        const productId = visionData.product_id || null;

        if (label) {
          try {
            const query = productId
              ? supabase.from('products').select('*').eq('id', productId).maybeSingle()
              : supabase
                  .from('products')
                  .select('*')
                  .or(`ai_label.eq.${label},sku.eq.${label},name.ilike.%${label}%`)
                  .maybeSingle();
            const { data } = await query;
            if (data) {
              product = data;
              product.image_url = await resolveProductImageUrl(product);
              console.log(`[VISION] 📦 Supabase: '${product.name}' Rp${product.price}`);
            }
          } catch (dbErr) {
            console.warn('[VISION] DB lookup failed:', dbErr);
          }
        }

        res.json({ success: true, source, label, confidence, similarity, bbox, product });
        return;
      }

      // Vision server responded but found nothing
      res.json({
        success: false,
        message: visionData.message || 'Tidak ada objek terdeteksi',
        source: 'yolo+dino',
      });
    } catch (visionErr: any) {
      const isTimeout = visionErr.name === 'AbortError';
      const msg = isTimeout
        ? 'Vision server timeout — pastikan vision server sudah berjalan'
        : 'Vision server tidak dapat dijangkau — jalankan: npm run dev:vision';
      console.warn(`[VISION] ❌ ${msg}`);
      res.status(503).json({ success: false, message: msg, source: 'vision-server-offline' });
    }
  } catch (error) {
    console.error('[DETECT] Detection endpoint error:', error);
    res.status(500).json({ success: false, message: 'Detection system error' });
  }
}

/**
 * POST /api/kasir/vision/register
 * Register a new product in the vision server embeddings.
 */
export async function register(req: Request, res: Response): Promise<void> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REGISTER_TIMEOUT);

    const visionRes = await fetch(`${VISION_SERVER_URL}/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    const data = await visionRes.json();
    res.status(visionRes.ok ? 200 : 500).json(data);
  } catch (err: any) {
    res.status(503).json({ success: false, message: `Vision server unreachable: ${err.message}` });
  }
}

/**
 * GET /api/kasir/vision/products
 * List all products registered in the vision server.
 */
export async function getVisionProducts(_req: Request, res: Response): Promise<void> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), DETECT_TIMEOUT);

    const visionRes = await fetch(`${VISION_SERVER_URL}/products`, {
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    const data = await visionRes.json();
    res.json(data);
  } catch (err: any) {
    res.status(503).json({ success: false, message: `Vision server unreachable: ${err.message}` });
  }
}

/**
 * DELETE /api/kasir/vision/products/:id
 * Remove a product from the vision server embeddings.
 */
export async function deleteVisionProduct(req: Request, res: Response): Promise<void> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), DETECT_TIMEOUT);

    const visionRes = await fetch(`${VISION_SERVER_URL}/products/${req.params.id}`, {
      method: 'DELETE',
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    const data = await visionRes.json();
    res.status(visionRes.ok ? 200 : 404).json(data);
  } catch (err: any) {
    res.status(503).json({ success: false, message: `Vision server unreachable: ${err.message}` });
  }
}

/**
 * GET /api/kasir/vision/health
 * Check vision server health status.
 */
export async function healthCheck(_req: Request, res: Response): Promise<void> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), HEALTH_TIMEOUT);

    const visionRes = await fetch(`${VISION_SERVER_URL}/health`, {
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    const data = await visionRes.json();
    res.json({ ...data, vision_server: 'online' });
  } catch {
    res.json({ status: 'degraded', vision_server: 'offline', message: 'Run: python vision_server.py' });
  }
}

/**
 * POST /api/kasir/vision/sync
 * Trigger vision server embedding sync.
 */
export async function sync(req: Request, res: Response): Promise<void> {
  try {
    const shouldWait = req.query.wait === 'true';
    const endpoint = shouldWait ? '/sync/wait' : '/sync';
    const timeout = shouldWait ? SYNC_TIMEOUT_LONG : SYNC_TIMEOUT_SHORT;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    const visionRes = await fetch(`${VISION_SERVER_URL}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    const data = await visionRes.json();
    res.json(data);
  } catch (err: any) {
    res.status(503).json({ success: false, message: `Vision server unreachable: ${err.message}` });
  }
}
