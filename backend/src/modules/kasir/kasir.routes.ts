import { Router } from 'express';
import { Request, Response } from 'express';
import { supabase } from '../../config/supabaseClient.js';
import * as checkoutController from './checkout.controller.js';
import * as visionController from '../vision/vision.controller.js';
import visionRoutes from '../vision/vision.routes.js';

const router = Router();

// --- AI Detection ---
router.post('/detect', visionController.detect);

// --- Checkout ---
router.post('/checkout', checkoutController.checkout);

// --- Products (for POS display) ---
router.get('/products', async (_req: Request, res: Response) => {
  try {
    const { data: products, error } = await supabase.from('products').select('*').order('name');
    if (error) throw error;
    res.json({ success: true, products });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.get('/products/search', async (req: Request, res: Response) => {
  try {
    const { label } = req.query;
    if (!label) {
      res.status(400).json({ success: false, message: 'Label parameter required' });
      return;
    }
    const { data: product, error } = await supabase
      .from('products')
      .select('*')
      .or(`ai_label.eq."${label}",sku.eq."${label}",name.ilike."%${label}%"`)
      .single();
    if (error || !product) {
      res.status(404).json({ success: false, message: 'Product not found' });
      return;
    }
    res.json({ success: true, product });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// --- Member check (for kasir to verify member at POS) ---
// NOTE: This route is also registered as PUBLIC in backend/src/routes/kasir.routes.ts
// (before requireAuth), so it works even when kasir is in guest/unauthenticated mode.
// This protected version is kept as fallback for authenticated kasir sessions.
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

// --- Member promos (for kasir to apply promo at POS) ---
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
    console.error('[MEMBER] Get promos error:', error);
    res.status(500).json({ success: false, message: 'Gagal mengambil promo', error: error.message });
  }
});

// --- Member points (for kasir to check/apply points at POS) ---
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
    console.error('[MEMBER] Get points error:', error);
    res.status(500).json({ success: false, message: 'Gagal mengambil poin', error: error.message });
  }
});

// --- Vision server proxy routes ---
router.use('/vision', visionRoutes);

export default router;
