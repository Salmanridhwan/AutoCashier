import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Request, Response } from 'express';

const stockMocks = vi.hoisted(() => ({
  prepareBranchStockSale: vi.fn(),
  applyBranchStockSale: vi.fn(),
}));

const supabaseMocks = vi.hoisted(() => ({
  from: vi.fn(),
}));

vi.mock('../modules/kasir/checkoutStock.service.js', () => stockMocks);
vi.mock('../config/supabaseClient.js', () => ({
  supabaseAdmin: {
    from: supabaseMocks.from,
    storage: { from: vi.fn() },
  },
}));

import { checkout } from '../modules/kasir/checkout.controller.js';

function createResponse() {
  const response: any = { statusCode: 200, body: null };
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

describe('kasir checkout controller', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    stockMocks.prepareBranchStockSale.mockResolvedValue({
      ok: true,
      data: { branchId: 'branch-1', items: [] },
    });
    stockMocks.applyBranchStockSale.mockResolvedValue({ ok: true, data: null });

    supabaseMocks.from.mockImplementation((table: string) => {
      if (table === 'transactions') {
        return {
          insert: vi.fn((rows: any[]) => ({
            select: vi.fn(() => ({
              single: vi.fn().mockResolvedValue({
                data: { id: 'transaction-1', ...rows[0] },
                error: null,
              }),
            })),
          })),
        };
      }
      if (table === 'transaction_items') {
        return {
          insert: vi.fn().mockResolvedValue({ error: null }),
        };
      }
      throw new Error(`Unexpected table ${table}`);
    });
  });

  it('uses the authenticated branch and deducts its branch inventory', async () => {
    const req = {
      user: { role: 'kasir', branch_id: 'branch-1', sub: 'cashier-1' },
      body: {
        header: {
          branch_id: 'branch-other',
          total_price: 10000,
          payment_method: 'qris',
        },
        items: [{ id: 'product-1', price: 10000, qty: 1 }],
      },
    } as unknown as Request;
    const res = createResponse();

    await checkout(req, res);

    expect(stockMocks.prepareBranchStockSale).toHaveBeenCalledWith('branch-1', req.body.items);
    expect(stockMocks.applyBranchStockSale).toHaveBeenCalledWith(
      { branchId: 'branch-1', items: [] },
      expect.objectContaining({ performedBy: 'cashier-1' })
    );
    expect(supabaseMocks.from).not.toHaveBeenCalledWith('products');
    expect(res.body.success).toBe(true);
    expect(res.body.transaction.branch_id).toBe('branch-1');
  });
});
