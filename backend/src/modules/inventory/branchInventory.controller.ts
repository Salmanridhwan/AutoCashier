import { Request, Response } from 'express';
import * as branchService from './branchInventory.service.js';

function getBranchScope(req: Request, requestedBranchId?: string): string | undefined {
  const user = (req as any).user;
  return user?.role === 'branch_admin' ? user.branch_id : requestedBranchId;
}

function rejectMissingBranchScope(req: Request, res: Response, branchId?: string) {
  const user = (req as any).user;
  if (user?.role === 'branch_admin' && !branchId) {
    res.status(403).json({ status: 'error', message: 'Branch ID not found in token' });
    return true;
  }
  return false;
}

export async function listBranchSummaries(req: Request, res: Response) {
  const branchId = getBranchScope(req);
  if (rejectMissingBranchScope(req, res, branchId)) return;

  const result = await branchService.getBranchSummaries(branchId);
  if (!result.ok) return res.status(500).json({ status: 'error', error: result.error });
  return res.json({ status: 'success', data: result.data });
}

export async function getBranchInventoryDetails(req: Request, res: Response) {
  const branchId = getBranchScope(req, req.params.id);
  if (rejectMissingBranchScope(req, res, branchId)) return;

  const result = await branchService.getBranchInventory(branchId!);
  if (!result.ok) return res.status(500).json({ status: 'error', error: result.error });
  return res.json({ status: 'success', data: result.data });
}

export async function addInventory(req: Request, res: Response) {
  const user = (req as any).user;
  const locationId = user?.role === 'branch_admin' ? user.branch_id : req.body.location_id;

  if (!locationId || locationId === 'ALL') {
    return res.status(400).json({ status: 'error', message: 'Cabang tujuan wajib dipilih' });
  }

  const result = await branchService.addItem({ ...req.body, location_id: locationId });
  if (!result.ok) return res.status(500).json({ status: 'error', error: result.error });
  return res.json({ status: 'success', data: result.data });
}

export async function updateInventory(req: Request, res: Response) {
  const locationId = getBranchScope(req, req.body.location_id);
  if (rejectMissingBranchScope(req, res, locationId)) return;

  const payload = { ...req.body, id: req.params.id, location_id: locationId };
  const result = await branchService.updateItem(payload);
  if (!result.ok) return res.status(500).json({ status: 'error', error: result.error });
  return res.json({ status: 'success', data: result.data });
}

export async function deleteInventory(req: Request, res: Response) {
  const { id } = req.params;
  const branchId = getBranchScope(req, req.query.branch_id as string | undefined);
  if (rejectMissingBranchScope(req, res, branchId)) return;

  const result = await branchService.deleteItem(id, branchId);
  if (!result.ok) return res.status(500).json({ status: 'error', error: result.error });
  return res.json({ status: 'success' });
}

export async function adjustInventory(req: Request, res: Response) {
  const user = (req as any).user;
  const branchId = user?.role === 'branch_admin' ? user.branch_id : req.body.branchId;

  if (!branchId || branchId === 'ALL') {
    return res.status(400).json({ status: 'error', message: 'Cabang tujuan wajib dipilih' });
  }

  const payload = {
    ...req.body,
    branchId,
    performedBy: user?.sub || user?.id || null,
  };
  const result = await branchService.adjustStock(payload);
  if (!result.ok) {
    const message = typeof result.error === 'string'
      ? result.error
      : (result.error as any)?.message || 'Gagal memperbarui stok';
    return res.status(400).json({ status: 'error', message });
  }
  return res.json({ status: 'success', data: (result as any).newStock });
}

export async function getMovements(req: Request, res: Response) {
  const branchId = getBranchScope(req, req.params.id);
  if (rejectMissingBranchScope(req, res, branchId)) return;

  const { product_id } = req.query;
  const result = await branchService.getInventoryMovements(branchId!, product_id as string | undefined);
  if (!result.ok) return res.status(500).json({ status: 'error', error: result.error });
  return res.json({ status: 'success', data: result.data });
}
