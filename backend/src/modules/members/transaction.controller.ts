import { Request, Response } from 'express';
import { supabase, supabaseAdmin } from '../../config/supabaseClient.js';

/**
 * Get member's transaction history with items and earned points.
 * Filters by the authenticated member's user ID from the auth token.
 */
async function getMemberTransactions(req: Request, res: Response) {
  try {
    const userId = (req as any).user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, message: 'User ID not found in token' });
    }

    const client = supabaseAdmin || supabase;

    const { data, error } = await client
      .from('transactions')
      .select('*, transaction_items(*, products(name))')
      .eq('member_id', userId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    // Enrich with earned points per transaction
    const { data: pointsData } = await client
      .from('point_transactions')
      .select('transaction_id, points')
      .eq('user_id', userId)
      .eq('type', 'earn');

    const enriched = (data || []).map((tx: any) => {
      const pointEntry = (pointsData || []).find(
        (p: any) => p.transaction_id === tx.id
      );
      return { ...tx, points: pointEntry?.points ?? 0 };
    });

    res.json({ success: true, data: enriched });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message || 'Failed to fetch transactions' });
  }
}

export default { getMemberTransactions };
