import { Request, Response, NextFunction } from 'express';

/**
 * Role-Based Access Control middleware.
 * Supports all roles: super_admin, branch_admin, admin, kasir, member
 */
export function requireRole(allowedRoles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = (req as any).user;

    if (!user) {
      return res.status(401).json({ status: 'error', error: 'UNAUTHORIZED' });
    }

    if (!allowedRoles.includes(user.role)) {
      return res.status(403).json({
        status: 'error',
        error: 'FORBIDDEN',
        message: 'Insufficient role permissions',
      });
    }

    // Strict RBAC: Branch Admins MUST have a valid branch_id in their token payload
    if (user.role === 'branch_admin' && !user.branch_id) {
      return res.status(403).json({
        status: 'error',
        error: 'FORBIDDEN',
        message: 'Branch Admin must be assigned to a branch',
      });
    }

    next();
  };
}
