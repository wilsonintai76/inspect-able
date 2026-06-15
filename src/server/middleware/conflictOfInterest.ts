import { Context, Next } from 'hono';
import { Bindings, Variables } from '../types';
import { deriveCapabilities } from '../utils/policyEngine';

// ─── auditAssignmentGuard ─────────────────────────────────────────────────────
// Enforces two business rules on any request that sets auditor1Id / auditor2Id:
//
//  Rule 1 — Self-assignment only (for non-privileged roles):
//    Users without 'edit:audit:assign:others' (i.e. Auditors, Supervisors)
//    may only place their OWN id into an auditor slot.
//
//  Rule 2 — Conflict of interest (applies to ALL roles including Admin):
//    a) An auditor cannot be assigned to audit their own department.
//    b) An auditor can only be assigned to a department that has an active
//       cross_audit_permissions entry linking their department to the target.
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
  // Fetch all needed audit fields in ONE query (department, auditors, supervisor)
  let finalAuditor1 = updates.auditor1Id;
  let finalAuditor2 = updates.auditor2Id;
  let targetDeptId: string | null = updates.departmentId ?? null;
  let supervisorId: string | null = (updates as any).supervisorId ?? null;
  const auditId = c.req.param('id'); // undefined on POST, present on PATCH

  if (auditId) {
    const existing = await c.env.DB.prepare(
      'SELECT department_id, auditor1_id, auditor2_id, supervisor_id FROM audit_schedules WHERE id = ?',
    )
      .bind(auditId)
      .first<{ department_id: string | null; auditor1_id: string | null; auditor2_id: string | null; supervisor_id: string | null }>();

    if (existing) {
      if (!targetDeptId) targetDeptId = existing.department_id;
      if (!supervisorId) supervisorId = existing.supervisor_id;
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
  // (previously fetched inside the loop — wasted one D1 round-trip per auditor)
  let assignmentMode = 'open-audit';
  try {
    const [strategyRow, ...auditorRows] = await c.env.DB.batch([
      c.env.DB.prepare('SELECT value FROM system_settings WHERE id = ?').bind('audit_strategy'),
      // Fetch all auditor records in one batch call alongside the strategy query
      ...incomingAuditorIds.map(id =>
        c.env.DB.prepare('SELECT department_id, certification_expiry FROM users WHERE id = ?').bind(id)
      ),
    ]) as [D1Result<{ value: string }>, ...D1Result<{ department_id: string | null; certification_expiry: string | null }>[]];

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

    // ── Rule 2: Conflict of interest per auditor ─────────────────────────
    const today = new Date().toISOString().split('T')[0];
    const supervisorIds = supervisorId ? supervisorId.split(',').map(id => id.trim()).filter(Boolean) : [];

    for (let i = 0; i < incomingAuditorIds.length; i++) {
      const auditorId = incomingAuditorIds[i];
      const auditor = (auditorRows[i]?.results?.[0] ?? null) as { department_id: string | null; certification_expiry: string | null } | null;

      if (canAssignOthers && isCoordinatorCaller && !isAdminCaller) {
        if (!caller.departmentId || auditor?.department_id !== caller.departmentId) {
          return c.json({ error: 'Forbidden: coordinators may only assign qualified asset inspectors from their own department' }, 403);
        }
      }

      const certExpiry = auditor?.certification_expiry;
      if (!certExpiry || certExpiry < today) {
        return c.json({ error: 'Assignment blocked: the selected auditor does not hold a valid institutional certificate', code: 'CERT_EXPIRED' }, 403);
      }

      const auditorDeptId = auditor?.department_id;
      if (!auditorDeptId) continue;

      if (auditorDeptId === targetDeptId) {
        return c.json({ error: 'Conflict of interest: an auditor cannot be assigned to audit their own department', code: 'SELF_DEPARTMENT' }, 409);
      }

      if (supervisorIds.includes(auditorId)) {
        return c.json({ error: 'Conflict of interest: the selected officer is a site supervisor for this location and cannot act as its inspector', code: 'SUPERVISOR_CONFLICT_INTERNAL' }, 409);
      }

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
