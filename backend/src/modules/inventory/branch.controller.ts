import { Request, Response } from 'express';
import { supabaseAdmin } from '../../config/supabaseClient.js';

export async function getBranches(req: Request, res: Response) {
  try {
    const { data, error } = await supabaseAdmin
      .from('branches')
      .select('id, name')
      .order('name');
    
    if (error) throw error;
    
    return res.json({ status: 'success', data });
  } catch (err: any) {
    console.error('[branchController] Error fetching branches:', err);
    return res.status(500).json({ status: 'error', error: err.message });
  }
}
