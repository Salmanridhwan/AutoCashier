import { Request, Response } from 'express';
import { supabase, supabaseAdmin } from '../../config/supabaseClient.js';

/**
 * Get member's vouchers (claimed promos that can be redeemed).
 */
async function getVouchers(req: Request, res: Response) {
  try {
    const userId = (req as any).user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, message: 'User ID not found in token' });
    }

    const client = supabaseAdmin || supabase;

    const { data, error } = await client
      .from('member_promos')
      .select('*')
      .eq('user_id', userId)
      .eq('is_used', false)
      .order('created_at', { ascending: false });

    if (error) throw error;

    res.json({ success: true, data: data || [] });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message || 'Failed to fetch vouchers' });
  }
}

/**
 * Redeem a voucher by marking it as used and deducting points if applicable.
 */
async function redeemVoucher(req: Request, res: Response) {
  try {
    const userId = (req as any).user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, message: 'User ID not found in token' });
    }

    const { voucherCode } = req.body;
    if (!voucherCode) {
      return res.status(400).json({ success: false, message: 'voucherCode is required' });
    }

    const client = supabaseAdmin || supabase;

    // Find the voucher belonging to this user
    const { data: voucher, error: fetchError } = await client
      .from('member_promos')
      .select('*')
      .eq('user_id', userId)
      .eq('code', voucherCode)
      .eq('is_used', false)
      .single();

    if (fetchError || !voucher) {
      return res.status(404).json({ success: false, message: 'Voucher tidak ditemukan atau sudah digunakan.' });
    }

    // Check expiry
    if (voucher.expires_at && new Date(voucher.expires_at) < new Date()) {
      return res.status(400).json({ success: false, message: 'Voucher sudah kadaluarsa.' });
    }

    // Mark as used
    const { error: updateError } = await client
      .from('member_promos')
      .update({ is_used: true, used_at: new Date().toISOString() })
      .eq('id', voucher.id);

    if (updateError) throw updateError;

    res.json({ success: true, message: 'Voucher berhasil digunakan.', data: voucher });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message || 'Failed to redeem voucher' });
  }
}

export default { getVouchers, redeemVoucher };
