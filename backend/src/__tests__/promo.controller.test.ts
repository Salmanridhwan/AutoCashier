import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Request, Response } from 'express';

vi.mock('../modules/promos/promo.service.js', () => ({
  getAllPromos: vi.fn(),
  createPromo: vi.fn(),
  getPromoById: vi.fn(),
  updatePromo: vi.fn(),
  deletePromo: vi.fn(),
  isPromoVisibleAtBranch: vi.fn(),
  isUserTargeted: vi.fn(),
}));

import * as promoService from '../modules/promos/promo.service.js';
import {
  createPromoController,
  deletePromoController,
  listPromos,
  updatePromoController,
} from '../modules/promos/promo.controller.js';

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

describe('promo controller branch scope', () => {
  beforeEach(() => vi.clearAllMocks());

  it('lists promos with global scope for branch admin', async () => {
    vi.mocked(promoService.getAllPromos).mockResolvedValue({ ok: true, data: [], error: null });
    const req = { user: { role: 'branch_admin', branch_id: 'branch-1' } } as unknown as Request;
    const res = createResponse();

    await listPromos(req, res);

    expect(promoService.getAllPromos).toHaveBeenCalledWith(undefined);
  });

  it('allows branch admin to create global promos with scope ALL', async () => {
    vi.mocked(promoService.createPromo).mockResolvedValue({ ok: true, data: { id: 'promo-1' }, error: null } as any);
    const req = {
      user: { role: 'branch_admin', branch_id: 'branch-1' },
      body: { code: 'PROMO', discount_type: 'Fixed', discount_value: 1000, scope: 'branch-other' },
    } as unknown as Request;
    const res = createResponse();

    await createPromoController(req, res);

    expect(promoService.createPromo).toHaveBeenCalledWith(
      expect.objectContaining({ scope: 'branch-other' }),
      undefined
    );
  });

  it('does not restrict promo updates and deletes by branch admin', async () => {
    vi.mocked(promoService.updatePromo).mockResolvedValue({ ok: true, data: { id: 'promo-other' }, error: null } as any);
    vi.mocked(promoService.deletePromo).mockResolvedValue({ ok: true, error: null });
    const updateReq = {
      user: { role: 'branch_admin', branch_id: 'branch-1' },
      params: { id: 'promo-other' },
      body: { code: 'PROMO', discount_type: 'Fixed', discount_value: 1000, scope: 'branch-other' },
    } as unknown as Request;
    const deleteReq = {
      user: { role: 'branch_admin', branch_id: 'branch-1' },
      params: { id: 'promo-other' },
    } as unknown as Request;
    const updateRes = createResponse();
    const deleteRes = createResponse();

    await updatePromoController(updateReq, updateRes);
    await deletePromoController(deleteReq, deleteRes);

    expect(promoService.updatePromo).toHaveBeenCalledWith(
      'promo-other',
      expect.objectContaining({ scope: 'branch-other' }),
      undefined
    );
    expect(promoService.deletePromo).toHaveBeenCalledWith('promo-other', undefined);
    expect(updateRes.statusCode).toBe(200);
    expect(deleteRes.statusCode).toBe(200);
  });
});
