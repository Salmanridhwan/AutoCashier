import { Request, Response } from 'express';
import { supabase, supabaseAdmin } from '../../config/supabaseClient.js';

/**
 * Get available promos for the authenticated member.
 * Returns both unclaimed (template) promos and the member's claimed but unused promos.
 */
async function getMemberPromos(req: Request, res: Response) {
  try {
    const userId = (req as any).user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, message: 'User ID not found in token' });
    }

    const client = supabaseAdmin || supabase;

    // Get promos available to this member: unclaimed templates + member's own claimed unused promos
    const { data, error } = await client
      .from('member_promos')
      .select('*')
      .or(`user_id.eq.${userId},user_id.is.null`)
      .eq('is_used', false)
      .order('created_at', { ascending: false });

    if (error) throw error;

    res.json({ success: true, data: data || [] });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message || 'Failed to fetch promos' });
  }
}

/**
 * Claim a promo for the authenticated member.
 */
async function claimPromo(req: Request, res: Response) {
  try {
    const userId = (req as any).user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, message: 'User ID not found in token' });
    }

    const { promoCode } = req.body;
    if (!promoCode) {
      return res.status(400).json({ success: false, message: 'promoCode is required' });
    }

    const client = supabaseAdmin || supabase;

    // Check if already claimed
    const { data: existingClaim } = await client
      .from('member_promos')
      .select('id')
      .eq('user_id', userId)
      .eq('code', promoCode)
      .single();

    if (existingClaim) {
      return res.status(400).json({ success: false, message: 'Anda sudah mengklaim voucher ini.' });
    }

    // Get the promo template
    const { data: promoTemplate, error: fetchError } = await client
      .from('member_promos')
      .select('*')
      .is('user_id', null)
      .eq('code', promoCode)
      .single();

    if (fetchError || !promoTemplate) {
      return res.status(404).json({ success: false, message: 'Promo tidak ditemukan.' });
    }

    // Clone the promo for this user
    const { error: insertError } = await client.from('member_promos').insert({
      user_id: userId,
      code: promoTemplate.code,
      discount_type: promoTemplate.discount_type,
      discount_value: promoTemplate.discount_value,
      min_purchase: promoTemplate.min_purchase,
      expires_at: promoTemplate.expires_at,
      is_used: false,
    });

    if (insertError) throw insertError;

    res.json({ success: true, message: 'Promo berhasil diklaim.' });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message || 'Failed to claim promo' });
  }
}

export default { getMemberPromos, claimPromo };
