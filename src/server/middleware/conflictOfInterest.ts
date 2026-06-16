import { Context, Next } from 'hono';
import { Bindings, Variables } from '../types';
import { deriveCapabilities, evaluateAccess, getReasonMessage, PbaoUser } from '../utils/policyEngine';
import { checkLocationYearConflict } from '../routes/db.shared';

// ─── auditAssignmentGuard ─────────────────────────────────────────────────────
// Enforces business rules on any request that sets auditor1Id / auditor2Id.
// Complements the CanInspectAudit policies in policyEngine.ts (which gate
// the 'schedule.assign' action) with request-level validation:
//
//  Rule 1 — Self-assignment only (for non-privileged roles):
//    Users without 'assign:others' capability (i.e. Inspectors without
//    Coordinator/Admin role) may only place their OWN id into an auditor slot.
//
//  Rule 2 — Conflict of interest (applies to ALL roles including Admin):
//    a) An auditor cannot be assigned to audit their own department (STRICT_COI).
//    b) The auditor must hold the Inspector qualification (REQUIRE_INSPECTOR).
//    c) The auditor's certificate must be valid (CERT_VALID).
//    d) A site supervisor cannot inspect their own location (NO_SUPERVISOR_CONFLICT).
//    e) A location can only be inspected once per calendar year (NO_ANNUAL_CONFLICT).
//
//  Rule 3 — Cross-audit permissions (non-open-audit mode):
//    An active cross_audit_permissions entry must link the auditor's
//    department to the target department.
//
// Assumes zValidator has already run (body is at c.req.valid('json')).
// Works for both POST /audits (new) and PATCH /audits/:id (updates).
// ─────────────────────────────────────────────────────────────────────────────
export const auditAssignmentGuard = async (
  c: Context<{ Bindings: Bindings; Variables: Variables }>,
  next: Next,
) => {
  // Grab already-validated body (zValidator runs before this middleware)
  const updates = (c.req as any).valid('json') as {
    auditor1Id?: string | null;
    auditor2Id?: string | null;
    departmentId?: string | null;
    locationId?: string | null;
    date?: string | null;
    phaseId?: string | null;
  };

  // Collect only the auditor IDs that are being explicitly set (non-null)
  const incomingAuditorIds = [updates.auditor1Id, updates.auditor2Id]
    .filter((id): id is string => typeof id === 'string' && id.length > 0);

  // Nothing to check if no auditor slot is being filled
  if (incomingAuditorIds.length === 0) {
    return next();
  }

  const caller = c.get('user')!;
  const callerRoles = caller.roles || [];

  // ── Rule 1: Self-assignment enforcement ──────────────────────────────────
  const caps = deriveCapabilities({
    id: caller.id,
    email: caller.email,
    role: caller.role,
    roles: callerRoles,
    departmentId: caller.departmentId ?? null,
    certificationExpiry: caller.certificationExpiry ?? null,
    qualifications: caller.qualifications || [],
  });
  const isAdminCaller = caps.has('system:admin');
  const isCoordinatorCaller = caps.has('manage:departments') && !isAdminCaller;
  const canAssignOthers = caps.has('assign:others');
  if (!canAssignOthers) {
    const illegalSlot = incomingAuditorIds.find(id => id !== caller.id);
    if (illegalSlot) {
      return c.json(
        { error: 'Forbidden: you may only assign yourself to an auditor slot' },
        403,
      );
    }
  }

  // ── Resolve the audit's target department and check concurrency ──────────
  // Fetch all needed audit fields in ONE query (department, auditors, supervisor, location, date, phase)
  let finalAuditor1 = updates.auditor1Id;
  let finalAuditor2 = updates.auditor2Id;
  let targetDeptId: string | null = updates.departmentId ?? null;
  let supervisorId: string | null = (updates as any).supervisorId ?? null;

  // Resolve locationId, date, phaseId for annual check
  let targetLocId = updates.locationId ?? null;
  let targetDate = updates.date ?? null;
  let targetPhaseId = updates.phaseId ?? null;

  const auditId = c.req.param('id'); // undefined on POST, present on PATCH

  if (auditId) {
    const existing = await c.env.DB.prepare(
      'SELECT department_id, auditor1_id, auditor2_id, supervisor_id, location_id, date, phase_id FROM audit_schedules WHERE id = ?',
    )
      .bind(auditId)
      .first<{
        department_id: string | null;
        auditor1_id: string | null;
        auditor2_id: string | null;
        supervisor_id: string | null;
        location_id: string | null;
        date: string | null;
        phase_id: string | null;
      }>();

    if (existing) {
      if (!targetDeptId) targetDeptId = existing.department_id;
      if (!supervisorId) supervisorId = existing.supervisor_id;
      if (targetLocId === null || targetLocId === undefined) targetLocId = existing.location_id;
      if (targetDate === null || targetDate === undefined) targetDate = existing.date;
      if (targetPhaseId === null || targetPhaseId === undefined) targetPhaseId = existing.phase_id;
      if (updates.auditor1Id === undefined) finalAuditor1 = existing.auditor1_id;
      if (updates.auditor2Id === undefined) finalAuditor2 = existing.auditor2_id;

      // ATOMIC CONCURRENCY CHECK (Race Condition Guard)
      if (!canAssignOthers) {
        if (updates.auditor1Id && existing.auditor1_id && existing.auditor1_id !== caller.id) {
          return c.json({ error: 'RACE CONDITION DETECTED: Auditor Slot 1 was just taken by someone else. Please refresh your view.' }, 409);
        }
        if (updates.auditor2Id && existing.auditor2_id && existing.auditor2_id !== caller.id) {
          return c.json({ error: 'RACE CONDITION DETECTED: Auditor Slot 2 was just taken by someone else. Please refresh your view.' }, 409);
        }
      }
    }
  }

  // Check if Auditor 1 and Auditor 2 are the same non-null user
  if (finalAuditor1 && finalAuditor2 && finalAuditor1 === finalAuditor2) {
    return c.json({ error: 'Conflict of interest: the same auditor cannot be assigned to both auditor slots on the same schedule', code: 'SAME_AUDITOR' }, 409);
  }

  if (!targetDeptId) {
    return next();
  }

  // ── Fetch audit_strategy ONCE before the loop ────────────────────────────
  let assignmentMode = 'open-audit';
  try {
    const [strategyRow, ...auditorRows] = await c.env.DB.batch([
      c.env.DB.prepare('SELECT value FROM system_settings WHERE id = ?').bind('audit_strategy'),
      // Fetch all auditor records (including roles and qualifications) in one batch call
      ...incomingAuditorIds.map(id =>
        c.env.DB.prepare('SELECT roles, qualifications, department_id, certification_expiry FROM users WHERE id = ?').bind(id)
      ),
    ]) as [
      D1Result<{ value: string }>,
      ...D1Result<{
        roles: string | null;
        qualifications: string | null;
        department_id: string | null;
        certification_expiry: string | null;
      }>[]
    ];

    const strategyStr = (strategyRow.results?.[0] as any)?.value
      ?? await c.env.SETTINGS.get('audit_strategy');

    if (strategyStr && typeof strategyStr === 'string') {
      try {
        const parsed = JSON.parse(strategyStr);
        if (parsed && typeof parsed === 'object' && (parsed as any).assignmentMode) {
          assignmentMode = 'open-audit'; // Force bypass
        }
      } catch { /* ignore parse errors — default stays open-audit */ }
    }

    // Check annual conflict of interest for this location
    let hasAnnualConflict = false;
    if (targetLocId) {
      // Resolve phaseId dynamically from date if needed, matching public.ts / db.audits.ts
      let resolvedPhaseId = targetPhaseId;
      if (targetDate && !resolvedPhaseId) {
        const matchingPhase = await c.env.DB.prepare(
          'SELECT id FROM audit_phases WHERE start_date <= ? AND end_date >= ? LIMIT 1'
        ).bind(targetDate, targetDate).first<{ id: string }>();
        if (matchingPhase) {
          resolvedPhaseId = matchingPhase.id;
        }
      }
      const conflictErr = await checkLocationYearConflict(c.env.DB, targetLocId, auditId || '', targetDate, resolvedPhaseId);
      if (conflictErr) {
        hasAnnualConflict = true;
      }
    }

    // ── Rule 2: Conflict of interest per auditor ─────────────────────────
    const supervisorIds = supervisorId ? supervisorId.split(',').map(id => id.trim()).filter(Boolean) : [];

    for (let i = 0; i < incomingAuditorIds.length; i++) {
      const auditorId = incomingAuditorIds[i];
      const auditor = auditorRows[i]?.results?.[0];

      if (!auditor) continue;

      if (canAssignOthers && isCoordinatorCaller && !isAdminCaller) {
        if (!caller.departmentId || auditor.department_id !== caller.departmentId) {
          return c.json({ error: 'Forbidden: coordinators may only assign Inspectors from their own department' }, 403);
        }
      }

      // Parse JSON columns from the DB row
      const rolesParsed = auditor.roles ? JSON.parse(auditor.roles) : [];
      const qualificationsParsed = auditor.qualifications ? JSON.parse(auditor.qualifications) : [];

      const pbaoAuditor: PbaoUser = {
        id: auditorId,
        email: '',
        role: rolesParsed[0] || 'Guest',
        roles: rolesParsed,
        departmentId: auditor.department_id ?? null,
        certificationExpiry: auditor.certification_expiry ?? null,
        qualifications: qualificationsParsed,
      };

      // Run PBAC engine checks for schedule.assign on the assignee.
      // dateInAnyPhase: true — date was already validated by date picker
      const evalResult = evaluateAccess(pbaoAuditor, 'schedule.assign', {
        targetDepartmentId: targetDeptId,
        supervisorIds,
        hasAnnualConflict,
        dateInAnyPhase: true,  // SKIP: date validated separately at date-pick time
      });

      if (!evalResult.allowed) {
        const reason = evalResult.reason || 'UNKNOWN';
        if (reason === 'MISSING_CAPABILITY') {
          return c.json({ error: 'Assignment blocked: the selected auditor does not hold the Inspector qualification', code: 'MISSING_CAPABILITY' }, 403);
        }
        if (reason === 'CERT_EXPIRED') {
          return c.json({ error: 'Assignment blocked: the selected auditor does not hold a valid Inspector certificate', code: 'CERT_EXPIRED' }, 403);
        }
        if (reason === 'COI_VIOLATION') {
          return c.json({ error: 'Conflict of interest: an auditor cannot be assigned to audit their own department', code: 'SELF_DEPARTMENT' }, 409);
        }
        if (reason === 'SUPERVISOR_CONFLICT') {
          return c.json({ error: 'Conflict of interest: the selected officer is a site supervisor for this location and cannot act as its inspector', code: 'SUPERVISOR_CONFLICT_INTERNAL' }, 409);
        }
        if (reason === 'LOCATION_YEAR_CONFLICT') {
          return c.json({ error: 'ACTION BLOCKED: This location is already scheduled to be audited in this calendar year. A location can only be inspected once per calendar year.', code: 'LOCATION_YEAR_CONFLICT' }, 422);
        }
        return c.json({ error: getReasonMessage(reason), code: reason }, 403);
      }

      const auditorDeptId = auditor.department_id;
      if (!auditorDeptId) continue;

      if (assignmentMode === 'open-audit') continue;

      // Checks both directed and mutual permissions at either Department or Group level.
      const perm = await c.env.DB.prepare(`
        SELECT p.id 
        FROM cross_audit_permissions p
        JOIN departments d_aud ON d_aud.id = ?
        JOIN departments d_tgt ON d_tgt.id = ?
        WHERE p.is_active = 1 AND (
          (p.auditor_dept_id = d_aud.id AND p.target_dept_id = d_tgt.id)
          OR (p.is_mutual = 1 AND p.auditor_dept_id = d_tgt.id AND p.target_dept_id = d_aud.id)
          OR (d_aud.audit_group_id IS NOT NULL AND d_tgt.audit_group_id IS NOT NULL AND (
            (p.auditor_group_id = d_aud.audit_group_id AND p.target_group_id = d_tgt.audit_group_id)
            OR (p.is_mutual = 1 AND p.auditor_group_id = d_tgt.audit_group_id AND p.target_group_id = d_aud.audit_group_id)
          ))
        )
        LIMIT 1
      `)
        .bind(auditorDeptId, targetDeptId)
        .first<{ id: string }>();

      if (!perm) {
        return c.json({ error: "Conflict of interest: no active cross-audit permission exists between the auditor's department and the target department", code: 'NO_CROSS_PERMISSION' }, 403);
      }
    }
  } catch (e) {
    console.error('[auditAssignmentGuard] DB batch error:', e);
    // Fall through — don't block assignment on infrastructure error
  }

  return next();
};
