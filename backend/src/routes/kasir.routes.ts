import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/authMiddleware.js';
import { requireRole } from '../middleware/rbacMiddleware.js';
import kasirModuleRoutes from '../modules/kasir/kasir.routes.js';
import { healthCheck, detect } from '../modules/vision/vision.controller.js';
import { supabaseAdmin as supabase } from '../config/supabaseClient.js';
import * as checkoutController from '../modules/kasir/checkout.controller.js';

const router = Router();

// =====================================================================
// PUBLIC ROUTES — No auth needed (POS kiosk mode tanpa login password)
// =====================================================================

// AI Vision
router.get('/vision/health', healthCheck);
router.post('/detect', detect);

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

// Checkout — inti transaksi POS, harus selalu bisa diproses
router.post('/checkout', checkoutController.checkout);

// Products — POS perlu load produk tanpa login
router.get('/products', async (_req: Request, res: Response) => {
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
    const now = new Date().toISOString();
    const { data: promos, error } = await supabase
      .from('member_promos')
      .select('*')
      .eq('user_id', user_id)
      .eq('is_used', false)
      .or(`expires_at.is.null,expires_at.gt.${now}`);
    if (error) throw error;
    res.json({ success: true, promos: promos || [] });
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
