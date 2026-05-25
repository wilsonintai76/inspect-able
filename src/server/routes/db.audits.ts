import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { Bindings, Variables } from '../types';
import { requirePolicy, bodyDeptContextBuilder, emptyContextBuilder, auditPatchContextBuilder } from '../middleware/pbac';
import { deriveCapabilities } from '../utils/policyEngine';
import { sendSupervisorApprovalEmail } from '../services/emailService';
import { hashPassword } from '../services/authService';
import { 
  DEFAULT_USER_PASSWORD, SCHEDULE_CACHE_KEY, getRolesForDesignation, logApprovalReminderActivity, invalidateScheduleCache,
  edgeCache, auditLockGuard, zeroAssetGuard, statusTransitionGuard, patchAuditPermissionGuard,
  auditSchema, patchAuditSchema, userSchema, patchUserSchema
} from './db.shared';
import { 
  unassignExpiredAuditors, handleLocationDepartmentTransfer, refreshDepartmentAssetTotals,
  unassignSpecificAuditorFromFutureAudits, cleanupAuditsForArchivedLocation
} from '../services/auditMaintenanceService';
import { auditAssignmentGuard } from '../middleware/conflictOfInterest';

const router = new Hono<{ Bindings: Bindings, Variables: Variables }>();
// Audits
router.get('/audits', async (c) => {
  try {
    // â”€â”€â”€ KV Read-Through Cache â”€â”€â”€
    const cached = await c.env.SETTINGS.get(SCHEDULE_CACHE_KEY, 'json').catch(() => null) as any[];
    if (cached) {
      return c.json(cached);
    }

    // Sweep: auto-fix any Pending records that already have all required fields set.
    await c.env.DB.prepare(
      `UPDATE audit_schedules SET status = 'Awaiting Approval'
       WHERE status = 'Pending' AND date IS NOT NULL AND supervisor_id IS NOT NULL
       AND auditor1_id IS NOT NULL AND auditor2_id IS NOT NULL`
    ).run();

    // Sweep: demote any Awaiting Approval records that are missing required fields
    await c.env.DB.prepare(
      `UPDATE audit_schedules SET status = 'Pending'
       WHERE status = 'Awaiting Approval' AND (date IS NULL OR supervisor_id IS NULL
       OR auditor1_id IS NULL OR auditor2_id IS NULL)`
    ).run();

    const { results } = await c.env.DB.prepare(
      'SELECT id, department_id, location_id, supervisor_id, auditor1_id, auditor2_id, date, status, phase_id, report_path, is_locked FROM audit_schedules'
    ).all();
    
    const data = (results || []).map((a: any) => ({
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
    }));

    // Save to KV with 60-second TTL for freshness
    await c.env.SETTINGS.put(SCHEDULE_CACHE_KEY, JSON.stringify(data), { expirationTtl: 60 }).catch(() => {});
    
    return c.json(data);
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

router.post('/audits', zValidator('json', auditSchema), requirePolicy('audit.create', bodyDeptContextBuilder()), zeroAssetGuard, auditAssignmentGuard, async (c) => {
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

    invalidateScheduleCache(c.env.SETTINGS);

    return c.json({
      id,
      ...audit,
      phaseId
    });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

router.patch('/audits/:id', zValidator('json', patchAuditSchema), patchAuditPermissionGuard, auditLockGuard, statusTransitionGuard, auditAssignmentGuard, async (c) => {
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
    'SELECT status, date, supervisor_id, auditor1_id, auditor2_id, phase_id FROM audit_schedules WHERE id = ?'
  ).bind(id).first<{ status: string; date: string | null; supervisor_id: string | null; auditor1_id: string | null; auditor2_id: string | null; phase_id: string | null }>();

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
    const caps = deriveCapabilities({ id: (c.get('user') as any)?.id || '', email: (c.get('user') as any)?.email || '', role: (c.get('user') as any)?.role || '', roles: callerRoles, departmentId: (c.get('user') as any)?.departmentId || null, certificationExpiry: (c.get('user') as any)?.certificationExpiry || null });
    if (!caps.has('manage:locations') && !caps.has('system:admin') && !caps.has('manage:departments')) {
      return c.json({ error: 'Only Supervisors can lock or unlock schedules.' }, 403);
    }
    fields.push('is_locked = ?');
    values.push(updates.isLocked === null ? null : (updates.isLocked ? 1 : 0));

    // Lock approval: Awaiting Approval â†’ In Progress
    if (updates.isLocked === true && existingForActivation?.status === 'Awaiting Approval') {
      fields.push('status = ?');
      values.push('In Progress');
      updates.status = 'In Progress'; // used below for email guard

      // Auto-assign phase on lock if none explicitly set and none exists
      if (updates.phaseId === undefined && !existingForActivation?.phase_id) {
        const now = new Date().toISOString().split('T')[0];
        const phase = await c.env.DB.prepare(
          'SELECT id FROM audit_phases WHERE start_date <= ? AND end_date >= ? LIMIT 1'
        ).bind(now, now).first<{ id: string }>();
        if (phase) {
          fields.push('phase_id = ?');
          values.push(phase.id);
          updates.phaseId = phase.id;
        }
      }
    }
    // Revoke approval: In Progress → Awaiting Approval (if all fields still present)
    // Revoke approval: In Progress â†’ Awaiting Approval (if all fields still present)
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

        // --- Begin: Department move audit repair logic ---
        if (updates.departmentId !== undefined) {
          // 1. Update all audits for this location to new department
          await c.env.DB.prepare('UPDATE audit_schedules SET department_id = ? WHERE location_id = ?').bind(updates.departmentId, id).run();

          // 2. For each audit, clear any auditor who now matches the new department
          const audits = await c.env.DB.prepare('SELECT id, auditor1_id, auditor2_id, is_locked, status FROM audit_schedules WHERE location_id = ?').bind(id).all<any>();
          for (const audit of audits.results || []) {
            let clear1 = false, clear2 = false;
            if (audit.auditor1_id) {
              const u1 = await c.env.DB.prepare('SELECT department_id FROM users WHERE id = ?').bind(audit.auditor1_id).first<{department_id:string}>();
              if (u1 && u1.department_id === updates.departmentId) clear1 = true;
            }
            if (audit.auditor2_id) {
              const u2 = await c.env.DB.prepare('SELECT department_id FROM users WHERE id = ?').bind(audit.auditor2_id).first<{department_id:string}>();
              if (u2 && u2.department_id === updates.departmentId) clear2 = true;
            }
            if (clear1 || clear2) {
              let newStatus = audit.status;
              let newLocked = audit.is_locked;
              if (audit.status === 'Awaiting Approval' || audit.status === 'In Progress') newStatus = 'Pending';
              if (audit.is_locked) newLocked = null;
              await c.env.DB.prepare(
                'UPDATE audit_schedules SET auditor1_id = ?, auditor2_id = ?, status = ?, is_locked = ? WHERE id = ?'
              ).bind(
                clear1 ? null : audit.auditor1_id,
                clear2 ? null : audit.auditor2_id,
                newStatus,
                newLocked,
                audit.id
              ).run();
            }
          }
        }
        // --- End: Department move audit repair logic ---
            const sIds = (supervisorId || '').split(',').map((s: string) => s.trim()).filter(Boolean);
            const supervisors: { name: string; email: string }[] = [];
            for (const sid of sIds) {
              const u = await c.env.DB.prepare('SELECT name, email FROM users WHERE id = ?').bind(sid).first<{ name: string; email: string }>();
              if (u?.email) supervisors.push({ name: u.name, email: u.email });
            }
            if (supervisors.length === 0) return;

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

            for (const supervisor of supervisors) {
              await sendSupervisorApprovalEmail(
                c.env.RESEND_API_KEY!,
                supervisor.email,
                supervisor.name,
                locationName,
                departmentName,
                auditDate,
                c.env.APP_URL,
              );
              await logApprovalReminderActivity(
                c,
                id,
                'system',
                supervisor.name,
                'automatic',
              );
            }
          } catch (emailErr) {
            console.error('[Email] Supervisor approval email failed:', emailErr);
          }
        })();
      }
    }

    invalidateScheduleCache(c.env.SETTINGS);
    return c.json({ success: true });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

router.delete('/audits/:id', requirePolicy('audit.delete', auditPatchContextBuilder()), async (c) => {
  const id = c.req.param('id');
  try {
    await c.env.DB.prepare('DELETE FROM audit_schedules WHERE id = ?').bind(id).run();
    invalidateScheduleCache(c.env.SETTINGS);
    return c.json({ success: true });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// â”€â”€â”€ Maintenance: Unassign Expired/Revoked Auditors â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Admin endpoint to unassign all auditors with expired/revoked certificates from future audits
router.post('/audits/maintenance/unassign-expired-auditors', requirePolicy('system.reset', emptyContextBuilder()), async (c) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    await unassignExpiredAuditors(c.env.DB, today);
    invalidateScheduleCache(c.env.SETTINGS);
    return c.json({ success: true });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// â”€â”€â”€ Maintenance: Clean up orphaned audits for archived locations â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
router.post('/audits/maintenance/cleanup-archived-location-audits', requirePolicy('system.reset', emptyContextBuilder()), async (c) => {
  try {
    // Find all archived locations and delete their non-completed audits
    const archivedLocs = await c.env.DB.prepare(
      "SELECT id FROM locations WHERE status = 'Archived'"
    ).all<{ id: string }>();
    
    let deletedCount = 0;
    for (const loc of archivedLocs.results || []) {
      const result = await c.env.DB.prepare(
        "DELETE FROM audit_schedules WHERE location_id = ? AND status != 'Completed'"
      ).bind(loc.id).run();
      deletedCount += (result.meta?.changes || 0);
    }
    
    invalidateScheduleCache(c.env.SETTINGS);
    return c.json({ success: true, deletedCount });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

router.post('/audits/:id/send-approval-email', requirePolicy('audit.maintenance', auditPatchContextBuilder()), async (c) => {
  const id = c.req.param('id');
  const caller = c.get('user');
  
  try {
    const audit = await c.env.DB.prepare('SELECT * FROM audit_schedules WHERE id = ?').bind(id).first<any>();
    if (!audit) return c.json({ error: 'Audit not found' }, 404);
    if (audit.status !== 'Awaiting Approval') return c.json({ error: 'Audit is not awaiting approval' }, 400);

    const supervisorIds = (audit.supervisor_id || '').split(',').map((s: string) => s.trim()).filter(Boolean);
    const supervisors: { name: string; email: string }[] = [];
    for (const sid of supervisorIds) {
      const u = await c.env.DB.prepare('SELECT name, email FROM users WHERE id = ?').bind(sid).first<{ name: string; email: string }>();
      if (u?.email) supervisors.push({ name: u.name, email: u.email });
    }
    if (supervisors.length === 0) {
      const locName = (await c.env.DB.prepare('SELECT name FROM locations WHERE id = ?').bind(audit.location_id).first<{name: string}>())?.name || audit.location_id;
      return c.json({ error: `No supervisor with a valid email found for location "${locName}". Please update emails in User Management.` }, 400);
    }

    const loc = await c.env.DB.prepare('SELECT name FROM locations WHERE id = ?').bind(audit.location_id).first<{name: string}>();
    const dept = await c.env.DB.prepare('SELECT name FROM departments WHERE id = ?').bind(audit.department_id).first<{name: string}>();

    const apiKey = c.env.RESEND_API_KEY || await c.env.SETTINGS.get('RESEND_API_KEY');
    if (!apiKey) return c.json({ error: 'Email service not configured' }, 500);

    for (const supervisor of supervisors) {
      await sendSupervisorApprovalEmail(
        apiKey,
        supervisor.email,
        supervisor.name,
        loc?.name || audit.location_id,
        dept?.name || audit.department_id,
        audit.date,
        c.env.APP_URL || 'https://www.inspect-able.com'
      );
      await logApprovalReminderActivity(
        c,
        id,
        caller?.id || 'system',
        supervisor.name,
        'manual',
      );
    }

    return c.json({ success: true, sentTo: supervisors.length });

    return c.json({ success: true });
  } catch (err: any) {
    console.error('[Email] Manual approval reminder failed:', err);
    return c.json({ error: err.message }, 500);
  }
});

router.post('/audits/bulk', requirePolicy('audit.create', bodyDeptContextBuilder()), async (c) => {
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

router.post('/users/:id/reset-password', requirePolicy('user.update', emptyContextBuilder()), async (c) => {
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

export { router };