import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Request, Response } from 'express';

vi.mock('../modules/users/user.service.js', () => ({
  getAllUsers: vi.fn(),
  getUserAccessScope: vi.fn(),
  createUser: vi.fn(),
  updateUser: vi.fn(),
  deleteUser: vi.fn(),
  assignMemberPromo: vi.fn(),
}));

import * as userService from '../modules/users/user.service.js';
import { createUser, getUsers, updateUser } from '../modules/users/user.controller.js';

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

describe('user controller branch scope', () => {
  beforeEach(() => vi.clearAllMocks());

  it('lists only users visible to the authenticated branch', async () => {
    vi.mocked(userService.getAllUsers).mockResolvedValue({ ok: true, data: [] });
    const req = { user: { role: 'branch_admin', branch_id: 'branch-1' } } as unknown as Request;
    const res = createResponse();

    await getUsers(req, res);

    expect(userService.getAllUsers).toHaveBeenCalledWith('branch-1');
  });

  it('forces new branch staff into the authenticated branch', async () => {
    vi.mocked(userService.createUser).mockResolvedValue({ ok: true, data: { id: 'user-1' } } as any);
    const req = {
      user: { role: 'branch_admin', branch_id: 'branch-1' },
      body: { name: 'Cashier', email: 'cashier@example.com', role: 'kasir', password: 'secret', branchId: 'branch-other' },
    } as unknown as Request;
    const res = createResponse();

    await createUser(req, res);

    expect(userService.createUser).toHaveBeenCalledWith(expect.objectContaining({ branchId: 'branch-1' }));
  });

  it('rejects updates to staff from another branch', async () => {
    vi.mocked(userService.getUserAccessScope).mockResolvedValue({
      ok: true,
      data: { id: 'user-2', role: 'kasir', branch_id: 'branch-other' },
    } as any);
    const req = {
      user: { role: 'branch_admin', branch_id: 'branch-1' },
      params: { id: 'user-2' },
      body: { name: 'Changed', role: 'kasir' },
    } as unknown as Request;
    const res = createResponse();

    await updateUser(req, res);

    expect(res.statusCode).toBe(403);
    expect(userService.updateUser).not.toHaveBeenCalled();
  });
});
