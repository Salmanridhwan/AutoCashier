import { Router } from 'express';
import {
  listProducts,
  searchProduct,
  getProduct,
  createProduct,
  updateProductController,
  deleteProductController,
  uploadBackground,
  getBackground,
  clearBackground,
} from './product.controller.js';
import { supabase, supabaseAdmin } from '../../config/supabaseClient.js';
import {
  listRequests,
  submitRequest,
  approveRequest,
  rejectRequest,
  cancelRequest,
} from './productRequests.controller.js';
import { uploadMedia } from '../../middleware/upload.js';
import { requireAuth } from '../../middleware/authMiddleware.js';
import { requireRole } from '../../middleware/rbacMiddleware.js';

const router = Router();

// ─── Public / Any-Auth Routes ─────────────────────────────────────────────────
router.get('/', listProducts);
router.get('/search', searchProduct);
router.get('/:id/images', async (req, res) => {
  try {
    const client: any = supabaseAdmin || supabase;
    const { data, error } = await client.from('product_images').select('id, angle, image_url, filename').eq('product_id', req.params.id);
    if (error) return res.status(500).json({ status: 'error', error: error.message });
    return res.json({ status: 'success', data: data || [] });
  } catch (err: any) {
    return res.status(500).json({ status: 'error', error: err.message });
  }
});
// ─── Background training media (must be BEFORE '/:id' to avoid being captured) ──
const POS_ADMIN_ROLES = ['super_admin', 'branch_admin', 'admin'];
router.get('/background', requireAuth, requireRole(POS_ADMIN_ROLES), getBackground);
router.post('/background', requireAuth, requireRole(POS_ADMIN_ROLES), uploadMedia.array('files', 60), uploadBackground);
router.delete('/background', requireAuth, requireRole(POS_ADMIN_ROLES), clearBackground);

router.get('/:id', getProduct);

// ─── Super Admin Only: Create / Edit / Delete master products ─────────────────
router.post(
  '/',
  requireAuth,
  requireRole(['super_admin', 'admin']),
  uploadMedia.fields([
    { name: 'imageLeft', maxCount: 1 },
    { name: 'imageRight', maxCount: 1 },
    { name: 'imageFront', maxCount: 1 },
    { name: 'imageBack', maxCount: 1 },
    { name: 'video', maxCount: 10 },
  ]),
  createProduct
);

router.put('/:id', requireAuth, requireRole(['super_admin', 'admin']), uploadMedia.fields([
  { name: 'imageLeft', maxCount: 1 },
  { name: 'imageRight', maxCount: 1 },
  { name: 'imageFront', maxCount: 1 },
  { name: 'imageBack', maxCount: 1 },
  { name: 'video', maxCount: 10 },
]), updateProductController);
router.delete('/:id', requireAuth, requireRole(['super_admin', 'admin']), deleteProductController);

// ─── Product Requests (Branch Admin → Super Admin approval flow) ───────────────
// GET all requests (super admin sees all; branch admin sees own)
router.get('/requests/list', requireAuth, listRequests);

// Branch Admin submits a new product request
router.post(
  '/requests',
  requireAuth,
  requireRole(['branch_admin', 'admin']),
  uploadMedia.fields([
    { name: 'imageLeft', maxCount: 1 },
    { name: 'imageRight', maxCount: 1 },
    { name: 'imageFront', maxCount: 1 },
    { name: 'imageBack', maxCount: 1 },
    { name: 'video', maxCount: 10 },
  ]),
  submitRequest
);

// Super Admin approves a request
router.patch(
  '/requests/:id/approve',
  requireAuth,
  requireRole(['super_admin']),
  approveRequest
);

// Super Admin rejects a request
router.patch(
  '/requests/:id/reject',
  requireAuth,
  requireRole(['super_admin']),
  rejectRequest
);

// Branch Admin cancels their own pending request
router.delete(
  '/requests/:id',
  requireAuth,
  requireRole(['branch_admin', 'admin']),
  cancelRequest
);

export default router;
