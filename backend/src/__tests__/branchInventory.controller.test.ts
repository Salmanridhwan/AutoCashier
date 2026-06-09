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
import { addInventory, adjustInventory } from '../modules/inventory/branchInventory.controller.js';

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

  it('uses the authenticated branch and user when restocking as branch admin', async () => {
    vi.mocked(branchService.adjustStock).mockResolvedValue({ ok: true, newStock: 18 });
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

    expect(branchService.adjustStock).toHaveBeenCalledWith(expect.objectContaining({
      branchId: 'branch-1',
      performedBy: 'user-1',
      type: 'RESTOCK',
      quantity: 8,
    }));
    expect(res.body).toEqual({ status: 'success', data: 18 });
  });

  it('uses the authenticated branch when adding a catalog product as branch admin', async () => {
    vi.mocked(branchService.addItem).mockResolvedValue({ ok: true, data: { id: 'inventory-1' } } as any);
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

    expect(branchService.addItem).toHaveBeenCalledWith(expect.objectContaining({
      catalogId: 'product-1',
      location_id: 'branch-1',
      stock: 5,
    }));
    expect(res.body).toEqual({ status: 'success', data: { id: 'inventory-1' } });
  });
});
