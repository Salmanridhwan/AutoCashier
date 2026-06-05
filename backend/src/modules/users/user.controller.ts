import { Request, Response } from 'express';
import * as userService from './user.service.js';

export async function getUsers(req: Request, res: Response) {
  const result = await userService.getAllUsers();
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

  const result = await userService.createUser({ name, email, role, password, branchId });
  if (result.ok) {
    return res.status(201).json({ status: 'success', data: result.data });
  }
  return res.status(500).json({ status: 'error', message: 'Failed to create user', error: result.error });
}

export async function updateUser(req: Request, res: Response) {
  const { id } = req.params;
  const updates = req.body;

  const result = await userService.updateUser(id, updates);
  if (result.ok) {
    return res.json({ status: 'success', message: 'User updated successfully' });
  }
  return res.status(500).json({ status: 'error', message: 'Failed to update user', error: result.error });
}

export async function deleteUser(req: Request, res: Response) {
  const { id } = req.params;

  const result = await userService.deleteUser(id);
  if (result.ok) {
    return res.json({ status: 'success', message: 'User deleted successfully' });
  }
  return res.status(500).json({ status: 'error', message: 'Failed to delete user', error: result.error });
}

export async function assignMemberPromo(req: Request, res: Response) {
  const { id } = req.params;
  const promoData = req.body;

  if (!promoData.code || !promoData.discount_type || !promoData.discount_value) {
    return res.status(400).json({ status: 'error', message: 'Missing required promo fields' });
  }

  const result = await userService.assignMemberPromo(id, promoData);
  if (result.ok) {
    return res.status(201).json({ status: 'success', data: result.data });
  }
  return res.status(500).json({ status: 'error', message: 'Failed to assign promo', error: result.error });
}
