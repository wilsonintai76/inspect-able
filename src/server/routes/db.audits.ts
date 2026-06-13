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
  auditSchema, patchAuditSchema, userSchema, patchUserSchema, checkLocationYearConflict
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
    // ─── Idempotent Schema Updates ───
    await c.env.DB.prepare('ALTER TABLE audit_schedules ADD COLUMN verified_asset_count INTEGER').run().catch(() => {});
    await c.env.DB.prepare('ALTER TABLE audit_schedules ADD COLUMN asset_statuses TEXT').run().catch(() => {});

    // ─── KV Read-Through Cache ───
    const cached = await c.env.SETTINGS.get(SCHEDULE_CACHE_KEY, 'json').catch(() => null) as any[];
    if (cached) {
      return c.json(cached);
    }

    // Sweep: auto-lock and set status to 'In Progress' for any Pending records that already have all required fields set.
    await c.env.DB.prepare(
      `UPDATE audit_schedules SET status = 'In Progress', is_locked = 1
       WHERE status = 'Pending' AND date IS NOT NULL AND supervisor_id IS NOT NULL
       AND auditor1_id IS NOT NULL AND auditor2_id IS NOT NULL`
    ).run();

    // Sweep: unlock and demote any In Progress records that are missing required fields
    await c.env.DB.prepare(
      `UPDATE audit_schedules SET status = 'Pending', is_locked = 0
       WHERE status = 'In Progress' AND (date IS NULL OR supervisor_id IS NULL
       OR auditor1_id IS NULL OR auditor2_id IS NULL)`
    ).run();

    const { results } = await c.env.DB.prepare(
      'SELECT id, department_id, location_id, supervisor_id, auditor1_id, auditor2_id, date, status, phase_id, report_path, is_locked, verified_asset_count, asset_statuses FROM audit_schedules'
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
      isLocked: a.is_locked === null ? undefined : (a.is_locked === 1),
      verifiedAssetCount: a.verified_asset_count ?? null,
      assetStatuses: a.asset_statuses ? JSON.parse(a.asset_statuses) : null
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

  if (audit.locationId) {
    const conflictErr = await checkLocationYearConflict(c.env.DB, audit.locationId, id, audit.date || null, phaseId || null);
    if (conflictErr) {
      return c.json({ error: conflictErr, code: 'LOCATION_YEAR_CONFLICT' }, 422);
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
  const isExplicitLockChange = updates.isLocked !== undefined;

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
    'SELECT status, date, supervisor_id, auditor1_id, auditor2_id, phase_id, location_id FROM audit_schedules WHERE id = ?'
  ).bind(id).first<{ status: string; date: string | null; supervisor_id: string | null; auditor1_id: string | null; auditor2_id: string | null; phase_id: string | null; location_id: string }>();

  if (existingForActivation) {
    const finalLocation = updates.locationId !== undefined ? updates.locationId : existingForActivation.location_id;
    const finalDate = updates.date !== undefined ? updates.date : existingForActivation.date;
    const finalPhaseId = updates.phaseId !== undefined ? updates.phaseId : existingForActivation.phase_id;

    if (
      (updates.date !== undefined || updates.locationId !== undefined || updates.phaseId !== undefined) &&
      finalLocation
    ) {
      const conflictErr = await checkLocationYearConflict(
        c.env.DB,
        finalLocation,
        id,
        finalDate || null,
        finalPhaseId || null
      );
      if (conflictErr) {
        return c.json({ error: conflictErr, code: 'LOCATION_YEAR_CONFLICT' }, 422);
      }
    }

    // Synchronous department update auditor check
    if (updates.departmentId !== undefined && updates.departmentId !== null) {
      const finalAuditor1 = updates.auditor1Id !== undefined ? updates.auditor1Id : existingForActivation.auditor1_id;
      const finalAuditor2 = updates.auditor2Id !== undefined ? updates.auditor2Id : existingForActivation.auditor2_id;
      let clearedAny = false;

      if (finalAuditor1) {
        const u1 = await c.env.DB.prepare('SELECT department_id FROM users WHERE id = ?').bind(finalAuditor1).first<{ department_id: string }>();
        if (u1 && u1.department_id === updates.departmentId) {
          updates.auditor1Id = null;
          clearedAny = true;
        }
      }
      if (finalAuditor2) {
        const u2 = await c.env.DB.prepare('SELECT department_id FROM users WHERE id = ?').bind(finalAuditor2).first<{ department_id: string }>();
        if (u2 && u2.department_id === updates.departmentId) {
          updates.auditor2Id = null;
          clearedAny = true;
        }
      }

      if (clearedAny) {
        updates.status = 'Pending';
        updates.isLocked = false;
      }
    }

    const currentStatus = updates.status || existingForActivation.status;
    const finalSupervisor = updates.supervisorId !== undefined ? updates.supervisorId : existingForActivation.supervisor_id;
    const finalAuditor1 = updates.auditor1Id !== undefined ? updates.auditor1Id : existingForActivation.auditor1_id;
    const finalAuditor2 = updates.auditor2Id !== undefined ? updates.auditor2Id : existingForActivation.auditor2_id;

    if (currentStatus === 'Pending') {
      if (finalDate && finalSupervisor && finalAuditor1 && finalAuditor2) {
        updates.status = 'In Progress';
        updates.isLocked = true;

        // Auto-resolve phaseId from the date when all fields complete
        // (handles the case where the date was set in a prior request and
        //  the last field being filled now is an auditor or supervisor)
        if (updates.phaseId === undefined && !existingForActivation.phase_id && finalDate) {
          const matchingPhase = await c.env.DB.prepare(
            'SELECT id FROM audit_phases WHERE start_date <= ? AND end_date >= ? LIMIT 1'
          ).bind(finalDate, finalDate).first<{ id: string }>();
          if (matchingPhase) {
            updates.phaseId = matchingPhase.id;
          }
        }
      }
    } else if (currentStatus === 'In Progress') {
      if (!finalDate || !finalSupervisor || !finalAuditor1 || !finalAuditor2) {
        updates.status = 'Pending';
        updates.isLocked = false;
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
  if (updates.verifiedAssetCount !== undefined) { fields.push('verified_asset_count = ?'); values.push(updates.verifiedAssetCount); }
  if (updates.assetStatuses !== undefined) { fields.push('asset_statuses = ?'); values.push(updates.assetStatuses ? JSON.stringify(updates.assetStatuses) : null); }
  if (updates.isLocked !== undefined) {
    if (isExplicitLockChange) {
      const callerRoles = (c.get('user') as any)?.roles || [];
      const caps = deriveCapabilities({ id: (c.get('user') as any)?.id || '', email: (c.get('user') as any)?.email || '', role: (c.get('user') as any)?.role || '', roles: callerRoles, departmentId: (c.get('user') as any)?.departmentId || null, certificationExpiry: (c.get('user') as any)?.certificationExpiry || null });
      if (!caps.has('manage:locations') && !caps.has('system:admin') && !caps.has('manage:departments')) {
        return c.json({ error: 'Only Supervisors can lock or unlock schedules.' }, 403);
      }
    }
    fields.push('is_locked = ?');
    values.push(updates.isLocked === null ? null : (updates.isLocked ? 1 : 0));
  }

  if (fields.length === 0) return c.json({ success: true });

  try {
    await c.env.DB.prepare(
      `UPDATE audit_schedules SET ${fields.join(', ')} WHERE id = ?`
    ).bind(...values, id).run();

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