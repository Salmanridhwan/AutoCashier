import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Request, Response } from 'express';

vi.mock('../modules/inventory/branchInventory.service.js', () => ({
  getBranchSummaries: vi.fn(),
  getBranchInventory: vi.fn(),
  addItem: vi.fn(),
  updateItem: vi.fn(),
  deleteItem: vi.fn(),
  adjustStock: vi.fn(),
  getInventoryMovements: vi.fn(),
}));

import * as branchService from '../modules/inventory/branchInventory.service.js';
import {
  addInventory,
  adjustInventory,
  deleteInventory,
  getBranchInventoryDetails,
  updateInventory,
} from '../modules/inventory/branchInventory.controller.js';

function createResponse() {
  const response: any = {
    statusCode: 200,
    body: null,
  };
  response.status = vi.fn((statusCode: number) => {
    response.statusCode = statusCode;
    return response;
  });
  response.json = vi.fn((body: any) => {
    response.body = body;
    return response;
  });
  return response as Response & { statusCode: number; body: any };
}

describe('branch inventory controller', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects restocking at another branch as branch admin', async () => {
    const req = {
      user: { role: 'branch_admin', branch_id: 'branch-1', sub: 'user-1' },
      body: {
        inventoryId: 'inventory-1',
        branchId: 'branch-other',
        productId: 'product-1',
        type: 'RESTOCK',
        quantity: 8,
      },
    } as unknown as Request;
    const res = createResponse();

    await adjustInventory(req, res);

    expect(res.statusCode).toBe(403);
    expect(branchService.adjustStock).not.toHaveBeenCalled();
  });

  it('allows restocking at own branch as branch admin', async () => {
    vi.mocked(branchService.adjustStock).mockResolvedValue({ ok: true, newStock: 18 });
    const req = {
      user: { role: 'branch_admin', branch_id: 'branch-1', sub: 'user-1' },
      body: {
        inventoryId: 'inventory-1',
        branchId: 'branch-1',
        productId: 'product-1',
        type: 'RESTOCK',
        quantity: 8,
      },
    } as unknown as Request;
    const res = createResponse();

    await adjustInventory(req, res);

    expect(res.statusCode).toBe(200);
    expect(branchService.adjustStock).toHaveBeenCalledWith(expect.objectContaining({
      branchId: 'branch-1',
      performedBy: 'user-1',
      type: 'RESTOCK',
      quantity: 8,
    }));
  });

  it('rejects adding a catalog product to another branch as branch admin', async () => {
    const req = {
      user: { role: 'branch_admin', branch_id: 'branch-1', sub: 'user-1' },
      body: {
        catalogId: 'product-1',
        location_id: 'branch-other',
        stock: 5,
      },
    } as unknown as Request;
    const res = createResponse();

    await addInventory(req, res);

    expect(res.statusCode).toBe(403);
    expect(branchService.addItem).not.toHaveBeenCalled();
  });

  it('allows adding a catalog product to own branch as branch admin', async () => {
    vi.mocked(branchService.addItem).mockResolvedValue({ ok: true, data: { id: 'inventory-1' } } as any);
    const req = {
      user: { role: 'branch_admin', branch_id: 'branch-1', sub: 'user-1' },
      body: {
        catalogId: 'product-1',
        location_id: 'branch-1',
        stock: 5,
      },
    } as unknown as Request;
    const res = createResponse();

    await addInventory(req, res);

    expect(res.statusCode).toBe(200);
    expect(branchService.addItem).toHaveBeenCalledWith(expect.objectContaining({
      catalogId: 'product-1',
      location_id: 'branch-1',
      stock: 5,
    }));
  });

  it('rejects reading another branch inventory as branch admin', async () => {
    const req = {
      user: { role: 'branch_admin', branch_id: 'branch-1' },
      params: { id: 'branch-other' },
    } as unknown as Request;
    const res = createResponse();

    await getBranchInventoryDetails(req, res);

    expect(res.statusCode).toBe(403);
    expect(branchService.getBranchInventory).not.toHaveBeenCalled();
  });

  it('allows reading own branch inventory as branch admin', async () => {
    vi.mocked(branchService.getBranchInventory).mockResolvedValue({ ok: true, data: [] });
    const req = {
      user: { role: 'branch_admin', branch_id: 'branch-1' },
      params: { id: 'branch-1' },
    } as unknown as Request;
    const res = createResponse();

    await getBranchInventoryDetails(req, res);

    expect(res.statusCode).toBe(200);
    expect(branchService.getBranchInventory).toHaveBeenCalledWith('branch-1');
  });

  it('rejects updating another branch\'s inventory as branch admin', async () => {
    const req = {
      user: { role: 'branch_admin', branch_id: 'branch-1' },
      params: { id: 'product-1' },
      body: { location_id: 'branch-other', stock: 8 },
    } as unknown as Request;
    const res = createResponse();

    await updateInventory(req, res);

    expect(res.statusCode).toBe(403);
    expect(branchService.updateItem).not.toHaveBeenCalled();
  });

  it('allows updating own branch\'s inventory as branch admin', async () => {
    vi.mocked(branchService.updateItem).mockResolvedValue({ ok: true, data: [] } as any);
    const req = {
      user: { role: 'branch_admin', branch_id: 'branch-1' },
      params: { id: 'product-1' },
      body: { location_id: 'branch-1', stock: 8 },
    } as unknown as Request;
    const res = createResponse();

    await updateInventory(req, res);

    expect(res.statusCode).toBe(200);
    expect(branchService.updateItem).toHaveBeenCalledWith(expect.objectContaining({
      id: 'product-1',
      location_id: 'branch-1',
      stock: 8,
    }));
  });

  it('rejects deleting another branch\'s inventory as branch admin', async () => {
    const req = {
      user: { role: 'branch_admin', branch_id: 'branch-1' },
      params: { id: 'product-1' },
      query: { branch_id: 'branch-other' },
    } as unknown as Request;
    const res = createResponse();

    await deleteInventory(req, res);

    expect(res.statusCode).toBe(403);
    expect(branchService.deleteItem).not.toHaveBeenCalled();
  });

  it('allows deleting own branch\'s inventory as branch admin', async () => {
    vi.mocked(branchService.deleteItem).mockResolvedValue({ ok: true });
    const req = {
      user: { role: 'branch_admin', branch_id: 'branch-1' },
      params: { id: 'product-1' },
      query: { branch_id: 'branch-1' },
    } as unknown as Request;
    const res = createResponse();

    await deleteInventory(req, res);

    expect(res.statusCode).toBe(200);
    expect(branchService.deleteItem).toHaveBeenCalledWith('product-1', 'branch-1');
  });
});
