import { Request, Response } from 'express';
import { supabaseAdmin } from '../../config/supabaseClient.js';

export async function getBranches(req: Request, res: Response) {
  try {
    const user = (req as any).user;
    let query = supabaseAdmin
      .from('branches')
      .select('id, name');
    if (user?.role === 'branch_admin') {
      query = query.eq('id', user.branch_id);
    }
    const { data, error } = await query.order('name');
    
    if (error) throw error;
    
    return res.json({ status: 'success', data });
  } catch (err: any) {
    console.error('[branchController] Error fetching branches:', err);
    return res.status(500).json({ status: 'error', error: err.message });
  }
}
