import { Request, Response } from 'express';
import * as broadcastService from './broadcast.service.js';

export async function getBroadcasts(req: Request, res: Response) {
  const result = await broadcastService.getAllBroadcasts();
  if (result.ok) {
    return res.json({ status: 'success', data: result.data });
  }
  return res.status(500).json({ status: 'error', message: 'Failed to fetch broadcasts' });
}

export async function sendBroadcast(req: Request, res: Response) {
  const { subject, message, audience, targetId } = req.body;
  
  if (!subject || !message || !audience) {
    return res.status(400).json({ status: 'error', message: 'Missing required fields' });
  }

  const result = await broadcastService.createBroadcast({ subject, message, audience, targetId });
  if (result.ok) {
    return res.status(201).json({ status: 'success', data: result.data });
  }
  return res.status(500).json({ status: 'error', message: 'Failed to dispatch broadcast' });
}
