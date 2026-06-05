import { Request, Response } from 'express';
import { loginWithUsername, registerMember, verifyMemberOtp } from './auth.service.js';

/**
 * Maps a user role to the appropriate redirect path after login.
 * - super_admin / branch_admin / admin → /admin
 * - kasir → /kasir
 * - member → /member
 */
export function getRedirectForRole(role: string): '/admin' | '/kasir' | '/member' {
  switch (role) {
    case 'super_admin':
    case 'branch_admin':
    case 'admin':
      return '/admin';
    case 'kasir':
      return '/kasir';
    case 'member':
    default:
      return '/member';
  }
}

export async function loginController(req: Request, res: Response) {
  const { username, phone, password } = req.body;
  const loginIdentifier = username || phone;
  if (!loginIdentifier || !password) return res.status(400).json({ status: 'error', error: 'INVALID_INPUT' });

  const result = await loginWithUsername(loginIdentifier, password);
  if (!result.ok) return res.status(401).json({ status: 'error', error: result.error || 'LOGIN_FAILED' });

  const redirect = getRedirectForRole(result.user?.role || 'member');

  // Return both flat format (for kasir/member frontends) and nested format (for compatibility)
  return res.json({
    success: true,
    status: 'success',
    token: result.token,
    user: result.user,
    redirect,
    data: { token: result.token, user: result.user, redirect },
  });
}

export function meController(req: Request, res: Response) {
  // user injected by auth middleware
  const user = (req as any).user;
  if (!user) return res.status(401).json({ status: 'error', error: 'UNAUTHORIZED' });
  return res.json({ status: 'success', data: user });
}

export async function registerController(req: Request, res: Response) {
  try {
    const { username, email, phone, password } = req.body;
    if (!username || !email || !phone || !password) {
      return res.status(400).json({ status: 'error', error: 'MISSING_FIELDS' });
    }

    const result = await registerMember(username, email, phone, password);
    if (!result.ok) {
      return res.status(400).json({ status: 'error', error: result.error || 'REGISTRATION_FAILED' });
    }

    return res.json({
      success: true,
      status: 'success',
      message: 'OTP_SENT'
    });
  } catch (error: any) {
    return res.status(500).json({ status: 'error', error: error.message || 'SERVER_ERROR' });
  }
}

export async function verifyOtpController(req: Request, res: Response) {
  try {
    const { email, otp } = req.body;
    if (!email || !otp) {
      return res.status(400).json({ status: 'error', error: 'MISSING_FIELDS' });
    }

    // Direct mock validation: Accept any 6 digit code for instant development & local testing
    const result = await verifyMemberOtp(email, otp);
    if (!result.ok) {
      return res.status(401).json({ status: 'error', error: result.error || 'VERIFICATION_FAILED' });
    }

    return res.json({
      success: true,
      status: 'success',
      token: result.token,
      user: result.user,
      data: { token: result.token, user: result.user }
    });
  } catch (error: any) {
    return res.status(500).json({ status: 'error', error: error.message || 'SERVER_ERROR' });
  }
}
