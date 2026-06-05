import { Request, Response } from 'express';
import { supabase, supabaseAdmin } from '../../config/supabaseClient.js';

/**
 * Get member's current points balance.
 */
async function getBalance(req: Request, res: Response) {
  try {
    const userId = (req as any).user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, message: 'User ID not found in token' });
    }

    const client = supabaseAdmin || supabase;

    const { data, error } = await client
      .from('member_points')
      .select('balance, updated_at')
      .eq('user_id', userId)
      .single();

    if (error && error.code !== 'PGRST116') throw error;

    res.json({
      success: true,
      data: {
        balance: data?.balance ?? 0,
        updated_at: data?.updated_at ?? null,
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message || 'Failed to fetch points balance' });
  }
}

/**
 * Get member's points transaction history (earn/redeem).
 */
async function getHistory(req: Request, res: Response) {
  try {
    const userId = (req as any).user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, message: 'User ID not found in token' });
    }

    const client = supabaseAdmin || supabase;

    const { data, error } = await client
      .from('point_transactions')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    res.json({ success: true, data: data || [] });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message || 'Failed to fetch points history' });
  }
}

export default { getBalance, getHistory };
