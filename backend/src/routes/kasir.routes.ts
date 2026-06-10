import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/authMiddleware.js';
import { requireRole } from '../middleware/rbacMiddleware.js';
import kasirModuleRoutes from '../modules/kasir/kasir.routes.js';
import { healthCheck, detect, detectV2 } from '../modules/vision/vision.controller.js';
import { upload } from '../middleware/upload.js';
import { supabaseAdmin as supabase } from '../config/supabaseClient.js';
import * as checkoutController from '../modules/kasir/checkout.controller.js';
import { verifyToken } from '../utils/jwt.js';

const router = Router();

// Role yang boleh mengakses operasi kasir/POS (PRD §22.3)
const POS_ROLES = ['kasir', 'admin', 'branch_admin', 'super_admin'];

// =====================================================================
// PUBLIC ROUTES — No auth needed
// =====================================================================

// Vision health — status check, tidak sensitif
router.get('/vision/health', healthCheck);

// AI Vision — wajib login (kasir/admin/branch_admin/super_admin)
router.post('/detect', requireAuth, requireRole(POS_ROLES), detect);
router.post('/detect-v2', requireAuth, requireRole(POS_ROLES), upload.single('file'), detectV2);

// Member check — hanya baca, tidak sensitif
router.post('/members/check', async (req: Request, res: Response) => {
  try {
    const { phone } = req.body;
    if (!phone) {
      res.status(400).json({ success: false, message: 'Nomor WhatsApp diperlukan' });
      return;
    }

    // Normalize phone input to check common formats (08xx, 628xx, +628xx)
    let cleanPhone = phone.replace(/\D/g, '');
    let format0 = cleanPhone;
    let format62 = cleanPhone;
    let formatPlus62 = '+' + cleanPhone;

    if (cleanPhone.startsWith('0')) {
      format62 = '62' + cleanPhone.slice(1);
      formatPlus62 = '+62' + cleanPhone.slice(1);
    } else if (cleanPhone.startsWith('62')) {
      format0 = '0' + cleanPhone.slice(2);
      formatPlus62 = '+' + cleanPhone;
    }

    const checkPhones = [phone, format0, format62, formatPlus62];
    console.log('[MEMBER CHECK] Incoming phone:', phone);
    console.log('[MEMBER CHECK] Checking formats:', checkPhones);

    const { data: member, error } = await supabase
      .from('users')
      .select('id, full_name, role, whatsapp')
      .in('whatsapp', checkPhones)
      .limit(1)
      .maybeSingle();

    console.log('[MEMBER CHECK] Query result:', member, 'Error:', error);

    if (error) throw error;

    if (member) {
      res.json({
        success: true,
        isMember: true,
        user: { id: member.id, name: member.full_name, role: member.role, phone: member.whatsapp },
      });
    } else {
      res.json({ success: true, isMember: false, message: 'Member tidak ditemukan' });
    }
  } catch (error: any) {
    console.error('[MEMBER CHECK] Check error:', error);
    res.status(500).json({ success: false, message: error.message || 'Gagal memeriksa keanggotaan' });
  }
});

// Checkout — inti transaksi POS, wajib login
router.post('/checkout', requireAuth, requireRole(POS_ROLES), checkoutController.checkout);

// Products — wajib login (kasir/admin/branch_admin/super_admin)
router.get('/products', requireAuth, requireRole(POS_ROLES), async (_req: Request, res: Response) => {
  try {
    const { data: products, error } = await supabase.from('products').select('*').order('name');
    if (error) throw error;
    res.json({ success: true, products });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Member points — dibutuhkan CartSummaryPage untuk tampilkan saldo poin
router.get('/members/points', async (req: Request, res: Response) => {
  try {
    const { user_id } = req.query;
    if (!user_id) {
      res.status(400).json({ success: false, message: 'user_id diperlukan' });
      return;
    }
    const { data: pointsData, error } = await supabase
      .from('member_points')
      .select('balance')
      .eq('user_id', user_id)
      .maybeSingle();
    if (error) throw error;
    res.json({ success: true, balance: pointsData?.balance || 0 });
  } catch (error: any) {
    console.error('[POINTS] Get error:', error);
    res.status(500).json({ success: false, message: 'Gagal mengambil poin', error: error.message });
  }
});

// Member promos — dibutuhkan CartSummaryPage untuk tampilkan promo aktif
router.get('/members/promos', async (req: Request, res: Response) => {
  try {
    const { user_id } = req.query;
    if (!user_id) {
      res.status(400).json({ success: false, message: 'user_id diperlukan' });
      return;
    }

    // Try to get branch ID from auth token
    let branchId: string | null = null;
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      try {
        const payload = verifyToken(token);
        if (payload) {
          branchId = (payload as any).branch_id;
        }
      } catch (e) {}
    }
    const branchIdFromQuery = req.query.branch_id as string | undefined;
    if (!branchId && branchIdFromQuery) {
      branchId = branchIdFromQuery;
    }

    const now = new Date();
    const nowIso = now.toISOString();

    // 1. Fetch targeted promo IDs
    const { data: targeted } = await supabase
      .from('promo_target_users')
      .select('promo_id')
      .eq('user_id', user_id);
    const targetedIds = (targeted || []).map((t: any) => t.promo_id);

    // 2. Fetch user usages
    const { data: usages } = await supabase
      .from('promo_usages')
      .select('promo_id')
      .eq('user_id', user_id);
    const usageCounts = (usages || []).reduce((acc: Record<string, number>, u: any) => {
      acc[u.promo_id] = (acc[u.promo_id] || 0) + 1;
      return acc;
    }, {});

    // 3. Fetch all active or future-active promos
    const { data: promos, error } = await supabase
      .from('member_promos')
      .select('*')
      .eq('is_active', true)
      .or(`expires_at.is.null,expires_at.gt.${nowIso}`);

    console.log('[PROMOS DEBUG] user_id:', user_id, 'branchId:', branchId);
    console.log('[PROMOS DEBUG] Raw query returned', promos?.length ?? 0, 'promos, error:', error);
    if (promos && promos.length > 0) {
      promos.forEach((p: any) => console.log('[PROMOS DEBUG] Promo:', p.id, p.code, 'target_type:', p.target_type, 'user_id:', p.user_id, 'is_active:', p.is_active, 'scope:', p.conditions?.scope));
    }

    if (error) throw error;

    // 4. Filter promos
    const eligiblePromos = (promos || []).filter((promo: any) => {
      // Branch scope check (promo.conditions.scope)
      const promoScope = promo.conditions?.scope || 'ALL';
      if (promoScope !== 'ALL' && branchId && promoScope !== branchId) {
        return false;
      }

      // Check if starts_at is in the future
      if (promo.starts_at && new Date(promo.starts_at) > now) {
        return false;
      }

      // Check usage limits
      if (promo.usage_limit && (promo.usage_count || 0) >= promo.usage_limit) {
        return false;
      }

      // Check per user limit
      if (promo.per_user_limit) {
        const userUsage = usageCounts[promo.id] || 0;
        if (userUsage >= promo.per_user_limit) return false;
      }

      // If user_id is set on the promo (individually assigned):
      if (promo.user_id) {
        return promo.user_id === user_id && !promo.is_used;
      }

      // If targeted to specific users:
      if (promo.target_type === 'SPECIFIC') {
        return targetedIds.includes(promo.id);
      }

      return true;
    });

    console.log('[PROMOS DEBUG] After filter:', eligiblePromos.length, 'eligible promos');

    res.json({ success: true, promos: eligiblePromos });
  } catch (error: any) {
    console.error('[PROMOS] Get error:', error);
    res.status(500).json({ success: false, message: 'Gagal mengambil promo', error: error.message });
  }
});

// =====================================================================
// PROTECTED ROUTES — Requires JWT + kasir/admin role
// =====================================================================
router.use(requireAuth, requireRole(['kasir', 'super_admin', 'branch_admin']));

// Mount remaining kasir module routes (promos, points, vision proxy, dll)
router.use('/', kasirModuleRoutes);

export default router;
