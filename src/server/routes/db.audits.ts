import { Hono, Context, Next } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { Bindings, Variables } from '../types';
import { requirePolicy, bodyDeptContextBuilder, emptyContextBuilder, auditPatchContextBuilder } from '../middleware/pbac';
import { deriveCapabilities } from '../utils/policyEngine';
import { sendSupervisorApprovalEmail } from '../services/emailService';
import { hashPassword } from '../services/authService';
import { 
  DEFAULT_USER_PASSWORD, SCHEDULE_CACHE_KEY, getRolesForDesignation, logApprovalReminderActivity, invalidateScheduleCache,
  edgeCache, auditLockGuard, zeroAssetGuard, statusTransitionGuard, patchAuditPermissionGuard,
  auditSchema, patchAuditSchema, userSchema, patchUserSchema, checkLocationYearConflict, normDate
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
    // ─── audit_reports table for multi-KEWPA upload ───
    await c.env.DB.prepare(
      `CREATE TABLE IF NOT EXISTS audit_reports (
        id TEXT PRIMARY KEY,
        audit_id TEXT NOT NULL,
        file_path TEXT NOT NULL,
        file_name TEXT,
        uploaded_by TEXT,
        uploaded_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (audit_id) REFERENCES audit_schedules(id)
      )`
    ).run().catch(() => {});

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
      'SELECT id, department_id, location_id, supervisor_id, auditor1_id, auditor2_id, date, status, phase_id, report_path, is_locked, total_assets_inspected, asset_status_summary, verified_asset_count, asset_statuses FROM audit_schedules'
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
      totalAssetsInspected: a.total_assets_inspected ?? null,
      assetStatusSummary: a.asset_status_summary ?? null,
      verifiedAssetCount: a.verified_asset_count ?? null,
      assetStatuses: a.asset_statuses ? JSON.parse(a.asset_statuses) : null
    }));
    
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
    const nd = normDate(audit.date);
    const phases = await c.env.DB.prepare('SELECT id, start_date, end_date FROM audit_phases').all();
    const phaseRows = (phases.results ?? []) as { id: string; start_date: string; end_date: string }[];
    const matchingPhase = phaseRows.find(p => nd >= normDate(p.start_date) && nd <= normDate(p.end_date));
    if (phaseRows.length > 0 && !matchingPhase) {
      return c.json({ error: 'Selected date must fall within a configured audit phase.' }, 400);
    }
    if (matchingPhase) phaseId = matchingPhase.id;
  } else {
    phaseId = null;
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

  // Date-driven phase auto-routing: only assign phase when status is In Progress.
  // Pending audits stay Unscheduled (phase_id=NULL) until all slots filled.
  if (updates.date !== undefined) {
    if (updates.date) {
      const nd = normDate(updates.date);
      const phases = await c.env.DB.prepare('SELECT id, start_date, end_date FROM audit_phases').all();
      const phaseRows = (phases.results ?? []) as { id: string; start_date: string; end_date: string }[];
      const matchingPhase = phaseRows.find(p => nd >= normDate(p.start_date) && nd <= normDate(p.end_date));
      if (phaseRows.length > 0 && !matchingPhase) {
        return c.json({ error: 'Selected date must fall within a configured audit phase.' }, 400);
      }
      // Only set phase if status is also transitioning to In Progress
      if (matchingPhase && updates.status === 'In Progress') {
        updates.phaseId = matchingPhase.id;
      }
    } else {
      updates.phaseId = null;
    }
  }

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
        if (audit.status === 'In Progress') newStatus = 'Pending';
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
        if (updates.isLocked !== false) {
          updates.status = 'In Progress';
          updates.isLocked = true;

          // Auto-resolve phaseId from the date when all fields complete
          if (updates.phaseId === undefined && !existingForActivation.phase_id && finalDate) {
            const matchingPhase = await c.env.DB.prepare(
              'SELECT id FROM audit_phases WHERE start_date <= ? AND end_date >= ? LIMIT 1'
            ).bind(finalDate, finalDate).first<{ id: string }>();
            if (matchingPhase) {
              updates.phaseId = matchingPhase.id;
            }
          }
        }
      }
    } else if (currentStatus === 'In Progress') {
      if (!finalDate || !finalSupervisor || !finalAuditor1 || !finalAuditor2 || updates.isLocked === false) {
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
  if (updates.totalAssetsInspected !== undefined) { fields.push('total_assets_inspected = ?'); values.push(updates.totalAssetsInspected); }
  if (updates.assetStatusSummary !== undefined) { fields.push('asset_status_summary = ?'); values.push(updates.assetStatusSummary); }
  if (updates.verifiedAssetCount !== undefined) { fields.push('verified_asset_count = ?'); values.push(updates.verifiedAssetCount); }
  if (updates.assetStatuses !== undefined) { fields.push('asset_statuses = ?'); values.push(updates.assetStatuses ? JSON.stringify(updates.assetStatuses) : null); }
  if (updates.isLocked !== undefined) {
    const callerRoles = (c.get('user') as any)?.roles || [];
    const caps = deriveCapabilities({ id: (c.get('user') as any)?.id || '', email: (c.get('user') as any)?.email || '', role: (c.get('user') as any)?.role || '', roles: callerRoles, departmentId: (c.get('user') as any)?.departmentId || null, certificationExpiry: (c.get('user') as any)?.certificationExpiry || null, qualifications: (c.get('user') as any)?.qualifications || [] });
    if (!caps.has('manage:locations') && !caps.has('system:admin') && !caps.has('manage:departments') && !caps.has('asset_inspector')) {
      return c.json({ error: 'Only authorized personnel can lock or unlock schedules.' }, 403);
    }
    fields.push('is_locked = ?');
    values.push(updates.isLocked === null ? null : (updates.isLocked ? 1 : 0));

    // Auto-assign phase on lock if none explicitly set and none exists
    if (updates.isLocked === true && updates.phaseId === undefined && !existingForActivation?.phase_id) {
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

  if (fields.length === 0) return c.json({ success: true });

  try {
    await c.env.DB.prepare(
      `UPDATE audit_schedules SET ${fields.join(', ')} WHERE id = ?`
    ).bind(...values, id).run();


    // Automatically synchronize location totalAssets and uninspectedAssetCount if status is 'Completed'
    const finalStatus = updates.status !== undefined ? updates.status : existingForActivation?.status;
    if (finalStatus === 'Completed') {
      const sched = await c.env.DB.prepare(
        'SELECT location_id, verified_asset_count FROM audit_schedules WHERE id = ?'
      ).bind(id).first<{ location_id: string | null; verified_asset_count: number | null }>();

      if (sched?.location_id && sched.verified_asset_count !== null) {
        await c.env.DB.prepare(
          'UPDATE locations SET total_assets = ?, uninspected_asset_count = 0 WHERE id = ?'
        ).bind(sched.verified_asset_count, sched.location_id).run();
      }
    }


    // Fire-and-forget email when status just became 'In Progress'
    const previousStatus = existingForActivation?.status;
    const newStatus = updates.status;
    if (
      newStatus === 'In Progress' &&
      previousStatus !== 'In Progress' &&
      c.env.RESEND_API_KEY
    ) {
      const supervisorId = updates.supervisorId ?? existingForActivation?.supervisor_id ?? null;
      if (supervisorId) {
        (async () => {
          try {

        // --- Begin: Department move audit repair logic ---
        // (Moved outside the email dispatcher block)
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
    await c.env.DB.prepare('DELETE FROM audit_reports WHERE audit_id = ?').bind(id).run();
    await c.env.DB.prepare('DELETE FROM audit_schedules WHERE id = ?').bind(id).run();
    invalidateScheduleCache(c.env.SETTINGS);
    return c.json({ success: true });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});


// ─── Maintenance: Clean up orphaned audits for archived locations ───
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
      } else {
        phaseId = null;
      }

      statements.push(
        c.env.DB.prepare(
          `INSERT INTO audit_schedules 
           (id, department_id, location_id, supervisor_id, auditor1_id, auditor2_id, date, status, phase_id, report_path) 
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(location_id) DO UPDATE SET
             date = COALESCE(EXCLUDED.date, audit_schedules.date),
             supervisor_id = COALESCE(EXCLUDED.supervisor_id, audit_schedules.supervisor_id),
             auditor1_id = COALESCE(EXCLUDED.auditor1_id, audit_schedules.auditor1_id),
             auditor2_id = COALESCE(EXCLUDED.auditor2_id, audit_schedules.auditor2_id),
             status = COALESCE(EXCLUDED.status, audit_schedules.status)`
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

// ─── Multi-KEWPA Report Upload ────────────────────────────────────────

// Access guard: only admin or assigned inspector can manage reports
const reportAccessGuard = async (c: Context<{ Bindings: Bindings; Variables: Variables }>, next: Next) => {
  const caller = c.get('user')!;
  const caps = deriveCapabilities(caller as any);
  if (caps.has('system:admin')) return next();
  if (!caps.has('asset_inspector')) {
    return c.json({ error: 'Only qualified inspectors or admins can manage KEW-PA 11 reports.' }, 403);
  }
  // Inspector must be assigned to this audit
  const auditId = c.req.param('id');
  const audit = await c.env.DB.prepare(
    'SELECT auditor1_id, auditor2_id FROM audit_schedules WHERE id = ?'
  ).bind(auditId).first<{ auditor1_id: string | null; auditor2_id: string | null }>();
  if (!audit) return c.json({ error: 'Audit not found' }, 404);
  if (audit.auditor1_id !== caller.id && audit.auditor2_id !== caller.id) {
    return c.json({ error: 'You can only upload reports for audits you are assigned to.' }, 403);
  }
  return next();
};

// List all reports for an audit
router.get('/audits/:id/reports', reportAccessGuard, async (c) => {
  const auditId = c.req.param('id');
  try {
    const { results } = await c.env.DB.prepare(
      'SELECT id, audit_id, file_path, file_name, uploaded_by, uploaded_at FROM audit_reports WHERE audit_id = ? ORDER BY uploaded_at DESC'
    ).bind(auditId).all();
    const reports = (results || []).map((r: any) => ({
      id: r.id,
      auditId: r.audit_id,
      filePath: r.file_path,
      fileName: r.file_name ?? null,
      uploadedBy: r.uploaded_by ?? null,
      uploadedAt: r.uploaded_at ?? null,
    }));
    return c.json(reports);
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// Add a new report to an audit
router.post('/audits/:id/reports', reportAccessGuard, async (c) => {
  const auditId = c.req.param('id');
  const caller = c.get('user');
  try {
    const body = await c.req.json<{ filePath: string; fileName?: string }>();
    if (!body.filePath) {
      return c.json({ error: 'filePath is required' }, 400);
    }
    const id = crypto.randomUUID();
    await c.env.DB.prepare(
      'INSERT INTO audit_reports (id, audit_id, file_path, file_name, uploaded_by) VALUES (?, ?, ?, ?, ?)'
    ).bind(id, auditId, body.filePath, body.fileName ?? null, caller?.id ?? null).run();
    return c.json({ id, auditId, filePath: body.filePath, fileName: body.fileName ?? null }, 201);
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// Delete a specific report (DB row + R2 file)
router.delete('/audits/:id/reports/:reportId', reportAccessGuard, async (c) => {
  const { id: auditId, reportId } = c.req.param();
  try {
    // Fetch the file_path before deleting the row
    const report = await c.env.DB.prepare(
      'SELECT file_path FROM audit_reports WHERE id = ? AND audit_id = ?'
    ).bind(reportId, auditId).first<{ file_path: string }>();
    
    if (!report) {
      return c.json({ error: 'Report not found' }, 404);
    }

    // Delete from R2 storage
    try {
      const url = new URL(report.file_path);
      const key = url.pathname.replace(/^\//, ''); // strip leading slash
      await c.env.MEDIA.delete(key);
    } catch { /* R2 delete is best-effort; file may already be gone */ }

    // Delete from database
    await c.env.DB.prepare('DELETE FROM audit_reports WHERE id = ? AND audit_id = ?').bind(reportId, auditId).run();

    // If no reports remain, revert status from Completed to In Progress
    const remaining = await c.env.DB.prepare(
      'SELECT COUNT(*) as count FROM audit_reports WHERE audit_id = ?'
    ).bind(auditId).first<{ count: number }>();
    if (remaining && remaining.count === 0) {
      const audit = await c.env.DB.prepare(
        'SELECT status FROM audit_schedules WHERE id = ?'
      ).bind(auditId).first<{ status: string }>();
      if (audit && audit.status === 'Completed') {
        await c.env.DB.prepare(
          "UPDATE audit_schedules SET status = 'In Progress' WHERE id = ?"
        ).bind(auditId).run();
        invalidateScheduleCache(c.env.SETTINGS);
      }
    }

    return c.json({ success: true });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

export { router };