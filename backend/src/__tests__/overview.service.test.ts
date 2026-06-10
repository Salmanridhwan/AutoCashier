import { beforeEach, describe, expect, it, vi } from 'vitest';

const supabaseMocks = vi.hoisted(() => ({
  from: vi.fn(),
}));

vi.mock('../config/supabaseClient.js', () => ({
  supabaseAdmin: { from: supabaseMocks.from },
  supabase: { from: supabaseMocks.from },
}));

import { getOverviewData } from '../modules/dashboard/overview.service.js';

describe('overview service week filter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calculates the date range correctly for a specified week of the year', async () => {
    const mockQueryChain = (data: any, countValue?: number) => {
      const chain: any = {
        gte: vi.fn(() => chain),
        lte: vi.fn(() => chain),
        eq: vi.fn(() => chain),
        lt: vi.fn(() => chain),
        not: vi.fn(() => chain),
        order: vi.fn(() => chain),
        limit: vi.fn(() => chain),
        select: vi.fn(() => chain),
        then: vi.fn((onfulfilled) => {
          return Promise.resolve(
            countValue !== undefined 
              ? { data, error: null, count: countValue } 
              : { data, error: null }
          ).then(onfulfilled);
        }),
      };
      return chain;
    };

    const chain = mockQueryChain([], 10);
    supabaseMocks.from.mockReturnValue(chain);

    // Request for Week 20 in year 2026
    const res = await getOverviewData({
      timeframe: 'weekly',
      year: '2026',
      month: 'May',
      week: 'Week 20',
    });

    expect(res.ok).toBe(true);

    // Week 20 of 2026:
    // Jan 1, 2026 + 19 * 7 = May 14, 2026
    // Ends on May 20, 2026
    const expectedStart = new Date(2026, 4, 14, 0, 0, 0, 0).toISOString();
    const expectedEnd = new Date(2026, 4, 20, 23, 59, 59, 999).toISOString();

    expect(chain.gte).toHaveBeenCalledWith('created_at', expectedStart);
    expect(chain.lte).toHaveBeenCalledWith('created_at', expectedEnd);
  });
});
