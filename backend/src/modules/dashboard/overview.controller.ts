import { Request, Response } from 'express';
import { getOverviewData } from './overview.service.js';

export async function getOverview(req: Request, res: Response) {
  const { location_id, timeframe, year, month, week } = req.query as Record<string, string>;

  const result = await getOverviewData({ location_id, timeframe, year, month, week });

  if (!result.ok) {
    return res.status(500).json({ status: 'error', message: result.error });
  }

  return res.json({ status: 'success', data: result.data });
}
