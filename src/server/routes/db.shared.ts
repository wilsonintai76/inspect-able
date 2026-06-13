import { Hono, Context, Next } from 'hono';
import { cache } from 'hono/cache';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { Bindings, Variables } from '../types';

import { deriveCapabilities } from '../utils/policyEngine';
import { verifyNativeJwt } from '../middleware/auth';
import { hashPassword } from '../services/authService';
import { KVNamespace, D1Database } from '@cloudflare/workers-types';
import { backupD1ToR2 } from '../services/backupService';
import { sendSupervisorApprovalEmail } from '../services/emailService';
import { unassignExpiredAuditors, handleLocationDepartmentTransfer, refreshDepartmentAssetTotals, unassignSpecificAuditorFromFutureAudits, cleanupAuditsForArchivedLocation } from '../services/auditMaintenanceService';

// ═══════════════════════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════════════════════
export const DEFAULT_USER_PASSWORD = 'Poliku@2024';
export const SCHEDULE_CACHE_KEY = 'schedule:all';

// ═══════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════
export const invalidateScheduleCache = (kv: KVNamespace) => {
  kv.delete(SCHEDULE_CACHE_KEY).catch(() => {});
};

export const getRolesForDesignation = (designation?: string | null): string[] | null => {
  if (!designation) return null;
  switch (designation) {
    case 'Coordinator':
      return ['Coordinator'];
    case 'Supervisor':
      return ['Supervisor'];
    case 'Head Of Department':
    case 'Head Of Programme':
    case 'Staff':
    case 'Guest': // legacy — treat same as Staff (base access)
      return ['Guest'];
    default:
      return ['Guest'];
  }
};

export const logApprovalReminderActivity = async (
  c: Context<{ Bindings: Bindings; Variables: Variables }>,
  auditId: string,
  userId: string,
  supervisorName: string,
  mode: 'automatic' | 'manual',
) => {
  const activityId = crypto.randomUUID();
  const message = mode === 'automatic'
    ? `Initial approval email sent to ${supervisorName}`
    : `Manual approval reminder email sent to ${supervisorName}`;

  await c.env.DB.prepare(
    'INSERT INTO system_activities (id, type, user_id, message, metadata) VALUES (?, ?, ?, ?, ?)'
  ).bind(
    activityId,
    'schedule_update',
    userId,
    message,
    JSON.stringify({ auditId, category: 'approval_email', mode })
  ).run();
};

// ═══════════════════════════════════════════════════════════════
// Test Auth Route (embedded in shared since it's a utility)
// ═══════════════════════════════════════════════════════════════
export function addTestAuthRoute(db: Hono<{ Bindings: Bindings, Variables: Variables }>) {
  db.get('/test-auth', async (c) => {
    const authHeader = c.req.header('Authorization');
    if (!authHeader?.startsWith('Bearer ')) return c.json({ error: 'No token' });
    const token = authHeader.slice(7);
    try {
      const payload = await verifyNativeJwt(token, c.env.JWT_SECRET);
      return c.json({ success: true, payload });
    } catch (e: any) {
      return c.json({ success: false, error: e.message, name: e.name });
    }
  });
}

// ═══════════════════════════════════════════════════════════════
// Edge Cache Helper
// ═══════════════════════════════════════════════════════════════
export const edgeCache = (seconds: number) =>
  cache({ cacheName: 'db', cacheControl: `public, max-age=${seconds}, s-maxage=${seconds}` });

// ═══════════════════════════════════════════════════════════════
// Guards
// ═══════════════════════════════════════════════════════════════
export const auditLockGuard = async (c: Context<{ Bindings: Bindings; Variables: Variables }>, next: Next) => {
  const caller = c.get('user')!;
  const caps = deriveCapabilities({ id: caller.id, email: caller.email, role: caller.role, roles: caller.roles || [], departmentId: caller.departmentId || null, certificationExpiry: caller.certificationExpiry || null });

  if (caps.has('system:admin') || caps.has('manage:departments') || caps.has('manage:locations')) return next();

  const id = c.req.param('id');
  const updates = (c.req as any).valid('json') as Record<string, any>;
  const structuralFields = ['phaseId', 'departmentId', 'locationId'];
  const touchesStructure = structuralFields.some(f => updates[f] !== undefined);

  if (!touchesStructure) return next();

  const existing = await c.env.DB.prepare(
    'SELECT date, auditor1_id, auditor2_id FROM audit_schedules WHERE id = ?',
  ).bind(id).first<{ date: string | null; auditor1_id: string | null; auditor2_id: string | null }>();

  if (existing && existing.date && existing.auditor1_id && existing.auditor2_id) {
    return c.json(
      { error: 'Locked audits cannot have their phase, department, or location changed' },
      409,
    );
  }
  return next();
};

export const zeroAssetGuard = async (c: Context<{ Bindings: Bindings; Variables: Variables }>, next: Next) => {
  const body = (c.req as any).valid('json') as { departmentId?: string | null };
  const deptId = body?.departmentId;
  if (!deptId) return next();

  const dept = await c.env.DB.prepare(
    'SELECT total_assets, name FROM departments WHERE id = ?',
  ).bind(deptId).first<{ total_assets: number; name: string }>();

  if (dept && (dept.total_assets || 0) === 0) {
    return c.json(
      { error: `Cannot schedule an audit for '${dept.name}' — it has zero total assets` },
      422,
    );
  }
  return next();
};

export const VALID_TRANSITIONS: Record<string, string[]> = {
  'Pending':            ['In Progress'],
  'In Progress':        ['Pending', 'Completed'],
  'Completed':          [],
};

export const statusTransitionGuard = async (c: Context<{ Bindings: Bindings; Variables: Variables }>, next: Next) => {
  const updates = (c.req as any).valid('json') as { 
    status?: string; 
    date?: string | null; 
    supervisorId?: string | null; 
    auditor1Id?: string | null; 
    auditor2Id?: string | null;
    reportPath?: string | null;
  };
  if (!updates.status) return next();

  const id = c.req.param('id');
  const existing = await c.env.DB.prepare(
    'SELECT status, date, supervisor_id, auditor1_id, auditor2_id, report_path FROM audit_schedules WHERE id = ?',
  ).bind(id).first<{ 
    status: string; 
    date: string | null; 
    supervisor_id: string | null; 
    auditor1_id: string | null; 
    auditor2_id: string | null;
    report_path: string | null;
  }>();

  if (!existing) return next();

  const allowed = VALID_TRANSITIONS[existing.status] || [];
  if (!allowed.includes(updates.status)) {
    return c.json(
      {
        error: `Invalid status transition: '${existing.status}' → '${updates.status}' is not permitted`,
        allowedTransitions: allowed,
        code: 'INVALID_TRANSITION',
      },
      422,
    );
  }

  if (updates.status === 'In Progress') {
    const finalDate = updates.date !== undefined ? updates.date : existing.date;
    const finalSupervisor = updates.supervisorId !== undefined ? updates.supervisorId : existing.supervisor_id;
    const finalAuditor1 = updates.auditor1Id !== undefined ? updates.auditor1Id : existing.auditor1_id;
    const finalAuditor2 = updates.auditor2Id !== undefined ? updates.auditor2Id : existing.auditor2_id;

    if (!finalDate || !finalSupervisor || !finalAuditor1 || !finalAuditor2) {
      return c.json(
        {
          error: 'ACTION BLOCKED: Date, Site Supervisor, and both Inspecting Officers must all be assigned before starting the inspection.',
          code: 'ASSIGNMENT_INCOMPLETE'
        },
        422
      );
    }
  }

  if (updates.status === 'Completed') {
    const finalReport = updates.reportPath !== undefined ? updates.reportPath : existing.report_path;
    if (!finalReport || finalReport.trim() === '') {
      return c.json(
        {
          error: 'ACTION BLOCKED: Upload Required. You must upload the official KEW-PA 11 PDF inspection report to complete this audit.',
          code: 'REPORT_REQUIRED'
        },
        422
      );
    }
  }

  return next();
};

export const patchAuditPermissionGuard = async (c: Context<{ Bindings: Bindings; Variables: Variables }>, next: Next) => {
  const caller = c.get('user')!;
  const { deriveCapabilities } = await import('../utils/policyEngine');
  const caps = deriveCapabilities(caller as any);
  const isAdmin = caps.has('system:admin');
  const isCoordinator = caps.has('manage:departments') && !isAdmin;
  const isSupervisor = caps.has('manage:locations') && !isAdmin && !caps.has('manage:departments');
  const canAudit = caps.has('asset_inspector') || caps.has('assign:self');

  if (!isAdmin && !isCoordinator && !isSupervisor && !canAudit) {
    return c.json({ error: 'Forbidden: unauthorized role' }, 403);
  }

  // ── PBAC: Coordinator department scoping ──────────────────────────────
  if (isCoordinator) {
    const id = c.req.param('id');
    const existing = await c.env.DB.prepare(
      'SELECT department_id FROM audit_schedules WHERE id = ?'
    ).bind(id).first<{ department_id: string | null }>();
    
    if (existing?.department_id && (caller as any).departmentId && existing.department_id !== (caller as any).departmentId) {
      return c.json({ error: 'Forbidden: Coordinator can only modify audits in their own department', code: 'DEPT_SCOPE_VIOLATION' }, 403);
    }
  }

  if (isAdmin || isCoordinator) return next();

  const id = c.req.param('id');
  const updates = (c.req as any).valid('json') as Record<string, any>;

  const existing = await c.env.DB.prepare(
    'SELECT supervisor_id, auditor1_id, auditor2_id, status FROM audit_schedules WHERE id = ?'
  ).bind(id).first<{ supervisor_id: string | null; auditor1_id: string | null; auditor2_id: string | null; status: string }>();

  if (!existing) return next();

  // phaseId is auto-resolved from the date on the client, so it is NOT admin-only
  // when bundled alongside a date change. Only block phaseId if sent WITHOUT a date.
  const adminOnlyFields = updates.date !== undefined
    ? ['departmentId', 'locationId', 'supervisorId']                    // phaseId allowed with date
    : ['phaseId', 'departmentId', 'locationId', 'supervisorId'];        // phaseId blocked standalone
  const hasAdminOnlyFields = adminOnlyFields.some(f => updates[f] !== undefined);
  if (hasAdminOnlyFields) {
    return c.json({ error: 'Forbidden: only Admins and Coordinators can modify location, department, phase, or supervisor assignments' }, 403);
  }

  const isAssignedAuditor = 
    existing.auditor1_id === caller.id || 
    existing.auditor2_id === caller.id ||
    updates.auditor1Id === caller.id ||
    updates.auditor2Id === caller.id;

  if (updates.date !== undefined) {
    const isDesignatedSupervisor = existing.supervisor_id === caller.id;
    // Allow certified field workers (assign:self) to set the date on Pending audits
    // where they are also self-assigning to a slot in the same request.
    // Without this, inspectors hit a deadlock: can't set date (not yet assigned),
    // can't self-assign (no date). The client bundles date+slot to pass isAssignedAuditor,
    // but this guard ensures any code path works.
    const isSelfAssigningToPending = caps.has('assign:self') && existing.status === 'Pending';
    if (!isDesignatedSupervisor && !isAssignedAuditor && !isSupervisor && !isSelfAssigningToPending) {
      return c.json({ error: 'Forbidden: you must be the assigned site supervisor, a Supervisor, or an assigned auditor to modify the date of this inspection' }, 403);
    }
  }

  if (updates.status !== undefined || updates.reportPath !== undefined) {
    if (!isAssignedAuditor) {
      return c.json({ error: 'Forbidden: only the assigned inspecting officer (auditor) can modify the inspection status or upload the report' }, 403);
    }
  }

  return next();
};

// ═══════════════════════════════════════════════════════════════
// Schemas
// ═══════════════════════════════════════════════════════════════
export const assetSchema = z.object({
  id: z.string().uuid().optional(),
  tag: z.string(),
  name: z.string(),
  location: z.string(),
  status: z.string(),
  last_inspected: z.string().optional(),
});

export const auditSchema = z.object({
  id: z.string().optional(),
  status: z.string(),
  date: z.string().nullable(),
  departmentId: z.string().nullable(),
  locationId: z.string().nullable(),
  supervisorId: z.string().nullable(),
  auditor1Id: z.string().nullable(),
  auditor2Id: z.string().nullable(),
  phaseId: z.string().nullable(),
  reportPath: z.string().nullable().optional(),
  isLocked: z.boolean().nullable().optional(),
  verifiedAssetCount: z.number().nullable().optional(),
  assetStatuses: z.record(z.string(), z.number()).nullable().optional(),
});

export const patchAuditSchema = z.object({
  status: z.string().optional(),
  date: z.string().nullable().optional(),
  departmentId: z.string().nullable().optional(),
  locationId: z.string().nullable().optional(),
  supervisorId: z.string().nullable().optional(),
  auditor1Id: z.string().nullable().optional(),
  auditor2Id: z.string().nullable().optional(),
  phaseId: z.string().nullable().optional(),
  reportPath: z.string().nullable().optional(),
  isLocked: z.boolean().nullable().optional(),
  verifiedAssetCount: z.number().nullable().optional(),
  assetStatuses: z.record(z.string(), z.number()).nullable().optional(),
});

export const userSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1),
  email: z.string().email(),
  roles: z.array(z.string()).optional(),
  designation: z.string().nullable().optional(),
  picture: z.string().nullable().optional(),
  departmentId: z.string().nullable().optional(),
  contactNumber: z.string().nullable().optional(),
  status: z.string().optional(),
  isVerified: z.boolean().optional(),
  mustChangePIN: z.boolean().optional(),
  certificationIssued: z.string().nullable().optional(),
  certificationExpiry: z.string().nullable().optional(),
  renewalRequested: z.string().nullable().optional(),
});

export const patchUserSchema = z.object({
  name: z.string().min(1).optional(),
  email: z.string().email().optional(),
  password: z.string().optional(),
  roles: z.array(z.string()).optional(),
  designation: z.string().nullable().optional(),
  picture: z.string().nullable().optional(),
  departmentId: z.string().nullable().optional(),
  contactNumber: z.string().nullable().optional(),
  status: z.string().optional(),
  isVerified: z.boolean().optional(),
  mustChangePIN: z.boolean().optional(),
  lastActive: z.string().optional(),
  certificationIssued: z.string().nullable().optional(),
  certificationExpiry: z.string().nullable().optional(),
  renewalRequested: z.string().nullable().optional(),
});

export async function checkLocationYearConflict(
  db: D1Database,
  locationId: string,
  scheduleId: string | null,
  date: string | null,
  phaseId: string | null
): Promise<string | null> {
  let targetYear: number | null = null;
  if (date) {
    targetYear = new Date(date).getFullYear();
  } else if (phaseId) {
    const phase = await db.prepare('SELECT start_date FROM audit_phases WHERE id = ?').bind(phaseId).first<{ start_date: string }>();
    if (phase?.start_date) {
      targetYear = new Date(phase.start_date).getFullYear();
    }
  }

  if (!targetYear || isNaN(targetYear)) {
    return null;
  }

  const startYear = `${targetYear}-01-01`;
  const endYear = `${targetYear}-12-31`;

  const conflict = await db.prepare(`
    SELECT s.id, s.date, p.name AS phase_name, p.start_date AS phase_start
    FROM audit_schedules s
    JOIN audit_phases p ON s.phase_id = p.id
    WHERE s.location_id = ?
      AND s.id != ?
      AND (
        (s.date >= ? AND s.date <= ?)
        OR
        (s.date IS NULL AND p.start_date >= ? AND p.start_date <= ?)
      )
    LIMIT 1
  `).bind(
    locationId,
    scheduleId || '',
    startYear,
    endYear,
    startYear,
    endYear
  ).first<{ id: string; date: string | null; phase_name: string }>();

  if (conflict) {
    const desc = conflict.date 
      ? `inspected on ${conflict.date}` 
      : `scheduled in phase '${conflict.phase_name}'`;
    return `ACTION BLOCKED: This location is already scheduled to be audited in ${targetYear} (conflict with audit ${desc}). A location can only be inspected once per calendar year.`;
  }

  return null;
}

