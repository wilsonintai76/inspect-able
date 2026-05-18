import { Context, Next } from 'hono';
import { Bindings, Variables } from '../types';
import { hasPermissionInContext } from './rbac';

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

  // ── Rule 1: Self-assignment enforcement ──────────────────────────────────
  const canAssignOthers = await hasPermissionInContext(c, 'edit:audit:assign:others');
  if (!canAssignOthers) {
    const illegalSlot = incomingAuditorIds.find(id => id !== caller.id);
    if (illegalSlot) {
      return c.json(
        { error: 'Forbidden: you may only assign yourself to an auditor slot' },
        403,
      );
    }
  }

  // ── Resolve the audit's target department ────────────────────────────────
  // For PATCH: fetch existing departmentId from DB if not overridden in body
  // For POST:  departmentId will always be in the body
  let targetDeptId: string | null = updates.departmentId ?? null;

  if (!targetDeptId) {
    const auditId = c.req.param('id'); // undefined on POST, present on PATCH
    if (auditId) {
      const existing = await c.env.DB.prepare(
        'SELECT department_id FROM audit_schedules WHERE id = ?',
      )
        .bind(auditId)
        .first<{ department_id: string | null }>();
      targetDeptId = existing?.department_id ?? null;
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

    // Fetch target department's exemption status (Internal Audit Mode)
    const targetDept = await c.env.DB.prepare(
      'SELECT is_exempted FROM departments WHERE id = ?'
    ).bind(targetDeptId).first<{ is_exempted: number }>();
    const isInternalAuditMode = targetDept?.is_exempted === 1;

    // Rule 2a: Own-department block (Bypass allowed for ADMINS or departments in Internal Audit Mode)
    const isAdmin = caller.roles?.includes('Admin') || caller.role === 'Admin';
    if (auditorDeptId === targetDeptId && !isAdmin && !isInternalAuditMode) {
      return c.json(
        {
          error: 'Conflict of interest: an auditor cannot be assigned to audit their own department unless it is in Internal Audit Mode',
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

    // Bypass for Internal Audit Mode (Self-Audit)
    if (isInternalAuditMode && auditorDeptId === targetDeptId) {
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
