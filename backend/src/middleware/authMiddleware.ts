import { Request, Response, NextFunction } from 'express';
import { verifyToken } from '../utils/jwt.js';

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ status: 'error', error: 'UNAUTHORIZED' });
  }

  const token = header.replace('Bearer ', '').trim();
  const payload = verifyToken(token);
  if (!payload) {
    return res.status(401).json({ status: 'error', error: 'INVALID_TOKEN' });
  }

  (req as any).user = payload;
  next();
}
