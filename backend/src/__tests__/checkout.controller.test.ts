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
  let promoMockData: any = null;
  let promoUsagesCount = 0;
  let targetUserCount = 1;

  beforeEach(() => {
    vi.clearAllMocks();
    promoMockData = null;
    promoUsagesCount = 0;
    targetUserCount = 1;

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
      if (table === 'member_promos') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn().mockResolvedValue({
                data: promoMockData,
                error: null,
              }),
            })),
          })),
          update: vi.fn(() => ({
            eq: vi.fn().mockResolvedValue({ error: null }),
          })),
        };
      }
      if (table === 'promo_usages') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn().mockResolvedValue({ count: promoUsagesCount, error: null }),
            })),
          })),
          insert: vi.fn().mockResolvedValue({ error: null }),
        };
      }
      if (table === 'promo_target_users') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn().mockResolvedValue({ count: targetUserCount, error: null }),
            })),
          })),
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
    expect(res.body.transaction.cashier_id).toBe('cashier-1');
  });

  it('rejects checkout if promo is invalid/not found', async () => {
    const req = {
      user: { role: 'kasir', branch_id: 'branch-1', sub: 'cashier-1' },
      body: {
        header: {
          promo_id: 'promo-invalid',
          total_price: 10000,
          payment_method: 'qris',
        },
        items: [{ id: 'product-1', price: 10000, qty: 1 }],
      },
    } as unknown as Request;
    const res = createResponse();

    promoMockData = null; // simulate promo not found
    await checkout(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.code).toBe('INVALID_PROMO');
  });

  it('rejects checkout if promo is scoped to a different branch', async () => {
    const req = {
      user: { role: 'kasir', branch_id: 'branch-1', sub: 'cashier-1' },
      body: {
        header: {
          promo_id: 'promo-branch-2',
          total_price: 10000,
          payment_method: 'qris',
        },
        items: [{ id: 'product-1', price: 10000, qty: 1 }],
      },
    } as unknown as Request;
    const res = createResponse();

    promoMockData = {
      id: 'promo-branch-2',
      is_active: true,
      conditions: { scope: 'branch-2' },
    };
    await checkout(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.code).toBe('PROMO_BRANCH_MISMATCH');
  });

  it('accepts checkout if promo scope is ALL', async () => {
    const req = {
      user: { role: 'kasir', branch_id: 'branch-1', sub: 'cashier-1' },
      body: {
        header: {
          promo_id: 'promo-global',
          total_price: 10000,
          payment_method: 'qris',
        },
        items: [{ id: 'product-1', price: 10000, qty: 1 }],
      },
    } as unknown as Request;
    const res = createResponse();

    promoMockData = {
      id: 'promo-global',
      is_active: true,
      conditions: { scope: 'ALL' },
    };
    await checkout(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('accepts checkout if promo scope matches the branch', async () => {
    const req = {
      user: { role: 'kasir', branch_id: 'branch-1', sub: 'cashier-1' },
      body: {
        header: {
          promo_id: 'promo-branch-1',
          total_price: 10000,
          payment_method: 'qris',
        },
        items: [{ id: 'product-1', price: 10000, qty: 1 }],
      },
    } as unknown as Request;
    const res = createResponse();

    promoMockData = {
      id: 'promo-branch-1',
      is_active: true,
      conditions: { scope: 'branch-1' },
    };
    await checkout(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('rejects checkout if promo is inactive', async () => {
    const req = {
      user: { role: 'kasir', branch_id: 'branch-1', sub: 'cashier-1' },
      body: {
        header: {
          promo_id: 'promo-inactive',
          total_price: 10000,
          payment_method: 'qris',
        },
        items: [{ id: 'product-1', price: 10000, qty: 1 }],
      },
    } as unknown as Request;
    const res = createResponse();

    promoMockData = {
      id: 'promo-inactive',
      is_active: false,
      conditions: { scope: 'ALL' },
    };
    await checkout(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.code).toBe('PROMO_INACTIVE');
  });

  it('rejects checkout if individually assigned promo belongs to another user', async () => {
    const req = {
      user: { role: 'kasir', branch_id: 'branch-1', sub: 'cashier-1' },
      body: {
        header: {
          promo_id: 'promo-user-2',
          member_id: 'user-1',
          total_price: 10000,
          payment_method: 'qris',
        },
        items: [{ id: 'product-1', price: 10000, qty: 1 }],
      },
    } as unknown as Request;
    const res = createResponse();

    promoMockData = {
      id: 'promo-user-2',
      is_active: true,
      user_id: 'user-2',
      is_used: false,
      conditions: { scope: 'ALL' },
    };
    await checkout(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.code).toBe('PROMO_USER_MISMATCH');
  });

  it('rejects checkout if promo has not started yet', async () => {
    const req = {
      user: { role: 'kasir', branch_id: 'branch-1', sub: 'cashier-1' },
      body: {
        header: {
          promo_id: 'promo-not-started',
          total_price: 10000,
          payment_method: 'qris',
        },
        items: [{ id: 'product-1', price: 10000, qty: 1 }],
      },
    } as unknown as Request;
    const res = createResponse();

    promoMockData = {
      id: 'promo-not-started',
      is_active: true,
      starts_at: new Date(Date.now() + 86400000).toISOString(), // starts tomorrow
      conditions: { scope: 'ALL' },
    };
    await checkout(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.code).toBe('PROMO_NOT_STARTED');
  });

  it('rejects checkout if promo is expired', async () => {
    const req = {
      user: { role: 'kasir', branch_id: 'branch-1', sub: 'cashier-1' },
      body: {
        header: {
          promo_id: 'promo-expired',
          total_price: 10000,
          payment_method: 'qris',
        },
        items: [{ id: 'product-1', price: 10000, qty: 1 }],
      },
    } as unknown as Request;
    const res = createResponse();

    promoMockData = {
      id: 'promo-expired',
      is_active: true,
      expires_at: new Date(Date.now() - 86400000).toISOString(), // expired yesterday
      conditions: { scope: 'ALL' },
    };
    await checkout(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.code).toBe('PROMO_EXPIRED');
  });

  it('rejects checkout if minimum purchase is not met', async () => {
    const req = {
      user: { role: 'kasir', branch_id: 'branch-1', sub: 'cashier-1' },
      body: {
        header: {
          promo_id: 'promo-min-purchase',
          total_price: 5000,
          payment_method: 'qris',
        },
        items: [{ id: 'product-1', price: 5000, qty: 1 }],
      },
    } as unknown as Request;
    const res = createResponse();

    promoMockData = {
      id: 'promo-min-purchase',
      is_active: true,
      min_purchase: 10000,
      conditions: { scope: 'ALL' },
    };
    await checkout(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.code).toBe('MIN_PURCHASE_NOT_MET');
  });

  it('rejects checkout if promo usage limit is reached', async () => {
    const req = {
      user: { role: 'kasir', branch_id: 'branch-1', sub: 'cashier-1' },
      body: {
        header: {
          promo_id: 'promo-quota-full',
          total_price: 10000,
          payment_method: 'qris',
        },
        items: [{ id: 'product-1', price: 10000, qty: 1 }],
      },
    } as unknown as Request;
    const res = createResponse();

    promoMockData = {
      id: 'promo-quota-full',
      is_active: true,
      usage_limit: 5,
      usage_count: 5,
      conditions: { scope: 'ALL' },
    };
    await checkout(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.code).toBe('PROMO_QUOTA_FULL');
  });

  it('rejects checkout if per-user promo usage limit is reached', async () => {
    const req = {
      user: { role: 'kasir', branch_id: 'branch-1', sub: 'cashier-1' },
      body: {
        header: {
          promo_id: 'promo-user-limit',
          member_id: 'member-1',
          total_price: 10000,
          payment_method: 'qris',
        },
        items: [{ id: 'product-1', price: 10000, qty: 1 }],
      },
    } as unknown as Request;
    const res = createResponse();

    promoMockData = {
      id: 'promo-user-limit',
      is_active: true,
      per_user_limit: 2,
      conditions: { scope: 'ALL' },
    };
    promoUsagesCount = 2; // user has already used it 2 times
    await checkout(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.code).toBe('USER_PROMO_LIMIT_REACHED');
  });

  it('rejects checkout if user is not targeted for SPECIFIC target_type', async () => {
    const req = {
      user: { role: 'kasir', branch_id: 'branch-1', sub: 'cashier-1' },
      body: {
        header: {
          promo_id: 'promo-specific',
          member_id: 'member-2',
          total_price: 10000,
          payment_method: 'qris',
        },
        items: [{ id: 'product-1', price: 10000, qty: 1 }],
      },
    } as unknown as Request;
    const res = createResponse();

    promoMockData = {
      id: 'promo-specific',
      is_active: true,
      target_type: 'SPECIFIC',
      conditions: { scope: 'ALL' },
    };
    targetUserCount = 0; // not targeted
    await checkout(req, res);

    expect(res.statusCode).toBe(403);
    expect(res.body.success).toBe(false);
    expect(res.body.code).toBe('USER_NOT_TARGETED');
  });
});
