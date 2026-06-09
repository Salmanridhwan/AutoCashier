import jwt from 'jsonwebtoken';
import { env } from '../config/environment.js';

export function signToken(payload: object, expiresIn?: string | number) {
  const options = { expiresIn: expiresIn || env.jwtExpiresIn || '24h' } as jwt.SignOptions;
  return (jwt as any).sign(payload, env.jwtSecret as any, options);
}

export function verifyToken(token: string) {
  try {
    return (jwt as any).verify(token, env.jwtSecret as any) as any;
  } catch (err) {
    return null;
  }
}
