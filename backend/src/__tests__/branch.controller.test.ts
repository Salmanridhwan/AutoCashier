import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Request, Response } from 'express';

const supabaseMocks = vi.hoisted(() => ({
  from: vi.fn(),
  eq: vi.fn(),
  order: vi.fn(),
}));

vi.mock('../config/supabaseClient.js', () => ({
  supabaseAdmin: { from: supabaseMocks.from },
}));

import { getBranches } from '../modules/inventory/branch.controller.js';

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

describe('branch controller scope', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const query: any = {
      select: vi.fn(() => query),
      eq: supabaseMocks.eq.mockImplementation(() => query),
      order: supabaseMocks.order.mockResolvedValue({ data: [{ id: 'branch-1', name: 'Branch 1' }], error: null }),
    };
    supabaseMocks.from.mockReturnValue(query);
  });

  it('returns only the authenticated branch for branch admins', async () => {
    const req = { user: { role: 'branch_admin', branch_id: 'branch-1' } } as unknown as Request;
    const res = createResponse();

    await getBranches(req, res);

    expect(supabaseMocks.eq).toHaveBeenCalledWith('id', 'branch-1');
    expect(res.body.status).toBe('success');
  });

  it('rejects branch admins without a branch in their token', async () => {
    const req = { user: { role: 'branch_admin' } } as unknown as Request;
    const res = createResponse();

    await getBranches(req, res);

    expect(res.statusCode).toBe(403);
    expect(supabaseMocks.from).not.toHaveBeenCalled();
  });
});
