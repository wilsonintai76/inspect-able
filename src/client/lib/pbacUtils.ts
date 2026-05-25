/**
 * ─── Client-side PBAC Capability Derivation ───────────────────────────────────
 * Mirrors server/src/utils/policyEngine.ts deriveCapabilities() exactly.
 * Used for UI gating — widgets, sidebar links, feature flags.
 *
 * NEVER use role strings (roles.includes('Admin')) in UI code.
 * ALWAYS check capabilities: hasCapability(user, 'system:admin')
 *
 * ── ROLES ARE HIERARCHICAL ──────────────────────────────────────────────
 * Higher roles inherit ALL capabilities of lower roles.
 *
 *   Admin > Coordinator > Supervisor > Staff (guest)
 *
 * Certified Officer = any role + valid cert → asset_inspector + assign:self
 * ─────────────────────────────────────────────────────────────────────────
 */

export interface ClientUser {
  roles?: string[];
  certificationExpiry?: string | null;
  departmentId?: string | null;
  [key: string]: any;
}

/**
 * Derives capability strings from user roles + cert expiry.
 * Identical logic to the server's deriveCapabilities().
 */
export function deriveClientCapabilities(user: ClientUser | null): Set<string> {
  const caps = new Set<string>();
  if (!user) return caps;

  const roles = user.roles || [];

  // ── Guest (base level) ─────────────────────────────────────────────
  if (roles.includes('Guest')) {
    caps.add('view:dashboard');
  }

  // ── Supervisor > Guest ─────────────────────────────────────────────
  if (roles.includes('Supervisor')) {
    caps.add('view:dashboard');          // inherit Guest
    caps.add('assign:self');
    caps.add('manage:locations');
    caps.add('schedule:manage_dept');
  }

  // ── Coordinator > Supervisor > Staff ────────────────────────────────
  if (roles.includes('Coordinator')) {
    caps.add('view:dashboard');
    caps.add('assign:self');
    caps.add('manage:locations');
    caps.add('schedule:manage_dept');
    caps.add('assign:others');
    caps.add('view:all_departments');
    caps.add('manage:departments');
    caps.add('manage:users');
    caps.add('manage:groups');
    caps.add('manage:mappings');
    // KPI tiers, audit phases → System Admin only
  }

  // ── Admin > all ─────────────────────────────────────────────────────
  if (roles.includes('Admin')) {
    caps.add('view:dashboard');           // inherit all
    caps.add('system:admin');
    caps.add('schedule:manage_all');
    caps.add('assign:others');
    caps.add('view:all_departments');
    caps.add('manage:departments');
    caps.add('manage:locations');
    caps.add('manage:users');
    caps.add('manage:groups');
    caps.add('manage:kpi');
    caps.add('manage:phases');
    caps.add('manage:permissions');
    caps.add('manage:mappings');
    caps.add('manage:settings');
    caps.add('system:reset');
  }

  // ── Certified Officer ───────────────────────────────────────────────
  const today = new Date().toISOString().split('T')[0];
  const isCertValid =
    !!user.certificationExpiry && user.certificationExpiry >= today;
  if (isCertValid) {
    caps.add('asset_inspector');
    caps.add('assign:self');
  }

  return caps;
}

/** Check if user holds a specific capability. */
export function hasCapability(user: ClientUser | null, capability: string): boolean {
  return deriveClientCapabilities(user).has(capability);
}

// ── Widget capability constants ──────────────────────────────────────────────

/** KPI stats, tier analytics, institutional progress */
export const CAP_VIEW_KPI = 'view:all_departments';
/** Admin alerts, cert watch, audit gaps, archive queue */
export const CAP_ADMIN_INSIGHTS = 'manage:departments';
/** Officer schedule, upcoming audits, cert status */
export const CAP_OFFICER_HUB = 'asset_inspector';
/** My workload, assignment slots */
export const CAP_MY_WORKLOAD = 'assign:self';
/** System activity, backup, full reset */
export const CAP_SYSTEM_ADMIN = 'system:admin';
/** Schedule management */
export const CAP_SCHEDULE_MANAGE = 'schedule:manage_dept';
/** View schedule */
export const CAP_VIEW_SCHEDULE_ALL = 'schedule:manage_all';

// ── Sidebar link capability constants ────────────────────────────────────────

export const CAP_VIEW_OVERVIEW = 'view:all_departments';
export const CAP_MANAGE_LOCATIONS = 'manage:locations';
export const CAP_MANAGE_DEPARTMENTS = 'manage:departments';
export const CAP_MANAGE_USERS = 'manage:users';
export const CAP_MANAGE_SETTINGS = 'manage:settings';
