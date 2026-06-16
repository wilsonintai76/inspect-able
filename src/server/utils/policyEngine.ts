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
  qualifications?: string[];
  [key: string]: any;
}

/** Contextual facts about the operation being evaluated. */
export interface PolicyEvaluationContext {
  /** The department of the location being audited (for COI checks). */
  targetDepartmentId?: string | null;
  /** The ID of the target user (for user.update self-update checks). */
  targetUserId?: string | null;
  /** The current status of the schedule slot (e.g. 'Pending', 'In Progress'). */
  scheduleStatus?: string | null;
  /** The auditor ID of an already-filled slot (for double-booking checks). */
  existingAuditor1Id?: string | null;
  existingAuditor2Id?: string | null;
  /** Supervisor IDs for supervisor-conflict checks. */
  supervisorIds?: string[];
  /** Whether the system is in open-audit mode (bypasses cross-audit matrix). */
  isOpenAuditMode?: boolean;
  /** Schedule date being assigned/updated (for NO_ANNUAL_CONFLICT). */
  scheduleDate?: string | null;
  /** Pre-computed: true if scheduleDate falls within ANY configured audit phase (Phase 1/2/3). */
  dateInAnyPhase?: boolean;
  /** Current schedule status value (for VALID_STATUS_TRANSITION). */
  currentStatus?: string | null;
  /** Target status to transition to (for VALID_STATUS_TRANSITION). */
  nextStatus?: string | null;
  /** Current schedule record ID (excluded from NO_ANNUAL_CONFLICT on edit). */
  currentScheduleId?: string | null;
  /** Pre-computed annual conflict flag (set by checkLocationYearConflict). */
  hasAnnualConflict?: boolean;
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
 * Derives capability strings from the user's administrative Role.
 *
 * ── ROLES ARE HIERARCHICAL ──────────────────────────────────────────────
 * Higher roles inherit ALL capabilities of lower roles.
 *
 *   Admin > Coordinator > Supervisor > Guest (base)
 *
 * Example: A Coordinator automatically gets Supervisor + Guest capabilities.
 * You never need to assign multiple roles like "Coordinator+Supervisor".
 *
 * ── Roles vs Qualifications ────────────────────────────────────────────
 * Roles define ADMINISTRATIVE scope (manage users, departments, etc.).
 * Qualifications (e.g. "Inspector") grant OPERATIONAL capabilities
 * (self-assign to audits, inspect assets). They are derived separately
 * in deriveQualificationCapabilities() and unioned by deriveCapabilities().
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
    caps.add('view:all_departments');    // view cross-dept data
    caps.add('manage:departments');       // department registry
    caps.add('manage:users');            // user management (dept-scoped)
    caps.add('manage:groups');           // audit groups
    caps.add('manage:mappings');         // dept/location mappings
    // NOTE: assign:others NOT granted — COI makes same-dept assignment impossible
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
 * Derives capability strings from the user's Qualifications.
 *
 * A Qualification is an operational capability overlay — it grants inspection
 * authority regardless of administrative Role. The policy engine unions
 * qualification-derived capabilities with role-derived capabilities.
 *
 * ── Inspector Qualification ────────────────────────────────────────────
 * Grants asset_inspector (can perform audits) and assign:self (can claim
 * open audit slots). Activated by either:
 *   - An explicit "Inspector" entry in the qualifications[] array, OR
 *   - A valid (non-expired) certificationExpiry date.
 */
function deriveQualificationCapabilities(user: PbaoUser): Set<string> {
  const caps = new Set<string>();

  // ── Inspector activation: valid certificate grants asset_inspector + assign:self ──
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kuala_Lumpur' });
  const isCertValid = !!user.certificationExpiry && user.certificationExpiry >= today;
  if (isCertValid) {
    caps.add('asset_inspector');
    caps.add('assign:self');
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
 * DENY when the schedule slot is already filled ('Pending' means open/unfilled).
 */
const NO_DOUBLE_BOOKING: PolicyDefinition = {
  name: 'NO_DOUBLE_BOOKING',
  description: 'Cannot assign to a slot that is already taken',
  evaluate(_user, ctx) {
    // Slots with auditor1_id filled are no longer open
    if (ctx.existingAuditor1Id && ctx.existingAuditor1Id.length > 0) {
      return { allowed: false, reason: 'SLOT_LOCKED' };
    }
    return { allowed: true };
  },
};

/**
 * REQUIRE_ACTIVE_INSPECTOR — Certificate Gate
 *
 * DENY if the user's institutional certificate is expired or missing.
 * A valid certificate IS the inspector qualification — no separate array needed.
 */
const REQUIRE_ACTIVE_INSPECTOR: PolicyDefinition = {
  name: 'REQUIRE_ACTIVE_INSPECTOR',
  description: 'Inspector certificate must be present and not expired',
  evaluate(user, _ctx) {
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kuala_Lumpur' });
    const certExpiry = user.certificationExpiry;
    if (!certExpiry || certExpiry < today) {
      return { allowed: false, reason: 'CERT_EXPIRED' };
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
 * NO_ANNUAL_CONFLICT — Scheduling boundary
 * 
 * DENY if the location is already scheduled to be inspected in the
 * calendar year of scheduleDate (not system year).
 */
const NO_ANNUAL_CONFLICT: PolicyDefinition = {
  name: 'NO_ANNUAL_CONFLICT',
  description: 'A location can only be inspected once per calendar year',
  evaluate(_user, ctx) {
    if (ctx.hasAnnualConflict) {
      return { allowed: false, reason: 'LOCATION_YEAR_CONFLICT' };
    }
    return { allowed: true };
  },
};

/**
 * DATE_WITHIN_PHASE — Phase Scheduling Rule
 *
 * DENY if the schedule date does not fall within ANY configured audit phase.
 * Allows planning across all phases (Phase 1, 2, 3), not just the active one.
 * The handler pre-computes dateInAnyPhase by querying all phase boundaries.
 */
const DATE_WITHIN_PHASE: PolicyDefinition = {
  name: 'DATE_WITHIN_PHASE',
  description: 'Schedule date must fall within any configured audit phase',
  evaluate(_user, ctx) {
    if (!ctx.dateInAnyPhase) {
      return { allowed: false, reason: 'DATE_OUTSIDE_PHASE' };
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
// Composite Policy Groups
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * ─── CanInspectAudit — Inspection Eligibility Rules ────────────────────
 *
 * These five policies together gate who is eligible to be assigned as an
 * inspector for a given audit schedule. They encode the business rule:
 *
 *   CanInspectAudit (5 policies per PBAC Matrix):
 *     1. certificate is valid (not expired)               → REQUIRE_ACTIVE_INSPECTOR
 *     2. audit.department != user.department               → STRICT_COI
 *     3. user is not the site supervisor of this loc       → NO_SUPERVISOR_CONFLICT
 *     4. schedule date falls within any configured phase   → DATE_WITHIN_PHASE
 *     5. location not already inspected in scheduleDate year → NO_ANNUAL_CONFLICT
 *
 * Used by 'schedule.assign' via CAN_SELF_ASSIGN and by
 * auditAssignmentGuard for cross-department assignment validation.
 * ───────────────────────────────────────────────────────────────────────
 */
const CAN_INSPECT_AUDIT_POLICIES: PolicyDefinition[] = [
  REQUIRE_ACTIVE_INSPECTOR,
  STRICT_COI,
  NO_SUPERVISOR_CONFLICT,
  DATE_WITHIN_PHASE,
  NO_ANNUAL_CONFLICT,
];

// ═══════════════════════════════════════════════════════════════════════════════
// Action → Policy Mapping
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Maps each PBAC action to the ordered list of policies that must ALL pass.
 * Policies are evaluated in order; the first DENY short-circuits.
 */
const ACTION_POLICIES: Record<PbacAction, PolicyDefinition[]> = {
  // ── Audit schedule — self-assignment (CAN_SELF_ASSIGN per matrix) ────
  'schedule.assign': [
    REQUIRE_ACTIVE_INSPECTOR,
    STRICT_COI,
    NO_SUPERVISOR_CONFLICT,
    NO_ANNUAL_CONFLICT,
    REQUIRE_CAPABILITY('assign:self', 'MISSING_CAPABILITY'),
    NO_DOUBLE_BOOKING,
  ],
  // ── Audit schedule — unassign (SLOT_OWNER_OR_PRIVILEGED) ──────────────
  // Handled by handler-level checks; PBAC gates basic access
  'schedule.unassign': [
    REQUIRE_CAPABILITY('schedule:manage_dept', 'MISSING_CAPABILITY'),
  ],
  // ── Audit schedule — lock/unlock ──────────────────────────────────────
  'schedule.lock': [
    REQUIRE_CAPABILITY('schedule:manage_dept', 'MISSING_CAPABILITY'),
  ],
  // ── Audit schedule — set date ─────────────────────────────────────────
  'schedule.set_date': [
    REQUIRE_CAPABILITY('schedule:manage_dept', 'MISSING_CAPABILITY'),
    DATE_WITHIN_PHASE,
  ],
  // ── Audit schedule — set status ───────────────────────────────────────
  'schedule.set_status': [
    REQUIRE_CAPABILITY('schedule:manage_dept', 'MISSING_CAPABILITY'),
  ],
  // ── Audit schedule — upload report ────────────────────────────────────
  'schedule.upload_report': [
    REQUIRE_ACTIVE_INSPECTOR,
  ],
  // ── Audit CRUD — create (Admin only) ────────────────────────────────
  'audit.create': [
    REQUIRE_CAPABILITY('system:admin', 'MISSING_CAPABILITY'),
  ],
  // ── Audit — delete (Admin only) ──────────────────────────────────────
  'audit.delete': [
    REQUIRE_CAPABILITY('system:admin', 'MISSING_CAPABILITY'),
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
    REQUIRE_CAPABILITY('system:admin', 'MISSING_CAPABILITY'),
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
    'Access Denied: Inspector qualification is required for this operation.',
  SUPERVISOR_CONFLICT:
    'Conflict of Interest: You are a designated Site Supervisor for this location and cannot act as its inspector.',
  CERT_EXPIRED:
    'Certification Required: Your Inspector certificate is expired or invalid.',
  LOCATION_YEAR_CONFLICT:
    'Conflict: This location is already scheduled to be inspected in the calendar year of the scheduled date.',
  DATE_OUTSIDE_PHASE:
    'The scheduled date does not fall within any configured audit phase (Phase 1, 2, or 3).',
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
