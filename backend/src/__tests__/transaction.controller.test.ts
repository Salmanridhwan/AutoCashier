import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Request, Response } from 'express';

const supabaseMocks = vi.hoisted(() => ({
  from: vi.fn(),
  select: vi.fn(),
  eq: vi.fn(),
  gte: vi.fn(),
  lte: vi.fn(),
  or: vi.fn(),
  order: vi.fn(),
  range: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock('../config/supabaseClient.js', () => ({
  supabaseAdmin: { from: supabaseMocks.from, rpc: supabaseMocks.rpc },
  supabase: { from: supabaseMocks.from, rpc: supabaseMocks.rpc },
}));

import { getTransactions, checkout } from '../modules/transactions/transaction.controller.js';

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

describe('transaction controller getTransactions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calculates global stats based on all matching records, not just paginated page', async () => {
    // Mock data for paginated query (only 2 records returned because of limit)
    const mockPageData = [
      { id: '1', total_price: 100000, status: 'completed' },
      { id: '2', total_price: 50000, status: 'pending' },
    ];

    // Mock data for stats query (contains all matching records)
    const mockAllMatchingData = [
      { total_price: 100000, status: 'completed' },
      { total_price: 50000, status: 'pending' },
      { total_price: 150000, status: 'completed' },
      { total_price: 200000, status: 'cancelled' },
    ];

    // Setup query builder mocks
    const mainQuery: any = {
      select: vi.fn().mockReturnValue({
        order: vi.fn().mockReturnValue({
          range: vi.fn().mockResolvedValue({
            data: mockPageData,
            error: null,
            count: 4,
          }),
        }),
      }),
    };

    const statsQuery: any = {
      select: vi.fn().mockResolvedValue({
        data: mockAllMatchingData,
        error: null,
      }),
    };

    supabaseMocks.from.mockImplementation((table: string) => {
      if (table === 'transactions') {
        // First call is for main query (which uses count: 'exact' select)
        // Second call is for statsQuery (which select 'total_price, status')
        if (supabaseMocks.from.mock.calls.length % 2 === 1) {
          return mainQuery;
        } else {
          return statsQuery;
        }
      }
      return null;
    });

    const req = {
      user: { role: 'super_admin' },
      query: { page: '1', limit: '2' },
    } as unknown as Request;

    const res = createResponse();

    await getTransactions(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe('success');
    expect(res.body.data).toEqual(mockPageData);
    
    // pagination fields
    expect(res.body.pagination).toEqual({
      page: 1,
      limit: 2,
      total: 4,
      totalPages: 2,
    });

    // global stats fields calculated from all matching records:
    // totalCount = 4
    // totalRevenue = 100000 + 50000 + 150000 + 200000 = 500000
    // avgOrder = 500000 / 4 = 125000
    // completedCount = 2
    expect(res.body.stats).toEqual({
      totalRevenue: 500000,
      totalCount: 4,
      avgOrder: 125000,
      completedCount: 2,
    });
  });

  it('filters by branch_id correctly for branch admins', async () => {
    const mainQuery: any = {
      select: vi.fn().mockReturnValue({
        order: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            range: vi.fn().mockResolvedValue({
              data: [],
              error: null,
              count: 0,
            }),
          }),
        }),
      }),
    };

    const statsQuery: any = {
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({
          data: [],
          error: null,
        }),
      }),
    };

    supabaseMocks.from.mockImplementation((table: string) => {
      if (table === 'transactions') {
        if (supabaseMocks.from.mock.calls.length % 2 === 1) {
          return mainQuery;
        } else {
          return statsQuery;
        }
      }
      return null;
    });

    const req = {
      user: { role: 'branch_admin', branch_id: 'branch-123' },
      query: {},
    } as unknown as Request;

    const res = createResponse();

    await getTransactions(req, res);

    expect(res.statusCode).toBe(200);
  });
});

describe('transaction controller checkout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('populates cashier_id from authenticated user context (sub/id)', async () => {
    const insertMock = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({
          data: { id: 'tx-123', invoice_number: 'INV-123' },
          error: null,
        }),
      }),
    });

    supabaseMocks.from.mockImplementation((table: string) => {
      if (table === 'transactions') {
        return { insert: insertMock };
      }
      if (table === 'transaction_items') {
        return { insert: vi.fn().mockResolvedValue({ error: null }) };
      }
      return null;
    });

    supabaseMocks.rpc.mockResolvedValue({ error: null });

    const req = {
      user: { role: 'kasir', branch_id: 'branch-1', sub: 'cashier-user-id' },
      body: {
        header: {
          total_price: 10000,
          payment_method: 'qris',
        },
        items: [{ product_id: 'product-1', quantity: 1, price: 10000 }],
      },
    } as unknown as Request;
    const res = createResponse();

    await checkout(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe('success');
    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        cashier_id: 'cashier-user-id',
      })
    );
  });
});

