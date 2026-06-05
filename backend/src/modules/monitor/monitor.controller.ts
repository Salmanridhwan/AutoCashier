import { Request, Response } from 'express';
import { getProductSalesData } from './monitor.service.js';

export async function getProductAnalytics(req: Request, res: Response) {
  const { location_id, timeframe } = req.query as Record<string, string>;

  const result = await getProductSalesData({ location_id, timeframe });

  if (!result.ok) {
    return res.status(500).json({ status: 'error', message: result.error });
  }

  return res.json({ status: 'success', data: result.data });
}
