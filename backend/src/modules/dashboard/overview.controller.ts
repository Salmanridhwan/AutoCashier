import { Request, Response } from 'express';
import { getOverviewData } from './overview.service.js';

export async function getOverview(req: Request, res: Response) {
  const { location_id, timeframe, year, month, week } = req.query as Record<string, string>;
  const user = (req as any).user;
  const scopedLocationId = user?.role === 'branch_admin' ? user.branch_id : location_id;

  if (user?.role === 'branch_admin' && !scopedLocationId) {
    return res.status(403).json({ status: 'error', message: 'Branch ID not found in token' });
  }

  const result = await getOverviewData({ location_id: scopedLocationId, timeframe, year, month, week });

  if (!result.ok) {
    return res.status(500).json({ status: 'error', message: result.error });
  }

  return res.json({ status: 'success', data: result.data });
}
