import { Request, Response } from 'express';
import { env } from '../../config/environment.js';

const VISION_SERVER_URL = env.visionServerUrl;
const DETECT_TIMEOUT = 15000; // 15 seconds
const REGISTER_TIMEOUT = 60000; // 60 seconds for registration (heavier operation)
const HEALTH_TIMEOUT = 3000;
const SYNC_TIMEOUT_SHORT = 5000;
const SYNC_TIMEOUT_LONG = 120000;

/**
 * POST /api/kasir/detect
 * Legacy fallback proxy to the FastAPI Vision Server /detect (base64 JSON).
 * The vision server now returns the v2 decision shape, so this is a thin
 * pass-through — response fields are forwarded untouched.
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

      const visionData = await visionRes.json() as any;
      res.status(visionRes.status).json(visionData);
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

    const data = await visionRes.json() as any;
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

/**
 * POST /api/kasir/vision/refresh-cache
 * Trigger the Vision Server to reload its active-products cache from Supabase.
 */
export async function refreshCache(_req: Request, res: Response): Promise<void> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), SYNC_TIMEOUT_SHORT);

    const visionRes = await fetch(`${VISION_SERVER_URL}/refresh-cache`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    const data = await visionRes.json();
    res.status(visionRes.status).json(data);
  } catch (err: any) {
    res.status(503).json({ success: false, message: `Vision server unreachable: ${err.message}` });
  }
}

/**
 * POST /api/kasir/vision/build-dataset
 * Start a dataset rebuild on the Vision Server (runs in background). Returns immediately.
 */
export async function buildDataset(req: Request, res: Response): Promise<void> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), SYNC_TIMEOUT_SHORT);

    const visionRes = await fetch(`${VISION_SERVER_URL}/build-dataset`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body || {}),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    const data = await visionRes.json();
    res.status(visionRes.status).json(data);
  } catch (err: any) {
    res.status(503).json({ success: false, message: `Vision server unreachable: ${err.message}` });
  }
}

/**
 * GET /api/kasir/vision/build-status
 * Poll the current dataset-build status from the Vision Server.
 */
export async function buildStatus(_req: Request, res: Response): Promise<void> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), HEALTH_TIMEOUT);

    const visionRes = await fetch(`${VISION_SERVER_URL}/build-status`, {
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    const data = await visionRes.json();
    res.status(visionRes.status).json(data);
  } catch (err: any) {
    res.status(503).json({ state: 'offline', message: `Vision server unreachable: ${err.message}` });
  }
}

/**
 * POST /api/kasir/vision/train
 * Start model training on the Vision Server (runs in background on the GPU machine).
 */
export async function trainModel(req: Request, res: Response): Promise<void> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), SYNC_TIMEOUT_SHORT);

    const visionRes = await fetch(`${VISION_SERVER_URL}/train`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body || {}),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    const data = await visionRes.json();
    res.status(visionRes.status).json(data);
  } catch (err: any) {
    res.status(503).json({ success: false, message: `Vision server unreachable: ${err.message}` });
  }
}

/**
 * GET /api/kasir/vision/train-status
 * Poll the current training status from the Vision Server.
 */
export async function trainStatus(_req: Request, res: Response): Promise<void> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), HEALTH_TIMEOUT);

    const visionRes = await fetch(`${VISION_SERVER_URL}/train-status`, {
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    const data = await visionRes.json();
    res.status(visionRes.status).json(data);
  } catch (err: any) {
    res.status(503).json({ state: 'offline', message: `Vision server unreachable: ${err.message}` });
  }
}

/**
 * GET /api/kasir/vision/train-log
 * Poll recent training log lines from the Vision Server.
 */
export async function trainLog(_req: Request, res: Response): Promise<void> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), HEALTH_TIMEOUT);

    const visionRes = await fetch(`${VISION_SERVER_URL}/train-log`, {
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    const data = await visionRes.json();
    res.status(visionRes.status).json(data);
  } catch (err: any) {
    res.status(503).json({ log: [], message: `Vision server unreachable: ${err.message}` });
  }
}
/**
 * POST /api/kasir/vision/evaluate
 * Start source-held-out end-to-end scanner evaluation on the Vision Server.
 */
export async function startEvaluation(req: Request, res: Response): Promise<void> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), SYNC_TIMEOUT_SHORT);
    const visionRes = await fetch(`${VISION_SERVER_URL}/evaluate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body || {}),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    res.status(visionRes.status).json(await visionRes.json());
  } catch (err: any) {
    res.status(503).json({ success: false, message: `Vision server unreachable: ${err.message}` });
  }
}

export async function evaluationStatus(_req: Request, res: Response): Promise<void> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), HEALTH_TIMEOUT);
    const visionRes = await fetch(`${VISION_SERVER_URL}/evaluation-status`, { signal: controller.signal });
    clearTimeout(timeoutId);
    res.status(visionRes.status).json(await visionRes.json());
  } catch (err: any) {
    res.status(503).json({ state: 'offline', message: `Vision server unreachable: ${err.message}` });
  }
}

export async function evaluationReport(_req: Request, res: Response): Promise<void> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), HEALTH_TIMEOUT);
    const visionRes = await fetch(`${VISION_SERVER_URL}/evaluation-report`, { signal: controller.signal });
    clearTimeout(timeoutId);
    res.status(visionRes.status).json(await visionRes.json());
  } catch (err: any) {
    res.status(503).json({ success: false, message: `Vision server unreachable: ${err.message}` });
  }
}

/**
 * Proxy endpoint to FastAPI Vision Server /detect-v2 with YOLO-World and ResNet-50.
 */
export async function detectV2(req: Request, res: Response): Promise<void> {
  try {
    const file = (req as any).file;
    if (!file) {
      res.status(400).json({ success: false, message: 'No image file provided' });
      return;
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), DETECT_TIMEOUT);

      const formData = new FormData();
      const fileBlob = new Blob([file.buffer], { type: file.mimetype });
      formData.append('file', fileBlob, file.originalname);

      if (req.body.branch_id) formData.append('branch_id', req.body.branch_id);
      if (req.body.camera_id) formData.append('camera_id', req.body.camera_id);
      if (req.body.debug) formData.append('debug', req.body.debug);

      const visionRes = await fetch(`${VISION_SERVER_URL}/detect-v2`, {
        method: 'POST',
        body: formData,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      const visionData = await visionRes.json() as any;
      res.status(visionRes.status).json(visionData);
    } catch (visionErr: any) {
      const isTimeout = visionErr.name === 'AbortError';
      const msg = isTimeout
        ? 'Vision server timeout — pastikan vision server sudah berjalan'
        : 'Vision server tidak dapat dijangkau';
      console.warn(`[VISION-V2] ❌ ${msg}`);
      res.status(503).json({ success: false, message: msg, source: 'vision-server-offline' });
    }
  } catch (error) {
    console.error('[DETECT-V2] Detection endpoint error:', error);
    res.status(500).json({ success: false, message: 'Detection system error' });
  }
}

/**
 * POST /api/kasir/vision/sync-model
 * Trigger vision server model sync (download from cloud and reload).
 */
export async function syncModel(req: Request, res: Response): Promise<void> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), SYNC_TIMEOUT_SHORT);

    const visionRes = await fetch(`${VISION_SERVER_URL}/sync-model`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    const data = await visionRes.json();
    res.status(visionRes.status).json(data);
  } catch (err: any) {
    res.status(503).json({ success: false, message: `Vision server unreachable: ${err.message}` });
  }
}

/**
 * GET /api/kasir/vision/sync-model-status
 * Poll the current model sync status from the Vision Server.
 */
export async function syncModelStatus(_req: Request, res: Response): Promise<void> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), HEALTH_TIMEOUT);

    const visionRes = await fetch(`${VISION_SERVER_URL}/sync-model-status`, {
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    const data = await visionRes.json();
    res.status(visionRes.status).json(data);
  } catch (err: any) {
    res.status(503).json({ state: 'offline', message: `Vision server unreachable: ${err.message}` });
  }
}

/**
 * GET /api/kasir/vision/model-version
 * Get local and cloud model version/metadata info.
 */
export async function modelVersion(_req: Request, res: Response): Promise<void> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), HEALTH_TIMEOUT);

    const visionRes = await fetch(`${VISION_SERVER_URL}/model-version`, {
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    const data = await visionRes.json();
    res.status(visionRes.status).json(data);
  } catch (err: any) {
    res.status(503).json({ success: false, message: `Vision server unreachable: ${err.message}` });
  }
}
