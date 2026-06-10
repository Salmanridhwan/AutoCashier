import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Request, Response } from 'express';

vi.mock('../modules/dashboard/overview.service.js', () => ({
  getOverviewData: vi.fn(),
}));

import { getOverviewData } from '../modules/dashboard/overview.service.js';
import { getOverview } from '../modules/dashboard/overview.controller.js';

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

describe('overview controller branch scope', () => {
  beforeEach(() => vi.clearAllMocks());

  it('ignores a requested branch when branch admin loads overview', async () => {
    vi.mocked(getOverviewData).mockResolvedValue({ ok: true, data: {} } as any);
    const req = {
      user: { role: 'branch_admin', branch_id: 'branch-1' },
      query: { location_id: 'ALL', timeframe: 'weekly' },
    } as unknown as Request;
    const res = createResponse();

    await getOverview(req, res);

    expect(getOverviewData).toHaveBeenCalledWith(expect.objectContaining({
      location_id: 'branch-1',
      timeframe: 'weekly',
    }));
  });
});
