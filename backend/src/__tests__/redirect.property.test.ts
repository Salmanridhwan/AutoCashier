/**
 * Property-Based Test: Role-based login redirect mapping
 *
 * **Validates: Requirements 7.2, 7.3, 7.4**
 *
 * Property: For any valid role, getRedirectForRole returns the correct redirect path.
 * - super_admin, branch_admin, admin → '/admin'
 * - kasir → '/kasir'
 * - member → '/member'
 */
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { getRedirectForRole } from '../modules/auth/auth.controller.js';

describe('Property: Role-based login redirect mapping', () => {
  /**
   * **Validates: Requirements 7.2, 7.3, 7.4**
   *
   * For any valid role drawn from the set of all valid roles,
   * getRedirectForRole must return the correct redirect path
   * according to the role-to-app mapping.
   */
  it('should map any valid role to the correct redirect path', () => {
    const validRoles = fc.constantFrom(
      'super_admin',
      'branch_admin',
      'admin',
      'kasir',
      'member'
    );

    fc.assert(
      fc.property(validRoles, (role: string) => {
        const redirect = getRedirectForRole(role);

        switch (role) {
          case 'super_admin':
          case 'branch_admin':
          case 'admin':
            expect(redirect).toBe('/admin');
            break;
          case 'kasir':
            expect(redirect).toBe('/kasir');
            break;
          case 'member':
            expect(redirect).toBe('/member');
            break;
        }
      }),
      { numRuns: 100 }
    );
  });

  /**
   * **Validates: Requirements 7.2, 7.3, 7.4**
   *
   * The redirect path must always be one of the three valid app paths,
   * regardless of which valid role is provided.
   */
  it('should always return a valid redirect path from the allowed set', () => {
    const validRoles = fc.constantFrom(
      'super_admin',
      'branch_admin',
      'admin',
      'kasir',
      'member'
    );

    const validRedirects = ['/admin', '/kasir', '/member'];

    fc.assert(
      fc.property(validRoles, (role: string) => {
        const redirect = getRedirectForRole(role);
        expect(validRedirects).toContain(redirect);
      }),
      { numRuns: 100 }
    );
  });

  /**
   * **Validates: Requirements 7.2, 7.3, 7.4**
   *
   * Admin-type roles (super_admin, branch_admin, admin) must all map
   * to the same redirect path '/admin', ensuring consistent behavior.
   */
  it('should map all admin-type roles to the same /admin path', () => {
    const adminRoles = fc.constantFrom('super_admin', 'branch_admin', 'admin');

    fc.assert(
      fc.property(adminRoles, (role: string) => {
        expect(getRedirectForRole(role)).toBe('/admin');
      }),
      { numRuns: 100 }
    );
  });
});
