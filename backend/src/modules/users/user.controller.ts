import { Request, Response } from 'express';
import * as userService from './user.service.js';

function getBranchAdminScope(req: Request): string | null {
  const user = (req as any).user;
  return user?.role === 'branch_admin' ? user.branch_id || null : null;
}

async function canManageUser(req: Request, res: Response, userId: string): Promise<boolean> {
  const branchId = getBranchAdminScope(req);
  if (!branchId) return true;

  const result = await userService.getUserAccessScope(userId);
  if (!result.ok) {
    res.status(500).json({ status: 'error', message: 'Failed to verify user access', error: result.error });
    return false;
  }
  if (!result.data) {
    res.status(404).json({ status: 'error', message: 'User not found' });
    return false;
  }
  if (result.data.role !== 'member' && result.data.branch_id !== branchId) {
    res.status(403).json({ status: 'error', message: 'Cannot access users from another branch' });
    return false;
  }
  return true;
}

function scopeUserPayload(req: Request, payload: any) {
  const branchId = getBranchAdminScope(req);
  if (!branchId) return payload;

  const role = String(payload.role || '').toLowerCase().replace(' ', '_');
  if (role === 'branch_admin' || role === 'kasir' || role === 'cashier') {
    return { ...payload, branchId };
  }
  return payload;
}

export async function getUsers(req: Request, res: Response) {
  const result = await userService.getAllUsers(getBranchAdminScope(req) || undefined);
  if (result.ok) {
    return res.json({ status: 'success', data: result.data });
  }
  return res.status(500).json({ status: 'error', message: 'Failed to fetch users', error: result.error });
}

export async function createUser(req: Request, res: Response) {
  const { name, email, role, password, branchId } = req.body;
  
  if (!name || !email || !role || !password) {
    return res.status(400).json({ status: 'error', message: 'Missing required fields' });
  }

  const result = await userService.createUser(scopeUserPayload(req, { name, email, role, password, branchId }));
  if (result.ok) {
    return res.status(201).json({ status: 'success', data: result.data });
  }
  return res.status(500).json({ status: 'error', message: 'Failed to create user', error: result.error });
}

export async function updateUser(req: Request, res: Response) {
  const { id } = req.params;
  if (!(await canManageUser(req, res, id))) return;
  const updates = scopeUserPayload(req, req.body);

  const result = await userService.updateUser(id, updates);
  if (result.ok) {
    return res.json({ status: 'success', message: 'User updated successfully' });
  }
  return res.status(500).json({ status: 'error', message: 'Failed to update user', error: result.error });
}

export async function deleteUser(req: Request, res: Response) {
  const { id } = req.params;
  if (!(await canManageUser(req, res, id))) return;

  const result = await userService.deleteUser(id);
  if (result.ok) {
    return res.json({ status: 'success', message: 'User deleted successfully' });
  }
  return res.status(500).json({ status: 'error', message: 'Failed to delete user', error: result.error });
}

export async function assignMemberPromo(req: Request, res: Response) {
  const { id } = req.params;
  const promoData = req.body;
  if (!(await canManageUser(req, res, id))) return;

  if (!promoData.code || !promoData.discount_type || !promoData.discount_value) {
    return res.status(400).json({ status: 'error', message: 'Missing required promo fields' });
  }

  const result = await userService.assignMemberPromo(id, promoData);
  if (result.ok) {
    return res.status(201).json({ status: 'success', data: result.data });
  }
  return res.status(500).json({ status: 'error', message: 'Failed to assign promo', error: result.error });
}
