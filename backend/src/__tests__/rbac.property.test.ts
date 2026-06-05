/**
 * Property 2: RBAC route access control
 * **Validates: Requirements 7.5**
 *
 * For any combination of user role R and API route prefix P,
 * access to endpoints under that prefix must be denied (HTTP 403)
 * if role R is not in the allowed roles list for prefix P.
 *
 * Route access rules:
 * - /api/admin/* → allowed for: super_admin, branch_admin, admin
 * - /api/kasir/* → allowed for: kasir, super_admin, branch_admin
 * - /api/member/* → allowed for: member
 */
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { requireRole } from '../middleware/rbacMiddleware';
import { Request, Response, NextFunction } from 'express';

// Define the access rules mapping route prefixes to allowed roles
const routeAccessRules: Record<string, string[]> = {
  admin: ['super_admin', 'branch_admin', 'admin'],
  kasir: ['kasir', 'super_admin', 'branch_admin'],
  member: ['member'],
};

// All possible roles in the system
const allRoles = ['super_admin', 'branch_admin', 'admin', 'kasir', 'member'];

// All route prefixes
const routePrefixes = ['admin', 'kasir', 'member'];

/**
 * Helper to create a mock Express request with a given role and optional branch_id
 */
function createMockReq(role: string, branchId?: string): Partial<Request> {
  return {
    user: {
      id: 'test-user-id',
      role,
      branch_id: branchId,
    },
  } as any;
}

/**
 * Helper to create a mock Express response that captures status and json calls
 */
function createMockRes(): Partial<Response> & { statusCode: number | null; body: any } {
  const res: any = {
    statusCode: null,
    body: null,
  };
  res.status = (code: number) => {
    res.statusCode = code;
    return res;
  };
  res.json = (data: any) => {
    res.body = data;
    return res;
  };
  return res;
}

describe('Property 2: RBAC route access control', () => {
  it('should grant access iff the role is in the allowed list for the route prefix', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...allRoles),
        fc.constantFrom(...routePrefixes),
        (role, routePrefix) => {
          const allowedRoles = routeAccessRules[routePrefix];
          const middleware = requireRole(allowedRoles);

          // For branch_admin, provide a branch_id to avoid the strict RBAC check
          const req = createMockReq(role, role === 'branch_admin' ? 'branch-123' : undefined);
          const res = createMockRes();
          let nextCalled = false;
          const next: NextFunction = () => {
            nextCalled = true;
          };

          middleware(req as Request, res as unknown as Response, next);

          const shouldBeAllowed = allowedRoles.includes(role);

          if (shouldBeAllowed) {
            // Access should be granted — next() was called
            expect(nextCalled).toBe(true);
            expect(res.statusCode).toBeNull();
          } else {
            // Access should be denied — 403 response
            expect(nextCalled).toBe(false);
            expect(res.statusCode).toBe(403);
            expect(res.body).toHaveProperty('error', 'FORBIDDEN');
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should return 401 when no user is present on the request', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...routePrefixes),
        (routePrefix) => {
          const allowedRoles = routeAccessRules[routePrefix];
          const middleware = requireRole(allowedRoles);

          // Request without user
          const req = {} as Request;
          const res = createMockRes();
          let nextCalled = false;
          const next: NextFunction = () => {
            nextCalled = true;
          };

          middleware(req, res as unknown as Response, next);

          expect(nextCalled).toBe(false);
          expect(res.statusCode).toBe(401);
          expect(res.body).toHaveProperty('error', 'UNAUTHORIZED');
        }
      ),
      { numRuns: 100 }
    );
  });
});
