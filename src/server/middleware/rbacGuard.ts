// Hono middleware to enforce RBAC policy and certification/COI/cross-audit rules
import { Context, Next } from 'hono';
import { RBAC_POLICY, RBACPermission } from './rbacPolicy';
import { UserRole } from '@shared/types';

// Helper: check if user has any allowed role
function hasRole(userRoles: UserRole[], allowed: UserRole[]) {
  return userRoles.some(r => allowed.includes(r));
}

// Helper: check if user is certified auditor
function isCertified(user: any) {
  return !!user.certificationIssued && (!user.certificationExpiry || new Date(user.certificationExpiry) > new Date());
}

// Main RBAC middleware
export function rbacGuard(permission: RBACPermission, opts?: { requireCert?: boolean, crossAuditDeptIds?: string[], locationSupervisorId?: string }) {
  return async (c: Context, next: Next) => {
    const user = c.get('user'); // set by auth middleware
    if (!user) return c.json({ error: 'Unauthorized' }, 401);
    
    // Superadmin bypass
    if (user.email?.toLowerCase() === 'admin@poliku.edu.my') return next();

    const userRoles: UserRole[] = user.roles || [];

    // 1. Role-based check
    const allowedRoles = RBAC_POLICY[permission] || [];
    if (!hasRole(userRoles, allowedRoles)) {
      return c.json({ error: 'Forbidden: role' }, 403);
    }

    // 2. Certification check (if required)
    if (opts?.requireCert && !isCertified(user)) {
      return c.json({ error: 'Forbidden: certification required' }, 403);
    }

    // 3. Cross-audit/COI logic (if relevant)
    if (permission === 'self:assign:internal') {
      // Block if user is supervisor for this location
      if (opts?.locationSupervisorId) {
        const supervisorIds = opts.locationSupervisorId.split(',').map(id => id.trim()).filter(Boolean);
        if (supervisorIds.includes(user.id)) {
          return c.json({ error: 'Forbidden: cannot self-assign to location you supervise' }, 403);
        }
      }
      // Block if location is in user's own department
      if (user.departmentId && c.req.param('departmentId') === user.departmentId) {
        return c.json({ error: 'Forbidden: cannot self-assign to own department location' }, 403);
      }
    }
    if (permission === 'self:assign:cross') {
      // Only allow if location's department is in cross-audit partner list
      if (opts?.crossAuditDeptIds && !opts.crossAuditDeptIds.includes(c.req.param('departmentId'))) {
        return c.json({ error: 'Forbidden: not a cross-audit partner' }, 403);
      }
    }
    // ...add more fine-grained checks as needed

    await next();
  };
}
