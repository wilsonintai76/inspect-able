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
  const isAdminCaller = callerRoles.includes('Admin') || caller.role === 'Admin';
  const isCoordinatorCaller = callerRoles.includes('Coordinator') || caller.role === 'Coordinator';

  // ── Rule 1: Self-assignment enforcement ──────────────────────────────────
  const caps = deriveCapabilities({
    id: caller.id,
    email: caller.email,
    role: caller.role,
    roles: callerRoles,
    departmentId: caller.departmentId ?? null,
    certificationExpiry: caller.certificationExpiry ?? null,
  });
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
  // For PATCH: fetch existing data from DB if not overridden in body
  // For POST:  departmentId will always be in the body
  let targetDeptId: string | null = updates.departmentId ?? null;
  const auditId = c.req.param('id'); // undefined on POST, present on PATCH

  if (auditId) {
    const existing = await c.env.DB.prepare(
      'SELECT department_id, auditor1_id, auditor2_id FROM audit_schedules WHERE id = ?',
    )
      .bind(auditId)
      .first<{ department_id: string | null; auditor1_id: string | null; auditor2_id: string | null }>();
    
    if (existing) {
      if (!targetDeptId) {
        targetDeptId = existing.department_id;
      }

      // ATOMIC CONCURRENCY CHECK (Race Condition Guard)
      // If the caller is just self-assigning, prevent them from overwriting someone else's slot
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

  if (!targetDeptId) {
    // Cannot perform conflict check without a target department
    return next();
  }

  // ── Resolve the site supervisor ID ───────────────────────────────────────
  let supervisorId: string | null = (updates as any).supervisorId ?? null;
  if (!supervisorId) {
    const auditId = c.req.param('id');
    if (auditId) {
      const existing = await c.env.DB.prepare('SELECT supervisor_id FROM audit_schedules WHERE id = ?')
        .bind(auditId)
        .first<{ supervisor_id: string | null }>();
      supervisorId = existing?.supervisor_id ?? null;
    }
  }

  // ── Rule 2: Conflict of interest per auditor ─────────────────────────────
  const today = new Date().toISOString().split('T')[0];

  for (const auditorId of incomingAuditorIds) {
    const auditor = await c.env.DB.prepare(
      'SELECT department_id, certification_expiry FROM users WHERE id = ?',
    )
      .bind(auditorId)
      .first<{ department_id: string | null; certification_expiry: string | null }>();

    // Coordinator assign-others is restricted to officers in coordinator's own department.
    if (canAssignOthers && isCoordinatorCaller && !isAdminCaller) {
      if (!caller.departmentId || auditor?.department_id !== caller.departmentId) {
        return c.json(
          { error: 'Forbidden: coordinators may only assign certified officers from their own department' },
          403,
        );
      }
    }

    // ── Rule 2c: Certification expiry ─────────────────────────────────────
    // Mirrors the client-side check in App.tsx handleAssign — now enforced server-side.
    const certExpiry = auditor?.certification_expiry;
    if (!certExpiry || certExpiry < today) {
      return c.json(
        {
          error: 'Assignment blocked: the selected auditor does not hold a valid institutional certificate',
          code: 'CERT_EXPIRED',
        },
        403,
      );
    }

    const auditorDeptId = auditor?.department_id;
    if (!auditorDeptId) continue; // No dept set, cannot verify — allow

    // Rule 2a: Own-department block (ABSOLUTE — no exemptions)
    if (auditorDeptId === targetDeptId) {
      return c.json(
        {
          error: 'Conflict of interest: an auditor cannot be assigned to audit their own department',
          code: 'SELF_DEPARTMENT',
        },
        409,
      );
    }

    // Rule 2d: Site Supervisor Conflict (Integrity Rule)
    const supervisorIds = supervisorId ? supervisorId.split(',').map(id => id.trim()).filter(Boolean) : [];
    if (supervisorIds.includes(auditorId)) {
      return c.json(
        {
          error: 'Conflict of interest: the selected officer is a site supervisor for this location and cannot act as its inspector',
          code: 'SUPERVISOR_CONFLICT_INTERNAL',
        },
        409,
      );
    }

    // Retrieve system setting for audit strategy to check operational mode
    // Force Open Audit by default as the system-wide operational standard
    let assignmentMode = 'open-audit';
    try {
      // Fetch target strategy from D1 first (strongly consistent)
      const dbRes = await c.env.DB.prepare('SELECT value FROM system_settings WHERE id = ?').bind('audit_strategy').first<{ value: string }>();
      let strategyStr = dbRes?.value || null;
      
      // Fall back to KV if D1 is empty
      if (!strategyStr) {
        strategyStr = await c.env.SETTINGS.get('audit_strategy');
      }
      if (strategyStr) {
        let parsed = strategyStr;
        if (typeof strategyStr === 'string') {
          try {
            parsed = JSON.parse(strategyStr);
            if (typeof parsed === 'string') {
              parsed = JSON.parse(parsed);
            }
          } catch (e) {}
        }
        if (parsed && typeof parsed === 'object') {
          if ((parsed as any).assignmentMode) {
            assignmentMode = 'open-audit'; // Force bypass
          }
        }
      }
    } catch (e) {
      console.error('[auditAssignmentGuard] Failed to fetch assignmentMode:', e);
    }

    // Rule 2b: Cross-audit permission required
    // Bypass if system is running in Open Audit Mode (always active)
    if (assignmentMode === 'open-audit') {
      continue;
    }

    // Checks both directed and mutual permissions at either Department or Group level.
    const perm = await c.env.DB.prepare(`
      SELECT p.id 
      FROM cross_audit_permissions p
      JOIN departments d_aud ON d_aud.id = ?
      JOIN departments d_tgt ON d_tgt.id = ?
      WHERE p.is_active = 1 AND (
        -- 1. Direct Department Match
        (p.auditor_dept_id = d_aud.id AND p.target_dept_id = d_tgt.id)
        OR
        (p.is_mutual = 1 AND p.auditor_dept_id = d_tgt.id AND p.target_dept_id = d_aud.id)
        OR
        -- 2. Group-Level Match (if both belong to audit groups)
        (d_aud.audit_group_id IS NOT NULL AND d_tgt.audit_group_id IS NOT NULL AND (
          (p.auditor_group_id = d_aud.audit_group_id AND p.target_group_id = d_tgt.audit_group_id)
          OR
          (p.is_mutual = 1 AND p.auditor_group_id = d_tgt.audit_group_id AND p.target_group_id = d_aud.audit_group_id)
        ))
      )
      LIMIT 1
    `)
      .bind(auditorDeptId, targetDeptId)
      .first<{ id: string }>();

    if (!perm) {
      return c.json(
        {
          error: "Conflict of interest: no active cross-audit permission exists between the auditor's department and the target department",
          code: 'NO_CROSS_PERMISSION',
        },
        403,
      );
    }
  }

  return next();
};
