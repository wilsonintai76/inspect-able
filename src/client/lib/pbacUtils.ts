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
 *   Admin > Coordinator > Supervisor > Guest (base)
 *
 * ── Roles vs Qualifications ────────────────────────────────────────────
 * Roles define ADMINISTRATIVE scope. Qualifications (e.g. "Inspector")
 * grant OPERATIONAL capabilities (self-assign, inspect). The PBAC engine
 * derives capabilities from BOTH and unions them.
 *
 *   - Coordinator + Inspector:
 *     Can manage department (Coordinator capabilities) AND self-assign to
 *     cross-department audits (Inspector capabilities).
 *
 *   - Supervisor + Inspector:
 *     Can manage locations in department AND self-assign as Inspector.
 *
 *   - Guest + Inspector:
 *     Read-only dashboard view AND self-assign as Inspector.
 *
 *   - Admin + Inspector:
 *     Full administrative controls AND self-assign as Inspector.
 * ─────────────────────────────────────────────────────────────────────────
 */

export interface ClientUser {
  roles?: string[];
  qualifications?: string[];
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
    caps.add('manage:locations');        // location registry (dept-scoped)
    caps.add('schedule:manage_dept');    // manage department schedules
    // NOTE: assign:self is NOT granted here — it comes only from
    // certification (QAI). Server policyEngine.ts matches this.
  }

  // ── Coordinator > Supervisor > Staff ────────────────────────────────
  if (roles.includes('Coordinator')) {
    caps.add('view:dashboard');          // inherit Staff
    caps.add('manage:locations');        // inherit Supervisor
    caps.add('schedule:manage_dept');    // inherit Supervisor
    // Coordinator-specific (one department only)
    // NOTE: assign:others NOT granted — COI makes same-dept assignment impossible
    caps.add('view:all_departments');    // view cross-dept data
    caps.add('manage:departments');       // department registry
    caps.add('manage:users');            // user management (dept-scoped)
    caps.add('manage:groups');           // audit groups
    caps.add('manage:mappings');         // dept/location mappings
    // KPI tiers, audit phases → System Admin only
    // NOTE: assign:self comes only from certification (QAI), not role.
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

/**
 * Derives capability strings from user qualifications.
 * Inspector qualification alone grants asset_inspector + assign:self.
 * Valid certificate is checked separately by CERT_VALID policy in engine.
 */
function deriveClientQualificationCapabilities(user: ClientUser | null): Set<string> {
  const caps = new Set<string>();
  if (!user) return caps;

  // ── Inspector Qualification ─────────────────────────────────────────
  // Qualification grants capabilities; certificate validity is a separate
  // policy gate (CERT_VALID) checked at action time, not at derivation.
  const hasInspectorQual = user.qualifications?.includes('Inspector') ?? false;
  if (hasInspectorQual) {
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


