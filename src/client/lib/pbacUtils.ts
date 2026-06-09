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
function deriveClientRoleCapabilities(user: ClientUser | null): Set<string> {
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
    caps.add('manage:certs');             // Issue/renew certifications
    caps.add('purge:data');               // Permanently delete archived records
    caps.add('system:reset');
  }

  return caps;
}

function deriveClientQualificationCapabilities(user: ClientUser | null): Set<string> {
  const caps = new Set<string>();
  if (!user) return caps;

  // ── Qualified Asset Inspector (QAI) ─────────────────────────────────
  const today = new Date().toISOString().split('T')[0];
  const isCertValid =
    !!user.certificationExpiry && user.certificationExpiry >= today;
  if (isCertValid) {
    caps.add('asset_inspector');
    caps.add('assign:self');
  }

  return caps;
}

function deriveClientCapabilities(user: ClientUser | null): Set<string> {
  const roleCaps = deriveClientRoleCapabilities(user);
  const qualCaps = deriveClientQualificationCapabilities(user);
  return new Set([...roleCaps, ...qualCaps]);
}

/** Check if user holds a specific capability. */
export function hasCapability(user: ClientUser | null, capability: string): boolean {
  return deriveClientCapabilities(user).has(capability);
}

/** Issue/renew officer certifications */
export const CAP_MANAGE_CERTS = 'manage:certs';
/** Permanently delete archived records */
export const CAP_PURGE_DATA = 'purge:data';


