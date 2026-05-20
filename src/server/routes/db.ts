import { Hono } from 'hono';
import { Context, Next } from 'hono';
import { cache } from 'hono/cache';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { Bindings, Variables } from '../types';
import { rbacGuard } from '../middleware/rbacGuard';
import { auditAssignmentGuard } from '../middleware/conflictOfInterest';
import { verifyNativeJwt } from '../middleware/auth';
import { hashPassword } from '../services/authService';
import { backupD1ToR2 } from '../services/backupService';
import { sendSupervisorApprovalEmail } from '../services/emailService';

const DEFAULT_USER_PASSWORD = 'Poliku@2024';

const getRolesForDesignation = (designation?: string | null): string[] | null => {
  if (!designation) return null;
  switch (designation) {
    case 'Head Of Department':
    case 'Coordinator':
      return ['Coordinator', 'Supervisor', 'Auditor', 'Staff'];
    case 'Supervisor':
      return ['Supervisor', 'Auditor', 'Staff'];
    case 'Staff':
      return ['Staff'];
    case 'Developer':
      return ['Admin', 'Coordinator', 'Supervisor', 'Auditor', 'Staff'];
    default:
      return null;
  }
};

const db = new Hono<{ Bindings: Bindings, Variables: Variables }>();

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

// ─── Edge Cache Helper ────────────────────────────────────────────────────────
// Wraps Hono's cache() for Cloudflare Workers Cache Storage API.
// Only safe for GET routes whose data changes infrequently (admin config, phases, tiers).
// Cache-Control max-age controls both the CF edge cache and browser cache.
const edgeCache = (seconds: number) =>
  cache({ cacheName: 'db', cacheControl: `public, max-age=${seconds}, s-maxage=${seconds}` });
// ─────────────────────────────────────────────────────────────────────────────



// ─── Audit Lock Guard ────────────────────────────────────────────────────────
// Blocks structural PATCH changes (phaseId, departmentId, locationId) on a
// "locked" audit (one that already has a date AND at least one auditor assigned).
// Mirrors the isAuditLocked check in App.tsx — now enforced server-side.
const auditLockGuard = async (c: Context<{ Bindings: Bindings; Variables: Variables }>, next: Next) => {
  const caller = c.get('user')!;
  const userRoles = caller.roles || [];
  const isAdmin = userRoles.includes('Admin');
  const isCoordinator = userRoles.includes('Coordinator');
  const isSupervisor = userRoles.includes('Supervisor');

  if (isAdmin || isCoordinator || isSupervisor) return next();

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

// ─── Zero-Asset Guard ────────────────────────────────────────────────────────
// Prevents scheduling a new audit for a department with zero total assets.
// Mirrors the client-side check in handleAddAudit in App.tsx.
const zeroAssetGuard = async (c: Context<{ Bindings: Bindings; Variables: Variables }>, next: Next) => {
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

// ─── Status Transition Guard ─────────────────────────────────────────────────
// Enforces the valid audit state machine:
//   Pending → Awaiting Approval → In Progress → Completed
// Applies to PATCH /audits/:id when status is being changed.
const VALID_TRANSITIONS: Record<string, string[]> = {
  'Pending':            ['Awaiting Approval', 'In Progress'],
  'Awaiting Approval':  ['Pending', 'In Progress'],
  'In Progress':        ['Awaiting Approval', 'Pending', 'Completed'],
  'Completed':          [],
};

const statusTransitionGuard = async (c: Context<{ Bindings: Bindings; Variables: Variables }>, next: Next) => {
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

  if (!existing) return next(); // Will 404 in handler

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

  // 1. Enforce that "In Progress" requires date, supervisor, and BOTH auditors
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

  // 2. Enforce that "Completed" requires report_path
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
// ────────────────────────────────────────────────────────────────────────────

// ─── Patch Audit Permission Guard ───────────────────────────────────────────
// Enforces fine-grained authorization for updating inspections:
//   - Admins & Coordinators: full access
//   - Site Supervisors & Auditors: restricted to dates/assignments (self-only),
//     and only assigned auditors can upload KEW-PA 11 to complete.
const patchAuditPermissionGuard = async (c: Context<{ Bindings: Bindings; Variables: Variables }>, next: Next) => {
  const caller = c.get('user')!;
  const userRoles = caller.roles || [];
  const isAdmin = userRoles.includes('Admin');
  const isCoordinator = userRoles.includes('Coordinator');
  const isSupervisor = userRoles.includes('Supervisor');
  const isAuditor = userRoles.includes('Auditor');

  if (!isAdmin && !isCoordinator && !isSupervisor && !isAuditor) {
    return c.json({ error: 'Forbidden: unauthorized role' }, 403);
  }

  if (isAdmin || isCoordinator) return next();

  const id = c.req.param('id');
  const updates = (c.req as any).valid('json') as Record<string, any>;

  const existing = await c.env.DB.prepare(
    'SELECT supervisor_id, auditor1_id, auditor2_id, status FROM audit_schedules WHERE id = ?'
  ).bind(id).first<{ supervisor_id: string | null; auditor1_id: string | null; auditor2_id: string | null; status: string }>();

  if (!existing) return next();

  const adminOnlyFields = ['phaseId', 'departmentId', 'locationId', 'supervisorId'];
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
    if (!isDesignatedSupervisor && !isAssignedAuditor) {
      return c.json({ error: 'Forbidden: you must be the assigned site supervisor or auditor to modify the date of this inspection' }, 403);
    }
  }

  if (updates.status !== undefined || updates.reportPath !== undefined) {
    if (!isAssignedAuditor) {
      return c.json({ error: 'Forbidden: only the assigned inspecting officer (auditor) can modify the inspection status or upload the report' }, 403);
    }
  }

  return next();
};
// ────────────────────────────────────────────────────────────────────────────

// Schemas (Example for Assets - needs to match types.ts)
const assetSchema = z.object({
  id: z.string().uuid().optional(),
  tag: z.string(),
  name: z.string(),
  location: z.string(),
  status: z.string(),
  last_inspected: z.string().optional(),
});

// Audits
const auditSchema = z.object({
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
});

const patchAuditSchema = z.object({
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
});

const userSchema = z.object({
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
});

const patchUserSchema = z.object({
  email: z.string().email().optional(),
  name: z.string().min(1).optional(),
  roles: z.array(z.string()).optional(),
  designation: z.string().nullable().optional(),
  departmentId: z.string().nullable().optional(),
  contactNumber: z.string().nullable().optional(),
  isVerified: z.boolean().optional(),
  mustChangePIN: z.boolean().optional(),
  lastActive: z.string().optional(),
  certificationIssued: z.string().nullable().optional(),
  certificationExpiry: z.string().nullable().optional(),
  renewalRequested: z.string().nullable().optional(),
  password: z.string().min(8).optional(),
});

db.get('/audits', async (c) => {
  try {
    // Sweep: auto-fix any Pending records that already have all required fields set.
    // These transition to 'Awaiting Approval' (supervisor must lock to start).
    await c.env.DB.prepare(
      `UPDATE audit_schedules SET status = 'Awaiting Approval'
       WHERE status = 'Pending' AND date IS NOT NULL AND supervisor_id IS NOT NULL
       AND auditor1_id IS NOT NULL AND auditor2_id IS NOT NULL`
    ).run();

    const { results } = await c.env.DB.prepare(
      'SELECT id, department_id, location_id, supervisor_id, auditor1_id, auditor2_id, date, status, phase_id, report_path, is_locked FROM audit_schedules'
    ).all();
    
    return c.json((results || []).map((a: any) => ({
      id: a.id,
      departmentId: a.department_id,
      locationId: a.location_id,
      supervisorId: a.supervisor_id,
      auditor1Id: a.auditor1_id,
      auditor2Id: a.auditor2_id,
      date: a.date,
      status: a.status,
      phaseId: a.phase_id,
      reportPath: a.report_path,
      isLocked: a.is_locked === null ? undefined : (a.is_locked === 1)
    })));
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

db.post('/audits', zValidator('json', auditSchema), rbacGuard('assign:others'), zeroAssetGuard, auditAssignmentGuard, async (c) => {
  const audit = c.req.valid('json');
  const id = audit.id || crypto.randomUUID();
  
  let phaseId = audit.phaseId;
  if (audit.date) {
    const matchingPhase = await c.env.DB.prepare(
      'SELECT id FROM audit_phases WHERE start_date <= ? AND end_date >= ? LIMIT 1'
    ).bind(audit.date, audit.date).first<{ id: string }>();
    if (matchingPhase) {
      phaseId = matchingPhase.id;
    }
  }

  try {
    await c.env.DB.prepare(
      `INSERT INTO audit_schedules 
       (id, department_id, location_id, supervisor_id, auditor1_id, auditor2_id, date, status, phase_id, report_path, is_locked) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      id,
      audit.departmentId ?? null,
      audit.locationId ?? null,
      audit.supervisorId ?? null,
      audit.auditor1Id ?? null,
      audit.auditor2Id ?? null,
      audit.date ?? null,
      audit.status ?? 'Scheduled',
      phaseId ?? null,
      audit.reportPath ?? null,
      audit.isLocked === undefined || audit.isLocked === null ? null : (audit.isLocked ? 1 : 0)
    ).run();

    return c.json({
      id,
      ...audit,
      phaseId
    });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

db.patch('/audits/:id', zValidator('json', patchAuditSchema), patchAuditPermissionGuard, auditLockGuard, statusTransitionGuard, auditAssignmentGuard, async (c) => {
  const id = c.req.param('id');
  const updates = c.req.valid('json');

  // Date-driven phase auto-routing
  if (updates.date !== undefined) {
    if (updates.date) {
      const matchingPhase = await c.env.DB.prepare(
        'SELECT id FROM audit_phases WHERE start_date <= ? AND end_date >= ? LIMIT 1'
      ).bind(updates.date, updates.date).first<{ id: string }>();
      if (matchingPhase) {
        updates.phaseId = matchingPhase.id;
      }
    }
  }

  // Automatic status transitions between Pending and In Progress based on assignment completeness
  const existingForActivation = await c.env.DB.prepare(
    'SELECT status, date, supervisor_id, auditor1_id, auditor2_id FROM audit_schedules WHERE id = ?'
  ).bind(id).first<{ status: string; date: string | null; supervisor_id: string | null; auditor1_id: string | null; auditor2_id: string | null }>();

  if (existingForActivation) {
    const currentStatus = updates.status || existingForActivation.status;
    const finalDate = updates.date !== undefined ? updates.date : existingForActivation.date;
    const finalSupervisor = updates.supervisorId !== undefined ? updates.supervisorId : existingForActivation.supervisor_id;
    const finalAuditor1 = updates.auditor1Id !== undefined ? updates.auditor1Id : existingForActivation.auditor1_id;
    const finalAuditor2 = updates.auditor2Id !== undefined ? updates.auditor2Id : existingForActivation.auditor2_id;

    if (currentStatus === 'Pending') {
      if (finalDate && finalSupervisor && finalAuditor1 && finalAuditor2) {
        updates.status = 'Awaiting Approval';
      }
    } else if (currentStatus === 'In Progress' || currentStatus === 'Awaiting Approval') {
      if (!finalDate || !finalSupervisor || !finalAuditor1 || !finalAuditor2) {
        updates.status = 'Pending';
      }
    }
  }

  const fields: string[] = [];
  const values: any[] = [];

  if (updates.status !== undefined) { fields.push('status = ?'); values.push(updates.status); }
  if (updates.date !== undefined) { fields.push('date = ?'); values.push(updates.date); }
  if (updates.departmentId !== undefined) { fields.push('department_id = ?'); values.push(updates.departmentId); }
  if (updates.locationId !== undefined) { fields.push('location_id = ?'); values.push(updates.locationId); }
  if (updates.supervisorId !== undefined) { fields.push('supervisor_id = ?'); values.push(updates.supervisorId); }
  if (updates.auditor1Id !== undefined) { fields.push('auditor1_id = ?'); values.push(updates.auditor1Id); }
  if (updates.auditor2Id !== undefined) { fields.push('auditor2_id = ?'); values.push(updates.auditor2Id); }
  if (updates.phaseId !== undefined) { fields.push('phase_id = ?'); values.push(updates.phaseId); }
  if (updates.reportPath !== undefined) { fields.push('report_path = ?'); values.push(updates.reportPath); }
  if (updates.isLocked !== undefined) {
    const callerRoles = (c.get('user') as any)?.roles || [];
    if (!callerRoles.includes('Supervisor') && !callerRoles.includes('Admin') && !callerRoles.includes('Coordinator')) {
      return c.json({ error: 'Only Supervisors can lock or unlock schedules.' }, 403);
    }
    fields.push('is_locked = ?');
    values.push(updates.isLocked === null ? null : (updates.isLocked ? 1 : 0));

    // Lock approval: Awaiting Approval → In Progress
    if (updates.isLocked === true && existingForActivation?.status === 'Awaiting Approval') {
      fields.push('status = ?');
      values.push('In Progress');
      updates.status = 'In Progress'; // used below for email guard
    }
    // Revoke approval: In Progress → Awaiting Approval (if all fields still present)
    if (updates.isLocked === false && existingForActivation?.status === 'In Progress') {
      const d  = existingForActivation.date;
      const s  = existingForActivation.supervisor_id;
      const a1 = existingForActivation.auditor1_id;
      const a2 = existingForActivation.auditor2_id;
      if (d && s && a1 && a2) {
        fields.push('status = ?');
        values.push('Awaiting Approval');
      }
    }
  }

  if (fields.length === 0) return c.json({ success: true });

  try {
    await c.env.DB.prepare(
      `UPDATE audit_schedules SET ${fields.join(', ')} WHERE id = ?`
    ).bind(...values, id).run();

    // Fire-and-forget email when status just became 'Awaiting Approval'
    const previousStatus = existingForActivation?.status;
    const newStatus = updates.status;
    if (
      newStatus === 'Awaiting Approval' &&
      previousStatus !== 'Awaiting Approval' &&
      c.env.RESEND_API_KEY
    ) {
      const supervisorId = updates.supervisorId ?? existingForActivation?.supervisor_id ?? null;
      if (supervisorId) {
        (async () => {
          try {
            const supervisor = await c.env.DB.prepare(
              'SELECT name, email FROM users WHERE id = ?'
            ).bind(supervisorId).first<{ name: string; email: string }>();

            if (!supervisor?.email) return;

            // Get location and department names
            const schedule = await c.env.DB.prepare(
              'SELECT location_id, department_id, date FROM audit_schedules WHERE id = ?'
            ).bind(id).first<{ location_id: string | null; department_id: string | null; date: string | null }>();

            const locationName = schedule?.location_id
              ? (await c.env.DB.prepare('SELECT name FROM locations WHERE id = ?')
                  .bind(schedule.location_id)
                  .first<{ name: string }>())?.name ?? 'Unknown Location'
              : 'Unknown Location';

            const departmentName = schedule?.department_id
              ? (await c.env.DB.prepare('SELECT name FROM departments WHERE id = ?')
                  .bind(schedule.department_id)
                  .first<{ name: string }>())?.name ?? 'Unknown Department'
              : 'Unknown Department';

            const auditDate = schedule?.date ?? 'TBD';

            await sendSupervisorApprovalEmail(
              c.env.RESEND_API_KEY!,
              supervisor.email,
              supervisor.name,
              locationName,
              departmentName,
              auditDate,
              c.env.APP_URL,
            );
          } catch (emailErr) {
            console.error('[Email] Supervisor approval email failed:', emailErr);
          }
        })();
      }
    }

    return c.json({ success: true });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

db.delete('/audits/:id', rbacGuard('assign:others'), async (c) => {
  const id = c.req.param('id');
  try {
    await c.env.DB.prepare('DELETE FROM audit_schedules WHERE id = ?').bind(id).run();
    return c.json({ success: true });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

db.post('/audits/bulk', rbacGuard('assign:others'), async (c) => {
  const audits = await c.req.json();
  try {
    const statements = [];
    for (const a of audits) {
      const id = a.id || crypto.randomUUID();
      
      let phaseId = a.phaseId;
      if (a.date) {
        const matchingPhase = await c.env.DB.prepare(
          'SELECT id FROM audit_phases WHERE start_date <= ? AND end_date >= ? LIMIT 1'
        ).bind(a.date, a.date).first<{ id: string }>();
        if (matchingPhase) {
          phaseId = matchingPhase.id;
        }
      }

      statements.push(
        c.env.DB.prepare(
          `INSERT INTO audit_schedules 
           (id, department_id, location_id, supervisor_id, auditor1_id, auditor2_id, date, status, phase_id, report_path) 
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).bind(
          id,
          a.departmentId ?? null,
          a.locationId ?? null,
          a.supervisorId ?? null,
          a.auditor1Id ?? null,
          a.auditor2Id ?? null,
          a.date ?? null,
          a.status ?? 'Scheduled',
          phaseId ?? null,
          a.reportPath ?? null
        )
      );
    }
    await c.env.DB.batch(statements);
    return c.json({ success: true, count: audits.length });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// --- USER MANAGEMENT ---

db.post('/users/:id/reset-password', rbacGuard('admin:hub'), async (c) => {
  const id = c.req.param('id');
  try {
    const defaultHash = await hashPassword(DEFAULT_USER_PASSWORD);
    await c.env.DB.prepare(
      'UPDATE users SET password_hash = ?, must_change_pin = 1 WHERE id = ?'
    ).bind(defaultHash, id).run();
    
    // Evict cache
    await c.env.SETTINGS.delete(`ucache:${id}`).catch(() => {});
    
    return c.json({ success: true, message: `Password reset to default: ${DEFAULT_USER_PASSWORD}` });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// Users
db.get('/users', async (c) => {
  try {
    const caller = c.get('user');
    const isSuperAdmin = caller?.email?.toLowerCase() === 'admin@poliku.edu.my';
    const isAdmin = caller?.roles?.includes('Admin');

    let sql = 'SELECT id, name, email, roles, designation, picture, department_id, contact_number, status, is_verified, must_change_pin, certification_issued, certification_expiry, renewal_requested, last_active FROM users';
    const binds: any[] = [];
    
    // Filtering logic
    const filters: string[] = [];
    if (!isSuperAdmin) {
      filters.push('email != ?');
      binds.push('admin@poliku.edu.my');
    }

    // Role-based filtering for Coordinators
    if (!isSuperAdmin && !isAdmin && caller?.roles?.includes('Coordinator')) {
      filters.push('department_id = ?');
      binds.push(caller.departmentId);
    }

    if (filters.length > 0) {
      sql += ' WHERE ' + filters.join(' AND ');
    }

    const { results } = await c.env.DB.prepare(sql).bind(...binds).all();

    return c.json((results || []).map((u: any) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      roles: JSON.parse(u.roles || '["Staff"]'),
      designation: u.designation,
      picture: u.picture,
      departmentId: u.department_id,
      contactNumber: u.contact_number,
      status: u.status,
      isVerified: u.is_verified === 1,
      mustChangePIN: u.must_change_pin === 1,
      certificationIssued: u.certification_issued,
      certificationExpiry: u.certification_expiry,
      renewalRequested: u.renewal_requested ?? null,
      lastActive: u.last_active,
    })));
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

db.post('/users', rbacGuard('edit:team'), zValidator('json', userSchema), async (c) => {
  const newUser = c.req.valid('json');
  const caller = c.get('user');
  const isSuperAdmin = caller?.email?.toLowerCase() === 'admin@poliku.edu.my';
  const isAdmin = caller?.roles?.includes('Admin');

  // Enforce departmental isolation for non-admins
  if (!isSuperAdmin && !isAdmin && caller?.roles?.includes('Coordinator')) {
    if (newUser.departmentId !== caller.departmentId) {
      return c.json({ error: 'Coordinators can only create users in their own department' }, 403);
    }
  }

  const id = newUser.id || crypto.randomUUID();

  // Check for duplicate email (case-insensitive)
  const existing = await c.env.DB.prepare('SELECT id, name FROM users WHERE LOWER(email) = ?').bind(newUser.email.toLowerCase()).first();
  if (existing) {
    return c.json({ error: `Email ${newUser.email} is already registered to ${(existing as any).name}.` }, 409);
  }

  // 1. Calculate Binding Roles if not explicitly provided
  let roles = newUser.roles;
  if (!roles || roles.length === 0) {
    roles = getRolesForDesignation(newUser.designation) || ['Staff'];
  }

  // 2. Set Default Password Hash & Force PIN Change for manual creation
  const defaultHash = await hashPassword(DEFAULT_USER_PASSWORD);
  const mustChangePIN = newUser.mustChangePIN !== undefined ? newUser.mustChangePIN : true;

  try {
    await c.env.DB.prepare(
      `INSERT INTO users 
       (id, name, email, password_hash, roles, designation, picture, department_id, contact_number, status, is_verified, must_change_pin, certification_issued, certification_expiry) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      id,
      newUser.name,
      newUser.email.toLowerCase().trim(),
      defaultHash,
      JSON.stringify(roles),
      newUser.designation ?? null,
      newUser.picture ?? null,
      newUser.departmentId ?? null,
      newUser.contactNumber ?? null,
      newUser.status ?? 'Active',
      newUser.isVerified ? 1 : 0,
      mustChangePIN ? 1 : 0,
      newUser.certificationIssued ?? null,
      newUser.certificationExpiry ?? null
    ).run();

    return c.json({ id, ...newUser, roles, mustChangePIN });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

db.patch('/users/:id', zValidator('json', patchUserSchema), async (c) => {
  const id = c.req.param('id');
  const updates = c.req.valid('json');
  const caller = c.get('user');
  const callerRoles: string[] = caller?.roles || [];
  const isSuperAdmin = caller?.email?.toLowerCase() === 'admin@poliku.edu.my';
  const isAdmin = callerRoles.includes('Admin');
  const isCoordinator = callerRoles.includes('Coordinator');

  if (isSuperAdmin) {
    // Superadmin bypass
  } else if (!isAdmin && !isCoordinator && caller?.id !== id) {
    // Staff can only update themselves
    return c.json({ error: 'Forbidden' }, 403);
  } else if (!isAdmin && isCoordinator) {
    // Coordinators can update themselves OR users in their department
    if (caller?.id !== id) {
      const targetUser = await c.env.DB.prepare('SELECT department_id FROM users WHERE id = ?').bind(id).first<{department_id: string}>();
      if (!targetUser || targetUser.department_id !== caller?.departmentId) {
        return c.json({ error: 'Coordinators can only manage users within their own department' }, 403);
      }
      
      // Prevent Coordinator from re-assigning user to another department
      if (updates.departmentId && updates.departmentId !== caller?.departmentId) {
         return c.json({ error: 'Cannot re-assign user to a different department' }, 403);
      }
    }
  }
  // Only Admin can change roles, verification, and certification
  if (!isAdmin && (updates.roles !== undefined || updates.isVerified !== undefined || updates.certificationIssued !== undefined || updates.certificationExpiry !== undefined)) {
    return c.json({ error: 'Forbidden: only Admin can change roles or certification' }, 403);
  }

  const fields: string[] = [];
  const values: any[] = [];

  // Sync roles if designation is updated and roles are NOT explicitly provided
  if (updates.designation !== undefined && updates.roles === undefined) {
    const boundRoles = getRolesForDesignation(updates.designation);
    if (boundRoles) {
      updates.roles = boundRoles;
    }
  }

  if (updates.password !== undefined) { 
    const hash = await hashPassword(updates.password);
    fields.push('password_hash = ?'); 
    values.push(hash); 
  }
  if (updates.email !== undefined) { fields.push('email = ?'); values.push(updates.email.toLowerCase().trim()); }
  if (updates.name !== undefined) { fields.push('name = ?'); values.push(updates.name); }
  if (updates.roles !== undefined) { fields.push('roles = ?'); values.push(JSON.stringify(updates.roles)); }
  if (updates.designation !== undefined) { fields.push('designation = ?'); values.push(updates.designation); }
  if (updates.departmentId !== undefined) { fields.push('department_id = ?'); values.push(updates.departmentId); }
  if (updates.contactNumber !== undefined) { fields.push('contact_number = ?'); values.push(updates.contactNumber); }
  if (updates.isVerified !== undefined) { fields.push('is_verified = ?'); values.push(updates.isVerified ? 1 : 0); }
  if (updates.mustChangePIN !== undefined) { fields.push('must_change_pin = ?'); values.push(updates.mustChangePIN ? 1 : 0); }
  if (updates.lastActive !== undefined) { fields.push('last_active = ?'); values.push(updates.lastActive); }
  if (updates.certificationIssued !== undefined) { fields.push('certification_issued = ?'); values.push(updates.certificationIssued); }
  if (updates.certificationExpiry !== undefined) { fields.push('certification_expiry = ?'); values.push(updates.certificationExpiry); }
  if (updates.renewalRequested !== undefined) { fields.push('renewal_requested = ?'); values.push(updates.renewalRequested); }

  if (fields.length === 0) return c.json({ success: true });

  try {
    await c.env.DB.prepare(
      `UPDATE users SET ${fields.join(', ')} WHERE id = ?`
    ).bind(...values, id).run();
    // Evict cached roles/departmentId if any privileged fields changed
    const privilegedChanged = updates.roles !== undefined || updates.departmentId !== undefined
      || updates.isVerified !== undefined || updates.certificationIssued !== undefined
      || updates.certificationExpiry !== undefined || updates.renewalRequested !== undefined;
    if (privilegedChanged) {
      await c.env.SETTINGS.delete(`ucache:${id}`).catch(() => {});
    }
    return c.json({ success: true });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

db.delete('/users/:id', rbacGuard('admin:hub'), async (c) => {
  const id = c.req.param('id');
  try {
    // Step 1: Clear all foreign key references before deleting the user
    // Clear from system_activities (FK: user_id)
    await c.env.DB.prepare('UPDATE system_activities SET user_id = NULL WHERE user_id = ?').bind(id).run();
    // Clear from departments (head_of_dept_id)
    await c.env.DB.prepare('UPDATE departments SET head_of_dept_id = NULL WHERE head_of_dept_id = ?').bind(id).run();
    // Clear from locations (supervisor_id)
    await c.env.DB.prepare('UPDATE locations SET supervisor_id = NULL WHERE supervisor_id = ?').bind(id).run();
    // Clear from audit_schedules (supervisor_id, auditor1_id, auditor2_id)
    await c.env.DB.prepare('UPDATE audit_schedules SET supervisor_id = NULL, auditor1_id = NULL, auditor2_id = NULL WHERE supervisor_id = ? OR auditor1_id = ? OR auditor2_id = ?').bind(id, id, id).run();
    // Clear from users (department_id — unassign from department)
    await c.env.DB.prepare('UPDATE users SET department_id = NULL WHERE department_id = ?').bind(id).run();

    // Step 2: Now safe to delete the user
    await c.env.DB.prepare('DELETE FROM users WHERE id = ?').bind(id).run();
    // Evict roles cache + force-out active session
    await Promise.allSettled([
      c.env.SETTINGS.delete(`ucache:${id}`),
      c.env.SETTINGS.delete(`sess:${id}`),
    ]);
    return c.json({ success: true });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

db.post('/users/:id/verify', rbacGuard('admin:hub'), async (c) => {
  const id = c.req.param('id');
  try {
    await c.env.DB.prepare('UPDATE users SET is_verified = 1, status = \'Active\' WHERE id = ?').bind(id).run();
    // Evict stale role cache so next request fetches updated status from D1
    await c.env.SETTINGS.delete(`ucache:${id}`).catch(() => {});
    const { results } = await c.env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(id).all();
    const u = results[0] as any;
    return c.json({
      id: u.id,
      name: u.name,
      email: u.email,
      roles: JSON.parse(u.roles || '["Staff"]'),
      designation: u.designation,
      picture: u.picture,
      departmentId: u.department_id,
      contactNumber: u.contact_number,
      status: u.status,
      isVerified: u.is_verified === 1,
      mustChangePIN: u.must_change_pin === 1,
      certificationIssued: u.certification_issued,
      certificationExpiry: u.certification_expiry,
      lastActive: u.last_active,
    });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// Departments
db.get('/departments', async (c) => {
  try {
    // Idempotent migrations for existing deployments
    await c.env.DB.prepare('ALTER TABLE departments ADD COLUMN is_archived INTEGER DEFAULT 0').run().catch(() => {});
    await c.env.DB.prepare('ALTER TABLE departments ADD COLUMN archived_by TEXT').run().catch(() => {});
    await c.env.DB.prepare('ALTER TABLE departments ADD COLUMN archived_at TEXT').run().catch(() => {});

    const caller = c.get('user');
    const isSuperAdmin = caller?.email?.toLowerCase() === 'admin@poliku.edu.my';

    let sql = 'SELECT id, name, abbr, description, head_of_dept_id, audit_group_id, is_exempted, total_assets, uninspected_asset_count, is_archived, archived_by, archived_at FROM departments';
    const binds: any[] = [];

    if (!isSuperAdmin) {
      sql += ' WHERE name != ?';
      binds.push('Software Development');
    }

    const { results } = await c.env.DB.prepare(sql).bind(...binds).all();
    return c.json((results || []).map((d: any) => ({
      id: d.id,
      name: d.name,
      abbr: d.abbr,
      description: d.description,
      headOfDeptId: d.head_of_dept_id,
      auditGroupId: d.audit_group_id,
      isExempted: d.is_exempted === 1,
      totalAssets: d.total_assets ?? 0,
      uninspectedAssetCount: d.uninspected_asset_count ?? 0,
      isArchived: d.is_archived === 1,
      archivedBy: d.archived_by ?? null,
      archivedAt: d.archived_at ?? null,
    })));
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// Sync department asset totals from locations (Source of Truth)
db.post('/departments/refresh', rbacGuard('manage:departments'), async (c) => {
  try {
    await c.env.DB.prepare(`
      UPDATE departments 
      SET total_assets = (
        SELECT COALESCE(SUM(l.total_assets), 0) 
        FROM locations l 
        WHERE l.department_id = departments.id AND l.status != 'Archived'
      ),
      uninspected_asset_count = (
        SELECT COALESCE(SUM(l.uninspected_asset_count), 0) 
        FROM locations l 
        WHERE l.department_id = departments.id AND l.status != 'Archived'
      )
      WHERE id IN (SELECT DISTINCT department_id FROM locations)
    `).run();
    return c.json({ success: true });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

db.post('/departments', rbacGuard('manage:departments'), async (c) => {
  const dept = await c.req.json();
  const id = dept.id || crypto.randomUUID();
  const groupId = crypto.randomUUID(); // Auto-create a solo group
  try {
    // 1. Create the Solo Group
    await c.env.DB.prepare(
      'INSERT INTO audit_groups (id, name) VALUES (?, ?)'
    ).bind(groupId, dept.name).run();

    // 2. Create the Department linked to that group
    await c.env.DB.prepare(
      'INSERT INTO departments (id, name, abbr, description, head_of_dept_id, audit_group_id, is_exempted) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).bind(
      id,
      dept.name,
      dept.abbr,
      dept.description ?? null,
      dept.headOfDeptId ?? null,
      groupId, // Link to the new group
      dept.isExempted ? 1 : 0
    ).run();

    return c.json({ id, ...dept, auditGroupId: groupId });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

db.patch('/departments/:id', rbacGuard('manage:departments'), async (c) => {
  const id = c.req.param('id');
  const updates = await c.req.json();
  const fields: string[] = [];
  const values: any[] = [];

  if (updates.name !== undefined) { fields.push('name = ?'); values.push(updates.name); }
  if (updates.abbr !== undefined) { fields.push('abbr = ?'); values.push(updates.abbr); }
  if (updates.description !== undefined) { fields.push('description = ?'); values.push(updates.description); }
  if (updates.headOfDeptId !== undefined) { fields.push('head_of_dept_id = ?'); values.push(updates.headOfDeptId); }
  if (updates.auditGroupId !== undefined) { fields.push('audit_group_id = ?'); values.push(updates.auditGroupId); }
  if (updates.isExempted !== undefined) { fields.push('is_exempted = ?'); values.push(updates.isExempted ? 1 : 0); }
  if (updates.totalAssets !== undefined) { fields.push('total_assets = ?'); values.push(updates.totalAssets); }
  if (updates.uninspectedAssetCount !== undefined) { fields.push('uninspected_asset_count = ?'); values.push(updates.uninspectedAssetCount); }
  if (updates.isArchived !== undefined) {
    fields.push('is_archived = ?'); values.push(updates.isArchived ? 1 : 0);
    const caller = c.get('user');
    if (updates.isArchived) {
      fields.push('archived_by = ?'); values.push(caller ? `${caller.name} (${caller.email})` : 'Unknown');
      fields.push('archived_at = ?'); values.push(new Date().toISOString());
    } else {
      // Restoring — clear audit trail
      fields.push('archived_by = ?'); values.push(null);
      fields.push('archived_at = ?'); values.push(null);
    }
  }

  if (fields.length === 0) return c.json({ success: true });

  try {
    await c.env.DB.prepare(`UPDATE departments SET ${fields.join(', ')} WHERE id = ?`).bind(...values, id).run();
    return c.json({ success: true });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

db.delete('/departments/:id', rbacGuard('manage:departments'), async (c) => {
  const id = c.req.param('id');
  const caller = c.get('user');
  try {
    await c.env.DB.prepare(
      'UPDATE departments SET is_archived = 1, archived_by = ?, archived_at = ? WHERE id = ?'
    ).bind(caller ? `${caller.name} (${caller.email})` : 'Unknown', new Date().toISOString(), id).run();
    return c.json({ success: true });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

db.delete('/departments/:id/purge', rbacGuard('manage:departments'), async (c) => {
  const id = c.req.param('id');
  try {
    // Only allow purge if already archived
    const row = await c.env.DB.prepare('SELECT is_archived FROM departments WHERE id = ? LIMIT 1').bind(id).first<{ is_archived: number }>();
    if (!row) return c.json({ error: 'Not found' }, 404);
    if (row.is_archived !== 1) return c.json({ error: 'Department must be archived before purging' }, 400);
    // Orphan locations (clear dept link) rather than cascade-deleting them
    await c.env.DB.prepare('UPDATE locations SET department_id = NULL WHERE department_id = ?').bind(id).run();
    await c.env.DB.prepare('DELETE FROM departments WHERE id = ?').bind(id).run();
    return c.json({ success: true });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

db.delete('/departments/:id/force', rbacGuard('admin:hub'), async (c) => {
  const id = c.req.param('id');
  try {
    // In D1, we might need a stored procedure-like logic or multi-statement
    // For now, let's just delete dependencies manually if needed, or assume CASCADE if set.
    await c.env.DB.prepare('DELETE FROM departments WHERE id = ?').bind(id).run();
    return c.json({ success: true });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// ─── RESET DEPARTMENTS ───────────────────────────────────────────────────────
// Deletes ALL departments, locations, and schedules. MAINTAINS users.
db.post('/departments/clear', rbacGuard('admin:hub'), async (c) => {
  try {
    const deletes = [
      { id: 'schedules', sql: 'DELETE FROM audit_schedules' },
      { id: 'groups',    sql: 'DELETE FROM audit_groups' },
      { id: 'perms',     sql: 'DELETE FROM cross_audit_permissions' },
      { id: 'mappings',  sql: 'DELETE FROM department_mappings' },
      { id: 'loc_mappings', sql: 'DELETE FROM location_mappings' },
      { id: 'locations', sql: 'DELETE FROM locations' },
      { id: 'buildings', sql: 'DELETE FROM buildings' },
      { id: 'activities',sql: 'DELETE FROM system_activities' },
    ];

    for (const d of deletes) {
      await c.env.DB.prepare(d.sql).run();
    }

    // Departments are the root — clearing them effectively resets the hierarchy
    await c.env.DB.prepare('DELETE FROM departments').run();
    
    // Clear department associations from users but keep the accounts
    await c.env.DB.prepare('UPDATE users SET department_id = NULL').run();

    // Clear KV buildings cache
    await c.env.SETTINGS.delete('buildings').catch(() => {});

    return c.json({ success: true, message: 'Departments cleared. User accounts maintained.' });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// Locations
db.get('/locations', async (c) => {
  try {
    // Idempotent migrations for archived_by / archived_at
    await c.env.DB.prepare('ALTER TABLE locations ADD COLUMN archived_by TEXT').run().catch(() => {});
    await c.env.DB.prepare('ALTER TABLE locations ADD COLUMN archived_at TEXT').run().catch(() => {});

    const { results } = await c.env.DB.prepare(
    'SELECT id, name, abbr, department_id, building_id, level, description, supervisor_id, contact, total_assets, uninspected_asset_count, is_active, status, archived_by, archived_at FROM locations',
  ).all();
    return c.json((results || []).map((l: any) => ({
      id: l.id,
      name: l.name,
      abbr: l.abbr,
      departmentId: l.department_id,
      buildingId: l.building_id,
      level: l.level,
      description: l.description,
      supervisorId: l.supervisor_id,
      contact: l.contact,
      totalAssets: l.total_assets ?? 0,
      uninspectedAssetCount: l.uninspected_asset_count ?? 0,
      isActive: l.is_active === 1,
      status: l.status,
      archivedBy: l.archived_by ?? null,
      archivedAt: l.archived_at ?? null,
    })));
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

db.post('/locations', rbacGuard('manage:locations'), async (c) => {
  const loc = await c.req.json();
  const id = loc.id || crypto.randomUUID();
  const caller = c.get('user');
  const callerRoles: string[] = caller?.roles || [];
  const isAdmin = callerRoles.includes('Admin') || caller?.email?.toLowerCase() === 'admin@poliku.edu.my';
  const isCoordinator = callerRoles.includes('Coordinator');
  // Coordinators may only add locations to their own department
  if (!isAdmin && isCoordinator && loc.departmentId && loc.departmentId !== caller?.departmentId) {
    return c.json({ error: 'Coordinators can only add locations to their own department' }, 403);
  }
  // Validate department_id exists before inserting to give a clear error
  if (loc.departmentId) {
    const deptExists = await c.env.DB.prepare('SELECT id FROM departments WHERE id = ? LIMIT 1').bind(loc.departmentId).first();
    if (!deptExists) {
      return c.json({ error: `Department '${loc.departmentId}' does not exist` }, 422);
    }
  }
  try {
    await c.env.DB.prepare(
      `INSERT OR IGNORE INTO locations 
       (id, name, abbr, department_id, building_id, level, description, supervisor_id, contact, total_assets, uninspected_asset_count, is_active, status) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      id,
      loc.name,
      loc.abbr,
      loc.departmentId || null,
      loc.buildingId || null,
      loc.level || null,
      loc.description || null,
      loc.supervisorId || null,
      loc.contact || null,
      loc.totalAssets ?? 0,
      loc.uninspectedAssetCount ?? 0,
      loc.isActive !== undefined ? (loc.isActive ? 1 : 0) : 1,
      loc.status ?? 'Active'
    ).run();
    return c.json({ id, ...loc });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

db.patch('/locations/:id', rbacGuard('manage:locations'), async (c) => {
  const id = c.req.param('id');
  const updates = await c.req.json();
  const caller = c.get('user');
  const callerRoles: string[] = caller?.roles || [];
  const isAdmin = callerRoles.includes('Admin') || caller?.email?.toLowerCase() === 'admin@poliku.edu.my';
  const isCoordinator = callerRoles.includes('Coordinator');
  // Coordinators may only edit locations in their own department
  if (!isAdmin && isCoordinator) {
    const existing = await c.env.DB.prepare('SELECT department_id FROM locations WHERE id = ? LIMIT 1').bind(id).first<{ department_id: string }>();
    if (!existing) return c.json({ error: 'Location not found' }, 404);
    if (existing.department_id !== caller?.departmentId) {
      return c.json({ error: 'Coordinators can only edit locations in their own department' }, 403);
    }
    // Prevent re-assigning location to another department
    if (updates.departmentId && updates.departmentId !== caller?.departmentId) {
      return c.json({ error: 'Coordinators cannot re-assign a location to a different department' }, 403);
    }
  }
  const fields: string[] = [];
  const values: any[] = [];

  if (updates.name !== undefined) { fields.push('name = ?'); values.push(updates.name); }
  if (updates.abbr !== undefined) { fields.push('abbr = ?'); values.push(updates.abbr); }
  if (updates.departmentId !== undefined) { fields.push('department_id = ?'); values.push(updates.departmentId || null); }
  if (updates.buildingId !== undefined) { fields.push('building_id = ?'); values.push(updates.buildingId || null); }
  if (updates.level !== undefined) { fields.push('level = ?'); values.push(updates.level || null); }
  if (updates.description !== undefined) { fields.push('description = ?'); values.push(updates.description || null); }
  if (updates.supervisorId !== undefined) { fields.push('supervisor_id = ?'); values.push(updates.supervisorId || null); }
  if (updates.contact !== undefined) { fields.push('contact = ?'); values.push(updates.contact); }
  if (updates.totalAssets !== undefined) { fields.push('total_assets = ?'); values.push(updates.totalAssets); }
  if (updates.uninspectedAssetCount !== undefined) { fields.push('uninspected_asset_count = ?'); values.push(updates.uninspectedAssetCount); }
  if (updates.isActive !== undefined) { fields.push('is_active = ?'); values.push(updates.isActive ? 1 : 0); }
  if (updates.status !== undefined) {
    fields.push('status = ?'); values.push(updates.status);
    const caller = c.get('user');
    if (updates.status === 'Archived') {
      fields.push('archived_by = ?'); values.push(caller ? `${caller.name} (${caller.email})` : 'Unknown');
      fields.push('archived_at = ?'); values.push(new Date().toISOString());
    } else if (updates.status === 'Active') {
      fields.push('archived_by = ?'); values.push(null);
      fields.push('archived_at = ?'); values.push(null);
    }
  }

  if (fields.length === 0) return c.json({ success: true });

  try {
    await c.env.DB.prepare(`UPDATE locations SET ${fields.join(', ')} WHERE id = ?`).bind(...values, id).run();
    if (updates.supervisorId !== undefined) {
      await c.env.DB.prepare('UPDATE audit_schedules SET supervisor_id = ? WHERE location_id = ?').bind(updates.supervisorId || null, id).run();
    }
    return c.json({ success: true });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

db.delete('/locations/:id', rbacGuard('manage:locations'), async (c) => {
  const id = c.req.param('id');
  const caller = c.get('user');
  const callerRoles: string[] = caller?.roles || [];
  const isAdmin = callerRoles.includes('Admin') || caller?.email?.toLowerCase() === 'admin@poliku.edu.my';
  const isCoordinator = callerRoles.includes('Coordinator');
  // Coordinators may only archive locations in their own department
  if (!isAdmin && isCoordinator) {
    const existing = await c.env.DB.prepare('SELECT department_id FROM locations WHERE id = ? LIMIT 1').bind(id).first<{ department_id: string }>();
    if (!existing) return c.json({ error: 'Location not found' }, 404);
    if (existing.department_id !== caller?.departmentId) {
      return c.json({ error: 'Coordinators can only archive locations in their own department' }, 403);
    }
  }
  try {
    await c.env.DB.prepare(
      "UPDATE locations SET status = 'Archived', is_active = 0, archived_by = ?, archived_at = ? WHERE id = ?"
    ).bind(caller ? `${caller.name} (${caller.email})` : 'Unknown', new Date().toISOString(), id).run();
    return c.json({ success: true });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

db.delete('/locations/:id/purge', rbacGuard('manage:locations'), async (c) => {
  const id = c.req.param('id');
  try {
    const row = await c.env.DB.prepare("SELECT status FROM locations WHERE id = ? LIMIT 1").bind(id).first<{ status: string }>();
    if (!row) return c.json({ error: 'Not found' }, 404);
    if (row.status !== 'Archived') return c.json({ error: 'Location must be archived before purging' }, 400);
    await c.env.DB.prepare('DELETE FROM audit_schedules WHERE location_id = ?').bind(id).run();
    await c.env.DB.prepare('DELETE FROM locations WHERE id = ?').bind(id).run();
    return c.json({ success: true });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

db.post('/locations/merge', rbacGuard('manage:locations'), async (c) => {
  const { sourceIds, targetId } = await c.req.json() as { sourceIds: string[], targetId: string };
  if (!sourceIds || sourceIds.length === 0 || !targetId) {
    return c.json({ error: 'Source IDs and Target ID required' }, 400);
  }

  try {
    // 1. Get totals and names from sources and target
    const allIds = [...sourceIds, targetId];
    const placeholders = allIds.map(() => '?').join(',');
    const { results } = await c.env.DB.prepare(
      `SELECT id, name, description, total_assets, uninspected_asset_count FROM locations WHERE id IN (${placeholders})`
    ).bind(...allIds).all();

    const locs = results as { id: string, name: string, description: string | null, total_assets: number, uninspected_asset_count: number }[];
    const target = locs.find(l => l.id === targetId);
    const sources = locs.filter(l => sourceIds.includes(l.id));

    if (!target) return c.json({ error: 'Target location not found' }, 404);

    const newTotalAssets = target.total_assets + sources.reduce((sum, s) => sum + (s.total_assets || 0), 0);
    const newUninspected = target.uninspected_asset_count + sources.reduce((sum, s) => sum + (s.uninspected_asset_count || 0), 0);

    // Build Merged Note
    const sourceNames = sources.map(s => s.name).join(', ');
    const timestamp = new Date().toLocaleDateString('en-GB'); // DD/MM/YYYY
    const mergeNote = `Merged from: ${sourceNames} (${timestamp})`;
    let newDescription = target.description || '';
    if (newDescription && !newDescription.endsWith('\n')) newDescription += '\n';
    newDescription += mergeNote;

    const statements: any[] = [];

    // 2. Update Target
    statements.push(c.env.DB.prepare(
      'UPDATE locations SET total_assets = ?, uninspected_asset_count = ?, description = ? WHERE id = ?'
    ).bind(newTotalAssets, newUninspected, newDescription, targetId));

    // 3. Re-link Schedules
    const sourcePlaceholders = sourceIds.map(() => '?').join(',');
    statements.push(c.env.DB.prepare(
      `UPDATE audit_schedules SET location_id = ? WHERE location_id IN (${sourcePlaceholders})`
    ).bind(targetId, ...sourceIds));

    // 4. Update Mappings (so old sources now map to target)
    statements.push(c.env.DB.prepare(
      `UPDATE location_mappings SET target_location_id = ? WHERE target_location_id IN (${sourcePlaceholders})`
    ).bind(targetId, ...sourceIds));

    // 5. Delete Sources
    statements.push(c.env.DB.prepare(
      `DELETE FROM locations WHERE id IN (${sourcePlaceholders})`
    ).bind(...sourceIds));

    await c.env.DB.batch(statements);

    return c.json({ 
      success: true, 
      targetId, 
      mergedCount: sources.length,
      newTotalAssets,
      newUninspected,
      newDescription
    });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

db.delete('/locations/:id/force', rbacGuard('admin:hub'), async (c) => {
  const id = c.req.param('id');
  try {
    await c.env.DB.prepare('DELETE FROM locations WHERE id = ?').bind(id).run();
    return c.json({ success: true });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// ─── RESET LOCATIONS ─────────────────────────────────────────────────────────
// Deletes ALL locations and consolidation groups. Keeps departments.
db.post('/locations/clear', rbacGuard('admin:hub'), async (c) => {
  try {
    const deletes = [
      { id: 'schedules', sql: 'DELETE FROM audit_schedules' },
      { id: 'perms',     sql: 'DELETE FROM cross_audit_permissions' }, // Must clear perms before groups
      { id: 'groups',    sql: 'DELETE FROM audit_groups' },
      { id: 'locations', sql: 'DELETE FROM locations' },
    ];

    for (const d of deletes) {
      await c.env.DB.prepare(d.sql).run();
    }

    // Reset department totals since they derive from locations
    await c.env.DB.prepare('UPDATE departments SET total_assets = 0, uninspected_asset_count = 0').run();

    return c.json({ success: true, message: 'Locations and groups cleared. Departments maintained.' });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

db.post('/locations/bulk', rbacGuard('manage:locations'), async (c) => {
  const locs = await c.req.json();
  try {
    // 1. Fetch existing departments for validation
    const { results: deptRows } = await c.env.DB.prepare('SELECT id FROM departments').all();
    const validDeptIds = new Set((deptRows || []).map((d: any) => d.id));

    // 2. Fetch existing locations for deduplication (Key: name|dept|bldg)
    const { results: existingLocRows } = await c.env.DB.prepare('SELECT name, department_id, building_id FROM locations').all();
    const existingLocKeys = new Set((existingLocRows || []).map((l: any) => 
      `${(l.name || '').toUpperCase().trim()}|${l.department_id || ''}|${l.building_id || ''}`
    ));

    // 3. Filter valid AND unique locations
    const processedLocs = (locs as any[]).filter(loc => {
      const deptId = loc.departmentId || '';
      if (!deptId || !validDeptIds.has(deptId)) return false;

      const key = `${(loc.name || '').toUpperCase().trim()}|${loc.departmentId || ''}|${loc.buildingId || ''}`;
      return !existingLocKeys.has(key);
    });

    const skipped = locs.length - processedLocs.length;

    if (processedLocs.length === 0) {
      return c.json({ success: true, count: 0, skipped, status: 'No new unique locations to add' });
    }

    // 4. Batch Insert
    const statements = processedLocs.map((loc: any) => {
      const id = loc.id || crypto.randomUUID();
      return c.env.DB.prepare(
        `INSERT OR IGNORE INTO locations 
         (id, name, abbr, department_id, building_id, level, description, supervisor_id, contact, total_assets, uninspected_asset_count, is_active, status) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        id,
        loc.name,
        loc.abbr,
        loc.departmentId || null,
        loc.buildingId || null,
        loc.level || null,
        loc.description || null,
        loc.supervisorId || null,
        loc.contact || null,
        loc.totalAssets ?? 0,
        loc.uninspectedAssetCount ?? 0,
        loc.isActive !== undefined ? (loc.isActive ? 1 : 0) : 1,
        loc.status ?? 'Active'
      );
    });

    await c.env.DB.batch(statements);
    return c.json({ success: true, count: processedLocs.length, skipped });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

db.post('/locations/sync-notes', rbacGuard('manage:locations'), async (c) => {
  try {
    // Prepend "Original: [name]" to description if not already starting with "Original:"
    // CHAR(10) is newline in SQLite
    const result = await c.env.DB.prepare(`
      UPDATE locations 
      SET description = CASE 
        WHEN description IS NULL OR description = '' THEN 'Original: ' || name
        ELSE 'Original: ' || name || CHAR(10) || description
      END
      WHERE description IS NULL OR description NOT LIKE 'Original: %'
    `).run();
    
    return c.json({ success: true, meta: result.meta });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

db.post('/locations/upsert', rbacGuard('manage:locations'), async (c) => {
  const locs = await c.req.json();
  try {
    const statements = locs.map((l: any) => {
      const id = l.id || crypto.randomUUID();
      return c.env.DB.prepare(`
        INSERT INTO locations 
        (id, name, abbr, department_id, building_id, level, description, supervisor_id, contact, total_assets, uninspected_asset_count, is_active, status) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(name, department_id) DO UPDATE SET
          total_assets = EXCLUDED.total_assets,
          uninspected_asset_count = COALESCE(EXCLUDED.uninspected_asset_count, uninspected_asset_count),
          building_id = COALESCE(EXCLUDED.building_id, building_id),
          level = COALESCE(EXCLUDED.level, level),
          supervisor_id = COALESCE(EXCLUDED.supervisor_id, supervisor_id)
      `).bind(
        id,
        l.name,
        l.abbr || '',
        l.departmentId || null,
        l.buildingId || null,
        l.level || null,
        l.description || null,
        l.supervisorId || null,
        l.contact || null,
        l.totalAssets ?? 0,
        l.uninspectedAssetCount ?? 0,
        l.isActive !== undefined ? (l.isActive ? 1 : 0) : 1,
        l.status ?? 'Active'
      );
    });

    // D1 batch limit is 100 statements
    const CHUNK = 50;
    for (let i = 0; i < statements.length; i += CHUNK) {
      await c.env.DB.batch(statements.slice(i, i + CHUNK));
    }
    
    return c.json({ success: true, count: locs.length });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

db.post('/locations/sync', rbacGuard('manage:locations'), async (c) => {
  try {
    // 1. Fetch current mappings
    const { results: mappings } = await c.env.DB.prepare('SELECT source_name, target_department_id FROM department_mappings').all();
    if (!mappings || mappings.length === 0) return c.json({ success: true, count: 0 });

    const statements: any[] = [];
    
    for (const m of (mappings || []) as any[]) {
      // Logic A: Find locations whose department name/abbr matches the source_name and move them to target_department_id.
      // This handles active departments that are being merged/consolidated.
      statements.push(c.env.DB.prepare(`
        UPDATE locations 
        SET department_id = ? 
        WHERE department_id IN (
          SELECT id FROM departments 
          WHERE UPPER(name) = UPPER(?) OR UPPER(name) = UPPER(?) OR UPPER(abbr) = UPPER(?) OR UPPER(abbr) = UPPER(?)
        )
      `).bind(m.target_department_id, m.source_name, m.source_name.trim(), m.source_name, m.source_name.trim()));
      
      // Logic B: Handle locations where the name/abbr itself matches the source_name
      // and they are currently assigned to "Software Development", have no department,
      // or belong to a department that has been deleted (orphans).
      statements.push(c.env.DB.prepare(`
        UPDATE locations 
        SET department_id = ? 
        WHERE (UPPER(name) = UPPER(?) OR UPPER(abbr) = UPPER(?))
        AND (
          department_id IS NULL 
          OR department_id NOT IN (SELECT id FROM departments)
          OR department_id IN (SELECT id FROM departments WHERE name = 'Software Development')
        )
      `).bind(m.target_department_id, m.source_name, m.source_name));
    }

    if (statements.length > 0) {
      const CHUNK = 100;
      for (let i = 0; i < statements.length; i += CHUNK) {
        await c.env.DB.batch(statements.slice(i, i + CHUNK));
      }
    }

    return c.json({ success: true, rulesApplied: mappings.length });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// Department Mappings
db.get('/department-mappings', async (c) => {
  try {
    const { results } = await c.env.DB.prepare('SELECT * FROM department_mappings').all();
    return c.json((results || []).map((m: any) => ({
      ...m,
      sourceName: m.source_name,
      targetDepartmentId: m.target_department_id
    })));
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

db.post('/department-mappings', rbacGuard('manage:departments'), async (c) => {
  const mapping = await c.req.json();
  const id = mapping.id || crypto.randomUUID();
  try {
    await c.env.DB.prepare(
      'INSERT INTO department_mappings (id, source_name, target_department_id) VALUES (?, ?, ?) ON CONFLICT(source_name) DO UPDATE SET target_department_id=EXCLUDED.target_department_id'
    ).bind(id, mapping.sourceName, mapping.targetDepartmentId).run();
    return c.json({ id, ...mapping });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

db.post('/department-mappings/clear', rbacGuard('manage:departments'), async (c) => {
  try {
    await c.env.DB.prepare('DELETE FROM department_mappings').run();
    return c.json({ success: true });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

db.delete('/department-mappings/:id', rbacGuard('manage:departments'), async (c) => {
  const id = c.req.param('id');
  try {
    await c.env.DB.prepare('DELETE FROM department_mappings WHERE id = ?').bind(id).run();
    return c.json({ success: true });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// Location Mappings
db.get('/location-mappings', async (c) => {
  try {
    const { results } = await c.env.DB.prepare('SELECT * FROM location_mappings').all();
    return c.json((results || []).map((m: any) => ({
      ...m,
      sourceName: m.source_name,
      targetLocationId: m.target_location_id,
      createdAt: m.created_at
    })));
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

db.post('/location-mappings', rbacGuard('manage:locations'), async (c) => {
  const mapping = await c.req.json();
  const id = mapping.id || crypto.randomUUID();
  try {
    await c.env.DB.prepare(
      'INSERT INTO location_mappings (id, source_name, target_location_id) VALUES (?, ?, ?) ON CONFLICT(source_name) DO UPDATE SET target_location_id=EXCLUDED.target_location_id'
    ).bind(id, mapping.sourceName, mapping.targetLocationId).run();
    return c.json({ id, ...mapping });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

db.delete('/location-mappings/:id', rbacGuard('manage:locations'), async (c) => {
  const id = c.req.param('id');
  try {
    await c.env.DB.prepare('DELETE FROM location_mappings WHERE id = ?').bind(id).run();
    return c.json({ success: true });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// Permissions
db.get('/permissions', async (c) => {
  try {
    const { results } = await c.env.DB.prepare('SELECT * FROM cross_audit_permissions').all();
    return c.json((results || []).map((p: any) => ({
      id: p.id,
      auditorDeptId: p.auditor_dept_id,
      targetDeptId: p.target_dept_id,
      auditorGroupId: p.auditor_group_id,
      targetGroupId: p.target_group_id,
      isActive: p.is_active === 1,
      isMutual: p.is_mutual === 1
    })));
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

db.post('/permissions', async (c) => {
  const perm = await c.req.json();
  const id = perm.id || crypto.randomUUID();
  try {
    await c.env.DB.prepare(
      'INSERT INTO cross_audit_permissions (id, auditor_dept_id, target_dept_id, auditor_group_id, target_group_id, is_active, is_mutual) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).bind(id, perm.auditorDeptId ?? null, perm.targetDeptId ?? null, perm.auditorGroupId ?? null, perm.targetGroupId ?? null, perm.isActive ? 1 : 0, perm.isMutual ? 1 : 0).run();
    return c.json({ id, ...perm });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

db.post('/permissions/bulk', async (c) => {
  const perms = await c.req.json();
  try {
    const statements = perms.map((p: any) => {
      const id = p.id || crypto.randomUUID();
      return c.env.DB.prepare(
        'INSERT INTO cross_audit_permissions (id, auditor_dept_id, target_dept_id, auditor_group_id, target_group_id, is_active, is_mutual) VALUES (?, ?, ?, ?, ?, ?, ?)'
      ).bind(id, p.auditorDeptId ?? null, p.targetDeptId ?? null, p.auditorGroupId ?? null, p.targetGroupId ?? null, p.isActive ? 1 : 0, p.isMutual ? 1 : 0);
    });
    await c.env.DB.batch(statements);
    return c.json({ success: true, count: perms.length });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

db.delete('/permissions/:id', async (c) => {
  const id = c.req.param('id');
  try {
    await c.env.DB.prepare('DELETE FROM cross_audit_permissions WHERE id = ?').bind(id).run();
    return c.json({ success: true });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

db.delete('/permissions/bulk', async (c) => {
  const { ids } = await c.req.json();
  try {
    const placeholders = ids.map(() => '?').join(',');
    await c.env.DB.prepare(`DELETE FROM cross_audit_permissions WHERE id IN (${placeholders})`).bind(...ids).run();
    return c.json({ success: true });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

db.post('/permissions/reset-only', async (c) => {
  try {
    await c.env.DB.prepare('DELETE FROM cross_audit_permissions').run();
    return c.json({ success: true, message: 'All cross-audit assignments cleared' });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

db.post('/permissions/clear', rbacGuard('system:settings'), async (c) => {
  try {
    // SYNCHRONIZED RESET: Clear pairings AND groups/links (User Requirement)
    await c.env.DB.batch([
      c.env.DB.prepare('DELETE FROM cross_audit_permissions'),
      c.env.DB.prepare('UPDATE departments SET audit_group_id = NULL'),
      c.env.DB.prepare('DELETE FROM audit_groups')
    ]);
    return c.json({ success: true, message: 'All cross-audit assignments and audit groups cleared' });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

db.patch('/permissions/:id', async (c) => {
  const id = c.req.param('id');
  const updates = await c.req.json();
  const fields: string[] = [];
  const values: any[] = [];
  if (updates.auditorDeptId !== undefined) { fields.push('auditor_dept_id = ?'); values.push(updates.auditorDeptId); }
  if (updates.targetDeptId !== undefined) { fields.push('target_dept_id = ?'); values.push(updates.targetDeptId); }
  if (updates.auditorGroupId !== undefined) { fields.push('auditor_group_id = ?'); values.push(updates.auditorGroupId); }
  if (updates.targetGroupId !== undefined) { fields.push('target_group_id = ?'); values.push(updates.targetGroupId); }
  if (updates.isActive !== undefined) { fields.push('is_active = ?'); values.push(updates.isActive ? 1 : 0); }
  if (updates.isMutual !== undefined) { fields.push('is_mutual = ?'); values.push(updates.isMutual ? 1 : 0); }
  if (fields.length === 0) return c.json({ success: true });
  try {
    await c.env.DB.prepare(`UPDATE cross_audit_permissions SET ${fields.join(', ')} WHERE id = ?`).bind(...values, id).run();
    return c.json({ success: true });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// Audit Phases
db.get('/audit-phases', async (c) => {
  try {
    const { results } = await c.env.DB.prepare('SELECT * FROM audit_phases').all();
    return c.json((results || []).map((p: any) => ({
      ...p,
      startDate: p.start_date,
      endDate: p.end_date
    })));
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

db.post('/audit-phases', rbacGuard('admin:hub'), async (c) => {
  const phase = await c.req.json();
  const id = phase.id || crypto.randomUUID();
  try {
    await c.env.DB.prepare(
      'INSERT INTO audit_phases (id, name, start_date, end_date, description, status) VALUES (?, ?, ?, ?, ?, ?)'
    ).bind(id, phase.name, phase.startDate, phase.endDate, phase.description ?? null, phase.status ?? 'Active').run();
    return c.json({ id, ...phase });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

db.patch('/audit-phases/:id', rbacGuard('admin:hub'), async (c) => {
  const id = c.req.param('id');
  const updates = await c.req.json();
  const fields = [];
  const values = [];
  if (updates.name !== undefined) { fields.push('name = ?'); values.push(updates.name); }
  if (updates.startDate !== undefined) { fields.push('start_date = ?'); values.push(updates.startDate); }
  if (updates.endDate !== undefined) { fields.push('end_date = ?'); values.push(updates.endDate); }
  if (updates.description !== undefined) { fields.push('description = ?'); values.push(updates.description); }
  if (updates.status !== undefined) { fields.push('status = ?'); values.push(updates.status); }
  if (fields.length === 0) return c.json({ success: true });
  try {
    await c.env.DB.prepare(`UPDATE audit_phases SET ${fields.join(', ')} WHERE id = ?`).bind(...values, id).run();
    return c.json({ success: true });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

db.delete('/audit-phases/:id', rbacGuard('admin:hub'), async (c) => {
  const id = c.req.param('id');
  try {
    await c.env.DB.prepare('DELETE FROM audit_phases WHERE id = ?').bind(id).run();
    return c.json({ success: true });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// KPI Tiers
db.get('/kpi-tiers', async (c) => {
  try {
    const { results } = await c.env.DB.prepare('SELECT * FROM kpi_tiers').all();
    return c.json((results || []).map((t: any) => ({
      ...t,
      minAssets: t.min_assets
    })));
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

db.post('/kpi-tiers', rbacGuard('admin:hub'), async (c) => {
  const tier = await c.req.json();
  const id = tier.id || crypto.randomUUID();
  try {
    await c.env.DB.prepare(
      'INSERT INTO kpi_tiers (id, name, min_assets, description) VALUES (?, ?, ?, ?)'
    ).bind(id, tier.name, tier.minAssets ?? 0, tier.description ?? null).run();
    return c.json({ id, ...tier });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

db.patch('/kpi-tiers/:id', rbacGuard('admin:hub'), async (c) => {
  const id = c.req.param('id');
  const updates = await c.req.json();
  const fields = [];
  const values = [];
  if (updates.name !== undefined) { fields.push('name = ?'); values.push(updates.name); }
  if (updates.minAssets !== undefined) { fields.push('min_assets = ?'); values.push(updates.minAssets); }
  if (updates.description !== undefined) { fields.push('description = ?'); values.push(updates.description); }
  if (fields.length === 0) return c.json({ success: true });
  try {
    await c.env.DB.prepare(`UPDATE kpi_tiers SET ${fields.join(', ')} WHERE id = ?`).bind(...values, id).run();
    return c.json({ success: true });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

db.delete('/kpi-tiers/:id', rbacGuard('admin:hub'), async (c) => {
  const id = c.req.param('id');
  try {
    await c.env.DB.prepare('DELETE FROM kpi_tiers WHERE id = ?').bind(id).run();
    return c.json({ success: true });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// KPI Tier Targets
db.get('/kpi-tier-targets', async (c) => {
  try {
    const { results } = await c.env.DB.prepare('SELECT * FROM kpi_tier_targets').all();
    return c.json((results || []).map((t: any) => ({
      id: t.id,
      tierId: t.tier_id,
      phaseId: t.phase_id,
      targetPercentage: t.target_percentage
    })));
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

db.post('/kpi-tier-targets', rbacGuard('admin:hub'), async (c) => {
  const target = await c.req.json();
  const id = target.id || crypto.randomUUID();
  try {
    await c.env.DB.prepare(
      'INSERT INTO kpi_tier_targets (id, tier_id, phase_id, target_percentage) VALUES (?, ?, ?, ?) ON CONFLICT(tier_id, phase_id) DO UPDATE SET target_percentage=excluded.target_percentage'
    ).bind(id, target.tierId, target.phaseId, target.targetPercentage).run();
    return c.json({ id, ...target });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

db.delete('/kpi-tier-targets/:id', rbacGuard('admin:hub'), async (c) => {
  const id = c.req.param('id');
  try {
    await c.env.DB.prepare('DELETE FROM kpi_tier_targets WHERE id = ?').bind(id).run();
    return c.json({ success: true });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// Audit Groups
db.get('/audit-groups', async (c) => {
  try {
    const { results } = await c.env.DB.prepare('SELECT * FROM audit_groups').all();
    return c.json(results);
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

db.post('/audit-groups', rbacGuard('edit:team'), async (c) => {
  const group = await c.req.json();
  const id = group.id || crypto.randomUUID();
  try {
    await c.env.DB.prepare('INSERT INTO audit_groups (id, name, description) VALUES (?, ?, ?)').bind(id, group.name, group.description ?? null).run();
    return c.json({ id, ...group });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

db.patch('/audit-groups/:id', rbacGuard('edit:team'), async (c) => {
  const id = c.req.param('id');
  const updates = await c.req.json();
  const fields = [];
  const values = [];
  if (updates.name !== undefined) { fields.push('name = ?'); values.push(updates.name); }
  if (updates.description !== undefined) { fields.push('description = ?'); values.push(updates.description); }
  if (fields.length === 0) return c.json({ success: true });
  try {
    await c.env.DB.prepare(`UPDATE audit_groups SET ${fields.join(', ')} WHERE id = ?`).bind(...values, id).run();
    return c.json({ success: true });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

db.delete('/audit-groups/:id', rbacGuard('admin:hub'), async (c) => {
  const id = c.req.param('id');
  try {
    // We must handle foreign key dependencies manually or ensure they are cleared.
    // 1. Delete associated cross_audit_permissions (auditor or target)
    // 2. Nullify audit_group_id mapping in departments
    // 3. Delete the group record
    await c.env.DB.batch([
      c.env.DB.prepare('DELETE FROM cross_audit_permissions WHERE auditor_group_id = ? OR target_group_id = ?').bind(id, id),
      c.env.DB.prepare('UPDATE departments SET audit_group_id = NULL WHERE audit_group_id = ?').bind(id),
      c.env.DB.prepare('DELETE FROM audit_groups WHERE id = ?').bind(id)
    ]);
    return c.json({ success: true });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// Institution KPI Targets
db.get('/institution-kpi-targets', async (c) => {
  try {
    const { results } = await c.env.DB.prepare('SELECT * FROM institution_kpi_targets').all();
    return c.json((results || []).map((k: any) => ({
      ...k,
      phaseId: k.phase_id,
      targetPercentage: k.target_percentage,
    })));
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

db.post('/institution-kpi-targets', rbacGuard('admin:hub'), async (c) => {
  const target = await c.req.json();
  try {
    await c.env.DB.prepare(
      'INSERT INTO institution_kpi_targets (phase_id, target_percentage) VALUES (?, ?) ON CONFLICT(phase_id) DO UPDATE SET target_percentage=EXCLUDED.target_percentage'
    ).bind(target.phaseId, target.targetPercentage).run();
    return c.json({ success: true });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// ─── Buildings — KV read-through cache ──────────────────────────────────────
// Buildings change very rarely. We cache the full list in KV (1h) and
// invalidate immediately on any write so readers always get fresh data.
const KV_BUILDINGS = 'buildings';
const KV_BUILDINGS_TTL = 3600; // 1 hour

async function buildingsFromKVorD1(c: any) {
  try {
    const cached = await c.env.SETTINGS.get(KV_BUILDINGS, { cacheTtl: 60 });
    if (cached) return JSON.parse(cached);
  } catch { /* KV unavailable */ }

  const { results } = await c.env.DB.prepare(
    'SELECT id, name, abbr, description, type, created_at FROM buildings ORDER BY name',
  ).all();
  const mapped = (results || []).map((b: any) => ({ 
    ...b, 
    type: b.type,
    createdAt: b.created_at 
  }));

  try {
    await c.env.SETTINGS.put(KV_BUILDINGS, JSON.stringify(mapped), {
      expirationTtl: KV_BUILDINGS_TTL,
    });
  } catch { /* KV write failure is non-fatal */ }

  return mapped;
}
// ─────────────────────────────────────────────────────────────────────────────

db.get('/buildings', async (c) => {
  try {
    return c.json(await buildingsFromKVorD1(c));
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

db.post('/buildings', rbacGuard('edit:team'), zValidator('json', z.object({
  id:          z.string().optional(),
  name:        z.string().min(1),
  abbr:        z.string().min(1),
  description: z.string().nullable().optional(),
  type:        z.string().nullable().optional(),
})), async (c) => {
  const building = c.req.valid('json');
  const id = building.id || crypto.randomUUID();
  try {
    await c.env.DB.prepare(
      'INSERT INTO buildings (id, name, abbr, description, type) VALUES (?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name, abbr=EXCLUDED.abbr, description=EXCLUDED.description, type=EXCLUDED.type',
    ).bind(id, building.name, building.abbr, building.description ?? null, building.type ?? null).run();

    // Invalidate KV cache so next read fetches from D1
    await c.env.SETTINGS.delete(KV_BUILDINGS).catch(() => {});

    const b = await c.env.DB.prepare('SELECT * FROM buildings WHERE id = ?').bind(id).first<any>();
    return c.json({ ...b, createdAt: b?.created_at });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

db.patch('/buildings/:id', rbacGuard('edit:team'), zValidator('json', z.object({
  name:        z.string().min(1).optional(),
  abbr:        z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  type:        z.string().nullable().optional(),
})), async (c) => {
  const id      = c.req.param('id');
  const updates = c.req.valid('json');
  const fields: string[] = [];
  const values: any[]   = [];
  if (updates.name        !== undefined) { fields.push('name = ?');        values.push(updates.name); }
  if (updates.abbr        !== undefined) { fields.push('abbr = ?');        values.push(updates.abbr); }
  if (updates.description !== undefined) { fields.push('description = ?'); values.push(updates.description); }
  if (updates.type        !== undefined) { fields.push('type = ?');        values.push(updates.type); }
  if (fields.length === 0) return c.json({ success: true });
  try {
    await c.env.DB.prepare(`UPDATE buildings SET ${fields.join(', ')} WHERE id = ?`)
      .bind(...values, id).run();
    await c.env.SETTINGS.delete(KV_BUILDINGS).catch(() => {});
    const updated = await c.env.DB.prepare('SELECT * FROM buildings WHERE id = ?').bind(id).first<any>();
    return c.json({ 
      ...updated, 
      type: updated?.type,
      createdAt: updated?.created_at 
    });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

db.delete('/buildings/:id', rbacGuard('admin:hub'), async (c) => {
  const id = c.req.param('id');
  try {
    await c.env.DB.prepare('DELETE FROM buildings WHERE id = ?').bind(id).run();
    await c.env.SETTINGS.delete(KV_BUILDINGS).catch(() => {});
    return c.json({ success: true });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

db.post('/buildings/bulk', rbacGuard('admin:hub'), zValidator('json', z.array(z.object({
  name:        z.string().min(1),
  abbr:        z.string().min(1),
  description: z.string().nullable().optional(),
}))), async (c) => {
  const buildings = c.req.valid('json');
  try {
    // 1. Fetch existing abbreviations for deduplication
    const { results: existingRows } = await c.env.DB.prepare('SELECT abbr FROM buildings').all();
    const existingAbbrs = new Set((existingRows || []).map((r: any) => r.abbr.toUpperCase().trim()));

    // 2. Filter out items that already exist
    const newBuildings = buildings.filter(b => !existingAbbrs.has(b.abbr.toUpperCase().trim()));
    const skipped = buildings.length - newBuildings.length;

    if (newBuildings.length === 0) {
      return c.json({ success: true, count: 0, skipped, status: 'No new buildings to add' });
    }

    const statements = newBuildings.map(b => {
      const id = crypto.randomUUID();
      return c.env.DB.prepare(
        'INSERT OR IGNORE INTO buildings (id, name, abbr, description) VALUES (?, ?, ?, ?)'
      ).bind(id, b.name, b.abbr, b.description ?? null);
    });

    await c.env.DB.batch(statements);
    await c.env.SETTINGS.delete(KV_BUILDINGS).catch(() => {});
    return c.json({ success: true, count: newBuildings.length, skipped });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// System Settings (SQL version for persistence if KV is for volatile)
db.get('/system-settings', async (c) => {
  try {
    const { results } = await c.env.DB.prepare('SELECT * FROM system_settings').all();
    return c.json((results || []).map((s: any) => ({
      id: s.id,
      value: (() => { try { return JSON.parse(s.value); } catch { return s.value; } })(),
      updatedAt: s.updated_at
    })));
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

db.post('/system-settings/:id', rbacGuard('system:settings'), async (c) => {
  const id = c.req.param('id');
  const { value } = await c.req.json();
  try {
    await c.env.DB.prepare(
      'INSERT INTO system_settings (id, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET value=EXCLUDED.value, updated_at=EXCLUDED.updated_at'
    ).bind(id, JSON.stringify(value), new Date().toISOString()).run();

    // Also sync to KV for public API performance
    await c.env.SETTINGS.put(id, JSON.stringify(value));

    return c.json({ success: true });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// System Activity
db.get('/activity', async (c) => {
  try {
    const { results } = await c.env.DB.prepare('SELECT * FROM system_activities ORDER BY timestamp DESC LIMIT 100').all();
    return c.json((results || []).map((a: any) => ({
      ...a,
      userId: a.user_id,
      metadata: a.metadata ? JSON.parse(a.metadata) : {}
    })));
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

db.post('/activity', async (c) => {
  const activity = await c.req.json();
  const id = crypto.randomUUID();
  try {
    await c.env.DB.prepare(
      'INSERT INTO system_activities (id, type, user_id, message, metadata) VALUES (?, ?, ?, ?, ?)'
    ).bind(
      id,
      activity.type || activity.action, // Support both naming variants if any
      activity.userId,
      activity.message || '',
      JSON.stringify(activity.metadata || {})
    ).run();
    return c.json({ id, ...activity });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// ─── INITIALIZE DEFAULTS ─────────────────────────────────────────────────────
// Idempotently creates the 3 default audit phases, 3 KPI tiers, 9 tier×phase
// targets, and 3 institution KPI targets in a single D1 batch.
// Called once after login (admin) or after a full reset. Uses INSERT OR IGNORE
// so it is safe to call repeatedly and will never duplicate rows.
db.post('/system/initialize-defaults', rbacGuard('admin:hub'), async (c) => {
  try {
    // 0. Schema migrations (idempotent — safe to call repeatedly)
    await c.env.DB.prepare('ALTER TABLE departments ADD COLUMN is_archived INTEGER DEFAULT 0').run().catch(() => {});

    // 1. Read what already exists
    const [existingPhases, existingTiers] = await Promise.all([
      c.env.DB.prepare('SELECT id, name FROM audit_phases').all(),
      c.env.DB.prepare('SELECT id, name FROM kpi_tiers').all(),
    ]);
    const phaseNames = new Set((existingPhases.results || []).map((p: any) => p.name));
    const tierNames = new Set((existingTiers.results || []).map((t: any) => t.name));

    const statements: any[] = [];

    // 2. Create missing phases
    const today = new Date();
    const phaseDefaults = [
      { name: 'Phase 1', offset: 0 },
      { name: 'Phase 2', offset: 30 },
      { name: 'Phase 3', offset: 60 },
    ];
    const newPhaseIds: { name: string; id: string }[] = [];
    for (const pd of phaseDefaults) {
      if (!phaseNames.has(pd.name)) {
        const id = crypto.randomUUID();
        const start = new Date(today);
        start.setDate(today.getDate() + pd.offset);
        const end = new Date(start);
        end.setDate(start.getDate() + 30);
        statements.push(
          c.env.DB.prepare(
            'INSERT OR IGNORE INTO audit_phases (id, name, start_date, end_date, status) VALUES (?, ?, ?, ?, ?)'
          ).bind(id, pd.name, start.toISOString().split('T')[0], end.toISOString().split('T')[0], 'Active')
        );
        newPhaseIds.push({ name: pd.name, id });
      }
    }

    // 3. Rename legacy tier names (Tier 1→Small, etc.)
    const legacyMap: Record<string, string> = { 'Tier 1': 'Small', 'Tier 2': 'Medium', 'Tier 3': 'Large' };
    for (const t of (existingTiers.results || []) as any[]) {
      if (legacyMap[t.name]) {
        statements.push(
          c.env.DB.prepare('UPDATE kpi_tiers SET name = ? WHERE id = ?').bind(legacyMap[t.name], t.id)
        );
        tierNames.delete(t.name);
        tierNames.add(legacyMap[t.name]);
      }
    }

    // 4. Deduplicate tiers — keep first occurrence of each name, delete extras
    const seenTierIds = new Map<string, string>();
    for (const t of (existingTiers.results || []) as any[]) {
      const canonName = legacyMap[t.name] || t.name;
      if (seenTierIds.has(canonName)) {
        statements.push(c.env.DB.prepare('DELETE FROM kpi_tier_targets WHERE tier_id = ?').bind(t.id));
        statements.push(c.env.DB.prepare('DELETE FROM kpi_tiers WHERE id = ?').bind(t.id));
      } else {
        seenTierIds.set(canonName, t.id);
      }
    }

    // 5. Create missing tiers
    const tierDefaults = [
      { name: 'Small',  min: 0  },
      { name: 'Medium', min: 30 },
      { name: 'Large',  min: 70 },
    ];
    const newTierIds: { name: string; id: string }[] = [];
    for (const td of tierDefaults) {
      if (!seenTierIds.has(td.name)) {
        const id = crypto.randomUUID();
        statements.push(
          c.env.DB.prepare(
            'INSERT OR IGNORE INTO kpi_tiers (id, name, min_assets, description) VALUES (?, ?, ?, ?)'
          ).bind(id, td.name, td.min, null)
        );
        newTierIds.push({ name: td.name, id });
      }
    }

    // Execute phase + tier creation first so IDs exist for targets
    if (statements.length > 0) await c.env.DB.batch(statements);

    // 6. Re-read all phases and tiers (now including newly created ones)
    const [allPhases, allTiers] = await Promise.all([
      c.env.DB.prepare('SELECT id, name FROM audit_phases').all(),
      c.env.DB.prepare('SELECT id, name FROM kpi_tiers').all(),
    ]);

    // 7. Ensure tier×phase targets and institution KPI targets exist
    const targetStmts: any[] = [];
    for (const tier of (allTiers.results || []) as any[]) {
      for (const phase of (allPhases.results || []) as any[]) {
        targetStmts.push(
          c.env.DB.prepare(
            'INSERT OR IGNORE INTO kpi_tier_targets (id, tier_id, phase_id, target_percentage) VALUES (?, ?, ?, ?)'
          ).bind(crypto.randomUUID(), tier.id, phase.id, 100)
        );
      }
    }
    for (const phase of (allPhases.results || []) as any[]) {
      targetStmts.push(
        c.env.DB.prepare(
          'INSERT INTO institution_kpi_targets (phase_id, target_percentage) VALUES (?, ?) ON CONFLICT(phase_id) DO NOTHING'
        ).bind(phase.id, 100)
      );
    }
    if (targetStmts.length > 0) await c.env.DB.batch(targetStmts);

    // 8. Migrate percentage-based minAssets if any tier has minAssets > 100
    const freshTiers = (allTiers.results || []) as any[];
    const needsMigration = freshTiers.some((t: any) => t.min_assets > 100);
    if (needsMigration) {
      const sorted = [...freshTiers].sort((a: any, b: any) => a.min_assets - b.min_assets);
      if (sorted.length >= 3) {
        await c.env.DB.batch([
          c.env.DB.prepare('UPDATE kpi_tiers SET min_assets = ? WHERE id = ?').bind(0, sorted[0].id),
          c.env.DB.prepare('UPDATE kpi_tiers SET min_assets = ? WHERE id = ?').bind(30, sorted[1].id),
          c.env.DB.prepare('UPDATE kpi_tiers SET min_assets = ? WHERE id = ?').bind(70, sorted[2].id),
        ]);
      }
    }

    // 9. Bootstrap Software Development department (Superadmin only)
    const softDev = await c.env.DB.prepare("SELECT id FROM departments WHERE name = ?").bind('Software Development').first<{id: string}>();
    let softDevId = softDev?.id;

    if (!softDevId) {
      softDevId = crypto.randomUUID();
      await c.env.DB.prepare(
        "INSERT INTO departments (id, name, abbr, description, is_exempted) VALUES (?, ?, ?, ?, ?)"
      ).bind(softDevId, 'Software Development', 'SOFTDEV', 'Internal development and system optimization.', 1).run();
    }

    // 10. Auto-provision Superadmin identity to stop the Profile Completion popup
    const caller = c.get('user');
    if (caller?.email?.toLowerCase() === 'admin@poliku.edu.my') {
      await c.env.DB.prepare(
        "UPDATE users SET status = 'Active', designation = 'Developer', department_id = ?, is_verified = 1, must_change_pin = 0 WHERE email = ?"
      ).bind(softDevId, 'admin@poliku.edu.my').run();
      
      // Evict cache to reflect changes immediately
      await c.env.SETTINGS.delete(`ucache:${caller.id}`).catch(() => {});
    }

    // 11. Synchronize department asset totals from locations (Source of Truth)
    await c.env.DB.prepare(`
      UPDATE departments 
      SET total_assets = (
        SELECT COALESCE(SUM(l.total_assets), 0) 
        FROM locations l 
        WHERE l.department_id = departments.id
      )
      WHERE id IN (SELECT DISTINCT department_id FROM locations)
    `).run();

    // 12. FORCE UNIVERSAL GROUPING: Ensure EVERY department has a group
    // Find departments missing groups
    const { results: orphanDepts } = await c.env.DB.prepare(
      "SELECT id, name FROM departments WHERE audit_group_id IS NULL OR audit_group_id = ''"
    ).all();

    const groupStmts: any[] = [];
    for (const d of (orphanDepts || []) as any[]) {
      const gId = crypto.randomUUID();
      groupStmts.push(c.env.DB.prepare("INSERT INTO audit_groups (id, name) VALUES (?, ?)").bind(gId, d.name));
      groupStmts.push(c.env.DB.prepare("UPDATE departments SET audit_group_id = ? WHERE id = ?").bind(gId, d.id));
    }
    if (groupStmts.length > 0) {
      await c.env.DB.batch(groupStmts);
    }

    return c.json({ success: true, groupsCreated: orphanDepts?.length || 0 });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// ─── USERS CLEAR ─────────────────────────────────────────────────────────────
db.post('/users/clear', rbacGuard('admin:hub'), async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const keep_user_id: string | undefined = body?.keep_user_id;
  try {
    await c.env.DB.prepare('DELETE FROM system_activities').run();
    if (keep_user_id) {
      await c.env.DB.prepare('DELETE FROM users WHERE id != ?').bind(keep_user_id).run();
    } else {
      await c.env.DB.prepare('DELETE FROM users').run();
    }
    return c.json({ success: true });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// ─── AUDIT PHASES CLEAR ─────────────────────────────────────────────────────
db.post('/audit-phases/clear', rbacGuard('admin:hub'), async (c) => {
  try {
    // audit_schedules has FK → audit_phases
    await c.env.DB.prepare('DELETE FROM audit_schedules').run();
    // kpi_tier_targets has FK → audit_phases
    await c.env.DB.prepare('DELETE FROM kpi_tier_targets').run();
    // institution_kpi_targets has FK → audit_phases (phase_id)
    await c.env.DB.prepare('DELETE FROM institution_kpi_targets').run();
    await c.env.DB.prepare('DELETE FROM audit_phases').run();
    return c.json({ success: true });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// ─── KPI CLEAR ──────────────────────────────────────────────────────────────
db.post('/kpi/clear', rbacGuard('admin:hub'), async (c) => {
  try {
    // kpi_tier_targets has FK → kpi_tiers
    await c.env.DB.prepare('DELETE FROM kpi_tier_targets').run();
    await c.env.DB.prepare('DELETE FROM institution_kpi_targets').run();
    await c.env.DB.prepare('DELETE FROM kpi_tiers').run();
    return c.json({ success: true });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// ─── FULL SYSTEM RESET ───────────────────────────────────────────────────────
// Wipes ALL operational data including phases, KPI, groups, and audit schedules.
// Keeps only the requesting admin user.
// Uses sequential individual DELETEs (not batch) so each table is independently
// committed. A batch() is atomic — if ANY statement fails the ENTIRE batch rolls
// back silently, which previously left departments intact.
db.post('/system/full-reset', rbacGuard('admin:hub'), async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const keep_user_id: string | undefined = body?.keep_user_id;
  try {
    // Purge any lingering edge cache entries from older deployments
    try {
      const edgeCacheStore = await caches.open('db');
      const origin = new URL(c.req.url).origin;
      await Promise.allSettled([
        '/api/db/audit-phases', '/api/db/kpi-tiers', '/api/db/kpi-tier-targets',
        '/api/db/departments', '/api/db/locations', '/api/db/department-mappings',
        '/api/db/audit-groups', '/api/db/institution-kpi-targets',
      ].map(path => edgeCacheStore.delete(new Request(`${origin}${path}`))));
    } catch { /* cache purge is best-effort */ }

    // FK-safe deletion order — every child table before its parent.
    // Sequential individual DELETEs so each auto-commits independently.
    // If one fails, the rest still execute.
    const deletes: { table: string; sql: string; binds?: any[] }[] = [
      { table: 'audit_schedules',       sql: 'DELETE FROM audit_schedules' },
      { table: 'cross_audit_permissions', sql: 'DELETE FROM cross_audit_permissions' },
      { table: 'department_mappings',    sql: 'DELETE FROM department_mappings' },
      { table: 'locations',              sql: 'DELETE FROM locations' },
      { table: 'buildings',              sql: 'DELETE FROM buildings' },
      { table: 'system_activities',      sql: 'DELETE FROM system_activities' },
      { table: 'users',
        sql: keep_user_id ? 'DELETE FROM users WHERE id != ?' : 'DELETE FROM users',
        binds: keep_user_id ? [keep_user_id] : [] },
      { table: 'departments',           sql: 'DELETE FROM departments' },
      { table: 'audit_groups',          sql: 'DELETE FROM audit_groups' },
      { table: 'kpi_tier_targets',      sql: 'DELETE FROM kpi_tier_targets' },
      { table: 'institution_kpi_targets', sql: 'DELETE FROM institution_kpi_targets' },
      { table: 'kpi_tiers',             sql: 'DELETE FROM kpi_tiers' },
      { table: 'audit_phases',          sql: 'DELETE FROM audit_phases' },
      { table: 'system_settings',       sql: 'DELETE FROM system_settings' },
    ];

    const errors: string[] = [];
    for (const d of deletes) {
      try {
        const stmt = c.env.DB.prepare(d.sql);
        if (d.binds && d.binds.length > 0) {
          await stmt.bind(...d.binds).run();
        } else {
          await stmt.run();
        }
      } catch (e: any) {
        errors.push(`${d.table}: ${e.message}`);
      }
    }

    // Also clear KV buildings cache
    await c.env.SETTINGS.delete('buildings').catch(() => {});

    if (errors.length > 0) {
      return c.json({ success: true, warnings: errors });
    }
    return c.json({ success: true });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// ─── Backup Routes ────────────────────────────────────────────────────────────

// POST /db/backup — manually trigger a D1→R2 backup (Admin only)
db.post('/backup', rbacGuard('system:settings'), async (c) => {
  try {
    const result = await backupD1ToR2({ db: c.env.DB, bucket: c.env.BACKUP });
    return c.json({ success: true, key: result.key, tablesSync: result.tablesSync, rowsSync: result.rowsSync, errors: result.errors });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// GET /db/backups — list all backup files in R2 (Admin only)
db.get('/backups', rbacGuard('system:settings'), async (c) => {
  try {
    const listed = await c.env.BACKUP.list({ prefix: 'backups/' });
    const files = (listed.objects || []).map((obj: any) => ({
      key: obj.key,
      size: obj.size,
      uploaded: obj.uploaded instanceof Date ? obj.uploaded.toISOString() : String(obj.uploaded),
    })).sort((a: any, b: any) => b.uploaded.localeCompare(a.uploaded));
    return c.json({ files });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// GET /db/backups/download?key=backups/... — stream a backup file as download (Admin only)
db.get('/backups/download', rbacGuard('system:settings'), async (c) => {
  const key = c.req.query('key');
  if (!key || !key.startsWith('backups/')) {
    return c.json({ error: 'Invalid key' }, 400);
  }
  try {
    const obj = await c.env.BACKUP.get(key);
    if (!obj) return c.json({ error: 'Backup not found' }, 404);
    const filename = key.split('/').pop() ?? 'backup.json';
    return new Response(obj.body as any, {
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// POST /db/backups/restore — restore D1 from uploaded JSON backup (Admin only)
db.post('/backups/restore', rbacGuard('system:settings'), async (c) => {
  try {
    const body = await c.req.json() as { snapshot: Record<string, any[]>; confirmation?: string };
    if (!body.snapshot || typeof body.snapshot !== 'object') {
      return c.json({ error: 'Invalid backup file: missing snapshot' }, 400);
    }
    // Restore order respects dependencies (settings first, then reference data, then schedules)
    const restoreOrder = [
      'system_settings',
      'audit_groups',
      'audit_phases',
      'kpi_tiers',
      'kpi_tier_targets',
      'institution_kpi_targets',
      'buildings',
      'departments',
      'users',
      'locations',
      'cross_audit_permissions',
      'department_mappings',
      'audit_schedules',
      'system_activities',
    ];
    const results: Record<string, { deleted: number; inserted: number }> = {};
    const errors: string[] = [];
    for (const table of restoreOrder) {
      const rows: any[] = body.snapshot[table];
      if (!Array.isArray(rows)) continue;
      try {
        // Delete existing rows
        const delResult = await c.env.DB.prepare(`DELETE FROM ${table}`).run();
        const deleted = (delResult.meta as any)?.changes ?? 0;
        let inserted = 0;
        if (rows.length > 0) {
          const columns = Object.keys(rows[0]);
          const placeholders = columns.map(() => '?').join(', ');
          const sql = `INSERT OR REPLACE INTO ${table} (${columns.join(', ')}) VALUES (${placeholders})`;
          // Batch in groups of 50 to stay within D1 limits
          for (let i = 0; i < rows.length; i += 50) {
            const chunk = rows.slice(i, i + 50);
            await c.env.DB.batch(
              chunk.map(row => c.env.DB.prepare(sql).bind(...columns.map(col => {
                const v = row[col];
                // JSON stringify objects/arrays stored as text
                return (v !== null && typeof v === 'object') ? JSON.stringify(v) : v;
              })))
            );
            inserted += chunk.length;
          }
        }
        results[table] = { deleted, inserted };
      } catch (e: any) {
        errors.push(`${table}: ${e.message}`);
      }
    }
    // Invalidate caches
    await c.env.SETTINGS.delete('buildings').catch(() => {});
    return c.json({ success: true, results, errors });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

export const dbRoutes = db;
