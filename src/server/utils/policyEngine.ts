/**
 * ─── PBAC Core Engine ─────────────────────────────────────────────────────────
 * Centralised Policy-Based Access Control evaluator.
 *
 * Design principles:
 *   1. Policies are pure functions → easy to test, audit, and extend.
 *   2. The engine lives outside Hono → can be called from middleware, routes,
 *      or even the client-side (for optimistic UI hints).
 *   3. Capabilities are DERIVED from existing D1 fields (roles, cert expiry)
 *      so we don't need a schema migration.
 *   4. Each policy returns { allowed, reason? } — the first DENY wins.
 *
 * Usage:
 *   import { evaluateAccess } from '../utils/policyEngine';
 *   const result = evaluateAccess(user, 'schedule.assign', context);
 *   if (!result.allowed) throw new PolicyDeniedError(result.reason!);
 * ─────────────────────────────────────────────────────────────────────────────
 */

// ═══════════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════════

/** Minimal user shape required by the PBAC engine (subset of Variables['user']). */
export interface PbaoUser {
  id: string;
  email: string;
  role: string;
  roles: string[];
  departmentId: string | null;
  /** ISO-8601 date string — checked for certification validity. */
  certificationExpiry?: string | null;
  [key: string]: any;
}

/** Contextual facts about the operation being evaluated. */
export interface PolicyEvaluationContext {
  /** The department of the location being audited (for COI checks). */
  targetDepartmentId?: string | null;
  /** The ID of the target user (for user.update self-update checks). */
  targetUserId?: string | null;
  /** The current status of the schedule slot (e.g. 'open', 'assigned'). */
  scheduleStatus?: string | null;
  /** The auditor ID of an already-filled slot (for double-booking checks). */
  existingAuditor1Id?: string | null;
  existingAuditor2Id?: string | null;
  /** Supervisor IDs for supervisor-conflict checks. */
  supervisorIds?: string[];
  /** Whether the system is in open-audit mode (bypasses cross-audit matrix). */
  isOpenAuditMode?: boolean;
  /** Extra facts any custom policy can consume. */
  [key: string]: any;
}

export interface PolicyResult {
  allowed: boolean;
  /** Machine-readable reason code, e.g. 'COI_VIOLATION', 'SLOT_LOCKED'. */
  reason?: string;
}

export type PbacAction =
  // ── Audit schedule actions ────────────────────────────────────────────
  | 'schedule.assign'
  | 'schedule.unassign'
  | 'schedule.lock'
  | 'schedule.set_date'
  | 'schedule.set_status'
  | 'schedule.upload_report'
  | 'audit.create'
  | 'audit.delete'
  | 'audit.maintenance'
  // ── User management actions ───────────────────────────────────────────
  | 'user.create'
  | 'user.update'
  | 'user.delete'
  | 'user.verify'
  | 'user.certify'
  // ── Admin management actions ──────────────────────────────────────────
  | 'admin.manage'
  | 'department.manage'
  | 'location.manage'
  | 'group.manage'
  | 'kpi.manage'
  | 'phase.manage'
  | 'permission.manage'
  | 'mapping.manage'
  | 'system.reset'
  | 'system.settings'
  | 'data.purge';

// ═══════════════════════════════════════════════════════════════════════════════
// Capability Derivation (no DB schema changes needed)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Derives a set of capability strings from the user's current D1 fields.
 * This is the bridge between legacy RBAC roles and the PBAC capability model.
 *
 * ── ROLES ARE HIERARCHICAL ──────────────────────────────────────────────
 * Higher roles inherit ALL capabilities of lower roles.
 *
 *   Admin > Coordinator > Supervisor > Guest (base)
 *
 * Example: A Coordinator automatically gets Supervisor + Guest capabilities.
 * You never need to assign multiple roles like "Coordinator+Supervisor".
 *
 * ── Certified Officer ───────────────────────────────────────────────────
 * Any role + valid certification → asset_inspector (can perform audits).
 * ─────────────────────────────────────────────────────────────────────────
 */
function deriveRoleCapabilities(user: PbaoUser): Set<string> {
  const caps = new Set<string>();
  const roles = user.roles || [];

  // ── Guest (base level) ─────────────────────────────────────────────
  if (roles.includes('Guest')) {
    caps.add('view:dashboard');
  }

  // ── Supervisor > Guest ──────────────────────────────────────────────
  if (roles.includes('Supervisor')) {
    caps.add('view:dashboard');          // inherit Guest
    caps.add('manage:locations');        // location registry (dept-scoped)
    caps.add('schedule:manage_dept');    // manage department schedules
  }

  // ── Coordinator > Supervisor > Staff ────────────────────────────────
  if (roles.includes('Coordinator')) {
    caps.add('view:dashboard');          // inherit Staff
    caps.add('manage:locations');        // inherit Supervisor
    caps.add('schedule:manage_dept');    // inherit Supervisor
    // Coordinator-specific (one department only)
    caps.add('assign:others');           // assign others to slots
    caps.add('view:all_departments');    // view cross-dept data
    caps.add('manage:departments');       // department registry
    caps.add('manage:users');            // user management (dept-scoped)
    caps.add('manage:groups');           // audit groups
    caps.add('manage:mappings');         // dept/location mappings
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
    caps.add('manage:certs');             // Issue/renew officer certifications
    caps.add('purge:data');               // Permanently delete archived records
    caps.add('system:reset');
  }

  return caps;
}

/**
 * Derives capability strings from the user's field qualifications.
 * A Qualification is an operational capability overlay, separate from an administrative Role.
 */
function deriveQualificationCapabilities(user: PbaoUser): Set<string> {
  const caps = new Set<string>();

  // ── Qualified Asset Inspector (QAI) ──────────────────────────────────
  // Any role + valid cert → asset_inspector (can perform audits).
  const today = new Date().toISOString().split('T')[0];
  const isCertValid =
    !!user.certificationExpiry && user.certificationExpiry >= today;
  if (isCertValid) {
    caps.add('asset_inspector');
    caps.add('assign:self');  // QAI → can self-assign to audit slots
  }

  return caps;
}

/**
 * Derives ALL capabilities (Role + Qualification) for the given user.
 */
export function deriveCapabilities(user: PbaoUser): Set<string> {
  const roleCaps = deriveRoleCapabilities(user);
  const qualCaps = deriveQualificationCapabilities(user);
  return new Set([...roleCaps, ...qualCaps]);
}

// ═══════════════════════════════════════════════════════════════════════════════
// Policy Definitions
// ═══════════════════════════════════════════════════════════════════════════════

interface PolicyDefinition {
  name: string;
  description: string;
  evaluate: (user: PbaoUser, ctx: PolicyEvaluationContext) => PolicyResult;
}

/**
 * STRICT_COI — Conflict of Interest (ABSOLUTE)
 *
 * DENY when the user's own department matches the target location's department.
 * This is an institutional integrity rule: no one audits their own department.
 * No exemptions — not even for Admins.
 */
const STRICT_COI: PolicyDefinition = {
  name: 'STRICT_COI',
  description: 'Auditor cannot audit their own department',
  evaluate(user, ctx) {
    const userDept = user.departmentId;
    const targetDept = ctx.targetDepartmentId;
    if (userDept && targetDept && userDept === targetDept) {
      return { allowed: false, reason: 'COI_VIOLATION' };
    }
    return { allowed: true };
  },
};

/**
 * NO_DOUBLE_BOOKING — Slot Availability
 *
 * DENY when the schedule slot is already filled (not 'open').
 * This is the PBAC equivalent of the atomic UPDATE WHERE status='open' guard.
 */
const NO_DOUBLE_BOOKING: PolicyDefinition = {
  name: 'NO_DOUBLE_BOOKING',
  description: 'Cannot assign to a slot that is already taken',
  evaluate(_user, ctx) {
    if (ctx.scheduleStatus && ctx.scheduleStatus !== 'open') {
      return { allowed: false, reason: 'SLOT_LOCKED' };
    }
    return { allowed: true };
  },
};

/**
 * REQUIRE_INSPECTOR — Capability Gate
 *
 * DENY if the user lacks the 'asset_inspector' capability
 * (i.e. no valid certificationExpiry date, or cert is expired).
 */
const REQUIRE_INSPECTOR: PolicyDefinition = {
  name: 'REQUIRE_INSPECTOR',
  description: 'User must hold a valid inspecting officer certification',
  evaluate(user, _ctx) {
    const caps = deriveCapabilities(user);
    if (!caps.has('asset_inspector')) {
      return { allowed: false, reason: 'MISSING_CAPABILITY' };
    }
    return { allowed: true };
  },
};

/**
 * NO_SUPERVISOR_CONFLICT — Integrity Rule
 *
 * DENY if the user is a designated site supervisor for the target location.
 * A supervisor cannot also act as the inspector for the same location.
 */
const NO_SUPERVISOR_CONFLICT: PolicyDefinition = {
  name: 'NO_SUPERVISOR_CONFLICT',
  description: 'Site supervisor cannot inspect their own location',
  evaluate(user, ctx) {
    const supervisorIds = ctx.supervisorIds || [];
    if (supervisorIds.includes(user.id)) {
      return { allowed: false, reason: 'SUPERVISOR_CONFLICT' };
    }
    return { allowed: true };
  },
};

/**
 * CERT_VALID — Certification Expiry Gate
 *
 * DENY if the user's certification has expired.
 * Separate from REQUIRE_INSPECTOR so we can give a distinct error message.
 */
const CERT_VALID: PolicyDefinition = {
  name: 'CERT_VALID',
  description: 'Inspecting officer certificate must not be expired',
  evaluate(user, _ctx) {
    const today = new Date().toISOString().split('T')[0];
    const certExpiry = user.certificationExpiry;
    if (!certExpiry || certExpiry < today) {
      return { allowed: false, reason: 'CERT_EXPIRED' };
    }
    return { allowed: true };
  },
};

/**
 * REQUIRE_CAPABILITY — Generic Capability Gate
 *
 * Factory: creates a policy that DENIES unless the user holds a specific
 * capability string (as derived by deriveCapabilities).
 *
 * Usage:
 *   const CAN_MANAGE_USERS = REQUIRE_CAPABILITY('manage:users');
 */
function REQUIRE_CAPABILITY(capability: string, reasonCode?: string): PolicyDefinition {
  return {
    name: `REQUIRE_CAPABILITY:${capability}`,
    description: `User must have the "${capability}" capability`,
    evaluate(user, _ctx) {
      const caps = deriveCapabilities(user);
      if (!caps.has(capability)) {
        return { allowed: false, reason: reasonCode || 'MISSING_CAPABILITY' };
      }
      return { allowed: true };
    },
  };
}

/**
 * CAN_ASSIGN_OTHERS — Assignment Delegation Gate
 *
 * Allows Admins and Coordinators to assign other users to audit slots.
 * Falls through to MISSING_CAPABILITY if the user lacks the capability.
 */
const CAN_ASSIGN_OTHERS = REQUIRE_CAPABILITY('assign:others', 'MISSING_CAPABILITY');

/**
 * CAN_UPDATE_USER — Self-Update or Admin/Coordinator Gate
 *
 * ALLOW if the caller is updating their own record (self-service).
 * Otherwise DENY unless the user holds 'manage:users' capability.
 */
const CAN_UPDATE_USER: PolicyDefinition = {
  name: 'CAN_UPDATE_USER',
  description: 'User can update their own record; others require manage:users',
  evaluate(user, ctx) {
    // Self-update is always allowed (handler enforces additional field-level restrictions)
    if (ctx.targetUserId && user.id === ctx.targetUserId) {
      return { allowed: true };
    }
    // Updating someone else requires manage:users capability
    const caps = deriveCapabilities(user);
    if (!caps.has('manage:users')) {
      return { allowed: false, reason: 'MISSING_CAPABILITY' };
    }
    return { allowed: true };
  },
};

/**
 * COORDINATOR_DEPT_SCOPE — Coordinator Department Boundary
 *
 * DENY if a Coordinator tries to operate outside their own department.
 * Coordinator = has manage:departments but NOT system:admin.
 * Admin (system:admin) bypasses this check.
 */
const COORDINATOR_DEPT_SCOPE: PolicyDefinition = {
  name: 'COORDINATOR_DEPT_SCOPE',
  description: 'Coordinators can only operate within their own department',
  evaluate(user, ctx) {
    const caps = deriveCapabilities(user);
    if (caps.has('system:admin')) return { allowed: true };
    if (!caps.has('manage:departments')) return { allowed: true }; // Not a coordinator
    const userDept = user.departmentId;
    const targetDept = ctx.targetDepartmentId;
    if (userDept && targetDept && userDept !== targetDept) {
      return { allowed: false, reason: 'COI_VIOLATION' };
    }
    return { allowed: true };
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
// Action → Policy Mapping
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Maps each PBAC action to the ordered list of policies that must ALL pass.
 * Policies are evaluated in order; the first DENY short-circuits.
 */
const ACTION_POLICIES: Record<PbacAction, PolicyDefinition[]> = {
  // ── Audit schedule — self-assignment (caller = assignee) ──────────────
  'schedule.assign': [
    REQUIRE_INSPECTOR,
    CERT_VALID,
    STRICT_COI,
    NO_SUPERVISOR_CONFLICT,
    NO_DOUBLE_BOOKING,
  ],
  // ── Audit schedule — unassign self ────────────────────────────────────
  'schedule.unassign': [],
  // ── Audit schedule — lock/unlock (Supervisor/Admin gated in handler) ──
  'schedule.lock': [],
  // ── Audit schedule — set date ─────────────────────────────────────────
  'schedule.set_date': [],
  // ── Audit schedule — toggle status ────────────────────────────────────
  'schedule.set_status': [],
  // ── Audit schedule — upload report ────────────────────────────────────
  'schedule.upload_report': [],
  // ── Audit CRUD — create (assign-others) ──────────────────────────────
  'audit.create': [
    REQUIRE_CAPABILITY('assign:others', 'MISSING_CAPABILITY'),
    COORDINATOR_DEPT_SCOPE,
  ],
  // ── Audit — delete ────────────────────────────────────────────────────
  'audit.delete': [
    REQUIRE_CAPABILITY('assign:others', 'MISSING_CAPABILITY'),
    COORDINATOR_DEPT_SCOPE,
  ],
  // ── Audit — maintenance (unassign expired, cleanup archived, send email)
  'audit.maintenance': [
    REQUIRE_CAPABILITY('manage:departments', 'MISSING_CAPABILITY'),
    COORDINATOR_DEPT_SCOPE,
  ],
  // ── User management ───────────────────────────────────────────────────
  'user.create': [
    REQUIRE_CAPABILITY('manage:users', 'MISSING_CAPABILITY'),
    COORDINATOR_DEPT_SCOPE,
  ],
  'user.update': [
    CAN_UPDATE_USER,
    // Complex inline logic (self vs admin vs coordinator vs cert changes)
    // remains in the handler; PBAC gates the basic capability.
  ],
  'user.delete': [
    REQUIRE_CAPABILITY('manage:users', 'MISSING_CAPABILITY'),
  ],
  'user.verify': [
    REQUIRE_CAPABILITY('manage:users', 'MISSING_CAPABILITY'),
  ],
  // ── Certification issuance (Admin only) ───────────────────────────────
  'user.certify': [
    REQUIRE_CAPABILITY('manage:certs', 'MISSING_CAPABILITY'),
  ],
  // ── Admin operations ──────────────────────────────────────────────────
  'admin.manage': [
    REQUIRE_CAPABILITY('manage:departments', 'MISSING_CAPABILITY'),
  ],
  'department.manage': [
    REQUIRE_CAPABILITY('manage:departments', 'MISSING_CAPABILITY'),
  ],
  'location.manage': [
    REQUIRE_CAPABILITY('manage:locations', 'MISSING_CAPABILITY'),
  ],
  'group.manage': [
    REQUIRE_CAPABILITY('manage:groups', 'MISSING_CAPABILITY'),
  ],
  'kpi.manage': [
    REQUIRE_CAPABILITY('manage:kpi', 'MISSING_CAPABILITY'),
  ],
  'phase.manage': [
    REQUIRE_CAPABILITY('manage:phases', 'MISSING_CAPABILITY'),
  ],
  'permission.manage': [
    REQUIRE_CAPABILITY('manage:permissions', 'MISSING_CAPABILITY'),
  ],
  'mapping.manage': [
    REQUIRE_CAPABILITY('manage:mappings', 'MISSING_CAPABILITY'),
  ],
  'system.reset': [
    REQUIRE_CAPABILITY('system:reset', 'MISSING_CAPABILITY'),
  ],
  'system.settings': [
    REQUIRE_CAPABILITY('manage:settings', 'MISSING_CAPABILITY'),
  ],
  // ── Permanent data purge (Admin only) ─────────────────────────────────
  'data.purge': [
    REQUIRE_CAPABILITY('purge:data', 'MISSING_CAPABILITY'),
  ],
};

// ═══════════════════════════════════════════════════════════════════════════════
// Main Evaluator
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Evaluate ALL policies required for the given action.
 *
 * @returns The first failing PolicyResult, or `{ allowed: true }` if all pass.
 */
export function evaluateAccess(
  user: PbaoUser,
  action: PbacAction,
  context: PolicyEvaluationContext = {},
): PolicyResult {
  const policies = ACTION_POLICIES[action];
  if (!policies || policies.length === 0) {
    return { allowed: true }; // No policies defined → allow by default
  }

  for (const policy of policies) {
    const result = policy.evaluate(user, context);
    if (!result.allowed) {
      return result; // First DENY wins
    }
  }

  return { allowed: true };
}

// ═══════════════════════════════════════════════════════════════════════════════
// User-Facing Error Messages (for the React client)
// ═══════════════════════════════════════════════════════════════════════════════

const PBAC_REASON_MESSAGES: Record<string, string> = {
  COI_VIOLATION:
    'Conflict of Interest: You cannot audit your own department.',
  SLOT_LOCKED:
    'This slot was just claimed by someone else.',
  MISSING_CAPABILITY:
    'Access Denied: Your role does not permit this operation.',
  SUPERVISOR_CONFLICT:
    'Conflict of Interest: You are a designated Site Supervisor for this location and cannot act as its inspector.',
  CERT_EXPIRED:
    'Certification Required: Your inspecting officer certificate is expired or invalid.',
  AUTH_REQUIRED:
    'Authentication required. Please sign in.',
  PBAC_CONTEXT_ERROR:
    'An internal error occurred during policy evaluation.',
};

/**
 * Returns a human-readable message for a PBAC reason code.
 */
export function getReasonMessage(reason: string): string {
  return PBAC_REASON_MESSAGES[reason] || `Access denied: ${reason}`;
}
