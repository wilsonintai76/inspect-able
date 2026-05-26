import { Hono } from 'hono';
import { Bindings, Variables } from '../types';
import { verifyNativeJwt } from '../middleware/auth';
import { D1Database } from '@cloudflare/workers-types';

const pub = new Hono<{ Bindings: Bindings; Variables: Variables }>();

/**
 * Resolve the authenticated userId from:
 *   1. Authorization: Bearer <jwt>  (SPA clients that still have a valid token)
 *   2. session cookie               (SSO cookie set on any subdomain login)
 * Returns null if neither is valid.
 */
async function getMobileSession(c: any): Promise<string | null> {
  // ── 1. Bearer JWT ──────────────────────────────────────────────────────────
  const authHeader = c.req.header('Authorization') || '';
  if (authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    const payload = await verifyNativeJwt(token, c.env.JWT_SECRET).catch(() => null);
    if (payload?.userId) return payload.userId as string;
  }

  // ── 2. Session cookie ──────────────────────────────────────────────────────
  const cookieHeader = c.req.header('cookie') || '';
  const sid = cookieHeader
    .split(';')
    .map((s: string) => s.trim())
    .find((s: string) => s.startsWith('session='))
    ?.slice('session='.length);
  if (!sid) return null;
  try {
    const userId = await c.env.SETTINGS.get(`sessid:${sid}`);
    if (!userId) return null;
    const stored = await c.env.SETTINGS.get(`sess:${userId}`);
    if (!stored) return null;
    const { sessionId: storedSid } = JSON.parse(stored) as { sessionId: string };
    return storedSid === sid ? userId : null;
  } catch { return null; }
}

/**
 * Verify the authenticated user is a Certified Officer:
 * any Active, verified user with a valid (non-expired) certification_expiry.
 * The "Auditor" role label is NOT required — certification is the sole gate,
 * matching the client-side hasCert check in MobileApp.tsx.
 * Returns an error message string, or null if the check passes.
 */
async function assertCertifiedOfficer(db: D1Database, userId: string): Promise<string | null> {
  const today = new Date().toISOString().split('T')[0];
  const user = await db.prepare(
    `SELECT status, is_verified, certification_expiry FROM users WHERE id = ?`
  ).bind(userId).first<{ status: string; is_verified: number; certification_expiry: string | null }>();
  if (!user) return 'User account not found.';
  if (user.status !== 'Active') return 'Your account is not active.';
  if (!user.is_verified) return 'Your account is not verified.';
  if (!user.certification_expiry || user.certification_expiry < today) {
    return 'Access restricted: this mobile app is for certified officers only.';
  }
  return null;
}

/**
 * GET /api/public/kiosk
 *
 * Used by the Mobile app (mobile.inspect-able.com).
 * Returns all audit schedules enriched with department, location, phase,
 * and auditor/supervisor display names. Also returns all active users
 * (for the searchable assignment combobox) and phases.
 * Restricted to certified officers (Auditor role + valid certification).
 */
pub.get('/kiosk', async (c) => {
  // Require SSO session — mobile is no longer publicly accessible
  const sessionUserId = await getMobileSession(c);
  if (!sessionUserId) return c.json({ error: 'Authentication required' }, 401);

  // Mobile is for certified officers only
  const certError = await assertCertifiedOfficer(c.env.DB, sessionUserId);
  if (certError) return c.json({ error: certError, code: 'NOT_CERTIFIED' }, 403);

  // KV read-through cache — skips the 6-query D1 batch on every 30 s poll
  const cachedKiosk = await c.env.SETTINGS.get('mobile_cache');
  if (cachedKiosk) {
    c.header('Cache-Control', 'no-store');
    return c.json(JSON.parse(cachedKiosk));
  }

  try {
    const db = c.env.DB;
    const [schedulesResult, usersResult, deptsResult, locsResult, phasesResult, buildingsResult] = await db.batch([
      db.prepare(`
        SELECT s.id, s.department_id, s.location_id, s.supervisor_id,
               s.auditor1_id, s.auditor2_id, s.date, s.status, s.phase_id, s.is_locked,
               d.name AS dept_name, d.abbr AS dept_abbr,
               l.name AS loc_name, l.total_assets, l.contact AS loc_contact,
               l.building_id, l.level,
               p.name AS phase_name, p.start_date, p.end_date
        FROM audit_schedules s
        LEFT JOIN departments d ON s.department_id = d.id
        LEFT JOIN locations l ON s.location_id = l.id
        LEFT JOIN audit_phases p ON s.phase_id = p.id
        ORDER BY s.date ASC, dept_name ASC
      `),
      db.prepare(`
        SELECT id, name, designation, department_id, roles, status, is_verified,
               certification_issued, certification_expiry, contact_number
        FROM users
        WHERE status = 'Active' AND is_verified = 1
        ORDER BY name ASC
      `),
      db.prepare(`SELECT id, name, abbr FROM departments ORDER BY name ASC`),
      db.prepare(`SELECT id, name, total_assets FROM locations`),
      db.prepare(`SELECT id, name, start_date, end_date, status FROM audit_phases ORDER BY start_date ASC`),
      db.prepare(`SELECT id, name, abbr FROM buildings ORDER BY name ASC`),
    ]);

    // Build a lookup map for user names
    const userMap = new Map<string, { name: string; designation: string | null; departmentId: string | null; roles: string[]; certExpiry: string | null; contactNumber: string | null }>();
    for (const u of (usersResult.results ?? []) as any[]) {
      userMap.set(u.id, {
        name: u.name,
        designation: u.designation,
        departmentId: u.department_id,
        roles: JSON.parse(u.roles || '["Staff"]'),
        certExpiry: u.certification_expiry ?? null,
        contactNumber: u.contact_number ?? null,
      });
    }

    const buildingMap = new Map<string, { name: string; abbr: string }>();
    for (const b of (buildingsResult?.results ?? []) as any[]) {
      buildingMap.set(b.id, { name: b.name, abbr: b.abbr });
    }

    // Compute per-auditor asset count from all schedules
    const auditorAssets = new Map<string, number>();
    for (const s of (schedulesResult.results ?? []) as any[]) {
      const assets = s.total_assets ?? 0;
      if (s.auditor1_id) auditorAssets.set(s.auditor1_id, (auditorAssets.get(s.auditor1_id) ?? 0) + assets);
      if (s.auditor2_id) auditorAssets.set(s.auditor2_id, (auditorAssets.get(s.auditor2_id) ?? 0) + assets);
    }

    const schedules = (schedulesResult.results ?? []).map((s: any) => ({
      id: s.id,
      departmentId: s.department_id,
      departmentName: s.dept_name ?? '—',
      departmentAbbr: s.dept_abbr ?? '',
      locationId: s.location_id,
      locationName: s.loc_name ?? '—',
      buildingId: s.building_id ?? null,
      buildingName: s.building_id ? (buildingMap.get(s.building_id)?.name ?? null) : null,
      buildingAbbr: s.building_id ? (buildingMap.get(s.building_id)?.abbr ?? null) : null,
      level: s.level ?? null,
      totalAssets: s.total_assets ?? 0,
      supervisorId: s.supervisor_id,
      supervisorName: s.supervisor_id ? (userMap.get(s.supervisor_id)?.name ?? 'Unknown') : null,
      supervisorContact: s.supervisor_id ? (userMap.get(s.supervisor_id)?.contactNumber || s.loc_contact || '') : (s.loc_contact || ''),
      auditor1Id: s.auditor1_id,
      auditor1Name: s.auditor1_id ? (userMap.get(s.auditor1_id)?.name ?? 'Unknown') : null,
      auditor1Contact: s.auditor1_id ? (userMap.get(s.auditor1_id)?.contactNumber || '') : '',
      auditor2Id: s.auditor2_id,
      auditor2Name: s.auditor2_id ? (userMap.get(s.auditor2_id)?.name ?? 'Unknown') : null,
      auditor2Contact: s.auditor2_id ? (userMap.get(s.auditor2_id)?.contactNumber || '') : '',
      date: s.date,
      status: s.status,
      phaseId: s.phase_id,
      phaseName: s.phase_name ?? '—',
      phaseStart: s.start_date,
      phaseEnd: s.end_date,
      isLocked: s.is_locked === null ? undefined : (s.is_locked === 1),
    }));

    const users = (usersResult.results ?? []).map((u: any) => ({
      id: u.id,
      name: u.name,
      designation: u.designation,
      departmentId: u.department_id,
      roles: JSON.parse(u.roles || '["Staff"]'),
      certificationExpiry: u.certification_expiry ?? null,
      assetsAssigned: auditorAssets.get(u.id) ?? 0,
      contactNumber: u.contact_number ?? null,
    }));

    const phases = (phasesResult.results ?? []).map((p: any) => ({
      id: p.id,
      name: p.name,
      startDate: p.start_date,
      endDate: p.end_date,
      status: p.status,
    }));

    const buildings = (buildingsResult?.results ?? []).map((b: any) => ({
      id: b.id,
      name: b.name,
      abbr: b.abbr,
    }));

    let strategyStr = await c.env.SETTINGS.get('audit_strategy');
    if (!strategyStr) {
      // Fallback to D1 if KV is empty
      const dbRes = await c.env.DB.prepare('SELECT value FROM system_settings WHERE id = ?').bind('audit_strategy').first<{ value: string }>();
      if (dbRes?.value) strategyStr = dbRes.value;
    }
    const strategy = strategyStr ? JSON.parse(strategyStr) : {};
    const maxAssets = strategy.openAuditThreshold || 500;

    const mobilePayload = { schedules, users, phases, maxAssets, buildings };
    // Write to KV with 60 s TTL — any schedule PATCH immediately busts this entry
    await c.env.SETTINGS.put('mobile_cache', JSON.stringify(mobilePayload), { expirationTtl: 60 });
    c.header('Cache-Control', 'no-store');
    return c.json(mobilePayload);
  } catch (err: any) {
    console.error('[Public Mobile] Error:', err);
    return c.json({ schedules: [], users: [], phases: [], maxAssets: 500, buildings: [] });
  }
});

/**
 * PATCH /api/public/kiosk/schedules/:id
 *
 * Used by the Mobile app. Allows a user to self-assign to an audit slot as auditor1, auditor2 or supervisor.
 * Body: { userId: string, role: 'auditor1' | 'auditor2' | 'supervisor', date?: string | null }
 * The user must exist, be Active, and be verified. No auth token required (mobile mode).
 */
pub.patch('/kiosk/schedules/:id', async (c) => {
  const scheduleId = c.req.param('id');

  // Require SSO session
  const sessionUserId = await getMobileSession(c);
  if (!sessionUserId) return c.json({ error: 'Authentication required' }, 401);

  // Mobile is for certified officers only
  const certError = await assertCertifiedOfficer(c.env.DB, sessionUserId);
  if (certError) return c.json({ error: certError, code: 'NOT_CERTIFIED' }, 403);

  try {
    const body = await c.req.json() as { userId?: string; role?: string; date?: string | null; action?: 'assign' | 'unassign' };
    const { role, date, action = 'assign' } = body;

    // Mobile is self-assign only
    const userId = sessionUserId;

    // Get the schedule details
    const schedule = await c.env.DB.prepare(
      `SELECT department_id, date, auditor1_id, auditor2_id, supervisor_id, is_locked FROM audit_schedules WHERE id = ?`
    ).bind(scheduleId).first<{ department_id: string; date: string | null; auditor1_id: string | null; auditor2_id: string | null; supervisor_id: string | null; is_locked: number | null }>();

    if (!schedule) return c.json({ error: 'Schedule not found' }, 404);

    // Block kiosk re-assignments if the schedule is already manually locked
    const isLocked = schedule.is_locked === 1;
    if (isLocked) {
      return c.json({ error: 'ACTION BLOCKED: This audit is locked. Re-assignments can only be performed from the main site after unlocking.' }, 403);
    }

    if (action === 'assign') {
      if (!userId || !role) return c.json({ error: 'userId and role are required' }, 400);
      if (!['auditor1', 'auditor2', 'supervisor'].includes(role)) return c.json({ error: 'Invalid role' }, 400);
      // Supervisor assignment is managed from the main site only
      if (role === 'supervisor') return c.json({ error: 'Supervisor assignment must be done from the main site.' }, 403);

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
        console.error('[kiosk patch] Failed to fetch assignmentMode:', e);
      }

      // Verify user is active & verified and get their department & certificate status
      const user = await c.env.DB.prepare(
        `SELECT id, name, status, is_verified, department_id, certification_expiry FROM users WHERE id = ?`
      ).bind(userId).first<{ id: string; name: string; status: string; is_verified: number; department_id: string; certification_expiry: string | null }>();

      if (!user) return c.json({ error: 'User not found' }, 404);
      if (user.status !== 'Active') return c.json({ error: 'Only Active users can self-assign' }, 403);
      if (!user.is_verified) return c.json({ error: 'User account is not verified' }, 403);

      // Enforce department & certification rules for kiosk assignments
      if (role === 'supervisor') {
        if (user.department_id !== schedule.department_id) {
          return c.json({ error: 'Supervisors must belong to the department being audited' }, 403);
        }
      } else if (role === 'auditor1' || role === 'auditor2') {
        if (user.department_id === schedule.department_id) {
          return c.json({ error: 'Certified officers (auditors) cannot audit their own department' }, 403);
        }

        // Enforce valid institutional certification
        const todayStr = new Date().toISOString().split('T')[0];
        const certExpiry = user.certification_expiry;
        if (!certExpiry || certExpiry < todayStr) {
          return c.json({ error: 'ACTION BLOCKED: The selected inspecting officer must hold a valid, active certificate.' }, 403);
        }

        // Conflict of interest: auditor cannot also be the supervisor for this schedule
        const supervisorIds = schedule.supervisor_id ? schedule.supervisor_id.split(',').map((id: string) => id.trim()).filter(Boolean) : [];
        if (supervisorIds.includes(userId)) {
          return c.json({ error: 'Conflict of interest: you are a designated site supervisor for this location and cannot act as its inspector.' }, 409);
        }

        // Check for cross-audit permission if in cross-audit mode
        if (assignmentMode === 'cross-audit') {
          // Fetch target department's exemption status (Internal Audit Mode)
          const targetDept = await c.env.DB.prepare(
            'SELECT is_exempted FROM departments WHERE id = ?'
          ).bind(schedule.department_id).first<{ is_exempted: number }>();
          const isInternalAuditMode = targetDept?.is_exempted === 1;

          if (!(isInternalAuditMode && user.department_id === schedule.department_id)) {
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
              .bind(user.department_id, schedule.department_id)
              .first<{ id: string }>();

            if (!perm) {
              return c.json({ error: "Conflict of interest: no active cross-audit permission exists between the auditor's department and the target department" }, 403);
            }
          }
        }
      }

      const colMap: Record<string, string> = { auditor1: 'auditor1_id', auditor2: 'auditor2_id', supervisor: 'supervisor_id' };
      const col = colMap[role];

      const updates: string[] = [`${col} = ?`];
      const values: any[] = [userId];

      if (date !== undefined) {
        // Prevent date updates/unlocks from the kiosk if a date is already set
        const existingDate = await c.env.DB.prepare(
          'SELECT date FROM audit_schedules WHERE id = ?'
        ).bind(scheduleId).first<{ date: string | null }>();

        if (existingDate && existingDate.date !== null && existingDate.date !== date) {
          return c.json({ error: 'ACTION BLOCKED: Dates can only be modified or unlocked from the main site by an Admin, Supervisor, or Asset Coordinator.' }, 403);
        }

        updates.push('date = ?');
        values.push(date);
        
        if (date) {
          const matchingPhase = await c.env.DB.prepare(
            'SELECT id FROM audit_phases WHERE start_date <= ? AND end_date >= ? LIMIT 1'
          ).bind(date, date).first<{ id: string }>();
          if (matchingPhase) {
            updates.push('phase_id = ?');
            values.push(matchingPhase.id);
          }
        }
      }

      // Atomic self-assign: the WHERE guard on the slot column ensures that two
      // concurrent requests cannot both succeed — only the first writer wins.
      // meta.changes === 0 means the slot was taken between validation and write.
      const assignResult = await c.env.DB.prepare(
        `UPDATE audit_schedules SET ${updates.join(', ')} WHERE id = ? AND (${col} IS NULL OR ${col} = ?)`
      ).bind(...values, scheduleId, userId).run();

      if (assignResult.meta.changes === 0) {
        return c.json({ error: 'RACE CONDITION DETECTED: This slot was just taken by another user. Please refresh your view to see the latest assignments.' }, 409);
      }

      // Auto-activation check (Pending -> Awaiting Approval once assignments are complete)
      const updatedSchedule = await c.env.DB.prepare(
        'SELECT status, date, supervisor_id, auditor1_id, auditor2_id FROM audit_schedules WHERE id = ?'
      ).bind(scheduleId).first<{ status: string; date: string | null; supervisor_id: string | null; auditor1_id: string | null; auditor2_id: string | null }>();

      if (updatedSchedule) {
        if (updatedSchedule.status === 'Pending') {
          if (updatedSchedule.date && updatedSchedule.supervisor_id && updatedSchedule.auditor1_id && updatedSchedule.auditor2_id) {
            await c.env.DB.prepare(
              "UPDATE audit_schedules SET status = 'Awaiting Approval' WHERE id = ?"
            ).bind(scheduleId).run();
          }
        } else if (updatedSchedule.status === 'In Progress' || updatedSchedule.status === 'Awaiting Approval') {
          if (!updatedSchedule.date || !updatedSchedule.supervisor_id || !updatedSchedule.auditor1_id || !updatedSchedule.auditor2_id) {
            await c.env.DB.prepare(
              "UPDATE audit_schedules SET status = 'Pending' WHERE id = ?"
            ).bind(scheduleId).run();
          }
        }
      }

      // Bust the mobile cache so the next poll reflects the new assignment
      await c.env.SETTINGS.delete('mobile_cache');
      return c.json({ success: true, name: user.name });
    } else {
      // Unassign – mobile users can only remove their own assignment (supervisor slot blocked)
      if (!role) return c.json({ error: 'role is required' }, 400);
      if (role === 'supervisor') return c.json({ error: 'Supervisor assignment must be managed from the main site.' }, 403);
      const colMap: Record<string, string> = { auditor1: 'auditor1_id', auditor2: 'auditor2_id', supervisor: 'supervisor_id' };
      const col = colMap[role];
      if (!col) return c.json({ error: 'Invalid role' }, 400);

      const current = await c.env.DB.prepare(
        `SELECT ${col} AS assigned_id FROM audit_schedules WHERE id = ?`
      ).bind(scheduleId).first<{ assigned_id: string | null }>();
      if (current?.assigned_id !== sessionUserId) {
        return c.json({ error: 'You can only remove your own assignment' }, 403);
      }

      await c.env.DB.prepare(
        `UPDATE audit_schedules SET ${col} = NULL WHERE id = ?`
      ).bind(scheduleId).run();
      // Bust the mobile cache so the next poll reflects the removed assignment
      await c.env.SETTINGS.delete('mobile_cache');

      // Revert Awaiting Approval / In Progress -> Pending if any assignment is missing
      const remaining = await c.env.DB.prepare(
        `SELECT status, date, supervisor_id, auditor1_id, auditor2_id FROM audit_schedules WHERE id = ?`
      ).bind(scheduleId).first<{ status: string; date: string | null; supervisor_id: string | null; auditor1_id: string | null; auditor2_id: string | null }>();
      if (remaining && (remaining.status === 'In Progress' || remaining.status === 'Awaiting Approval')) {
        if (!remaining.date || !remaining.supervisor_id || !remaining.auditor1_id || !remaining.auditor2_id) {
          await c.env.DB.prepare(
            `UPDATE audit_schedules SET status = 'Pending' WHERE id = ?`
          ).bind(scheduleId).run();
          return c.json({ success: true, revertedToPending: true });
        }
      }

      return c.json({ success: true });
    }
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

/**
 * PATCH /api/public/kiosk/schedules/:id/date
 *
 * Public endpoint to update the audit date only.
 * Body: { date: string | null }
 */
pub.patch('/kiosk/schedules/:id/date', async (c) => {
  const sessionUserId = await getMobileSession(c);
  if (!sessionUserId) return c.json({ error: 'Authentication required' }, 401);

  // Mobile is for certified officers only
  const certError = await assertCertifiedOfficer(c.env.DB, sessionUserId);
  if (certError) return c.json({ error: certError, code: 'NOT_CERTIFIED' }, 403);

  const scheduleId = c.req.param('id');
  try {
    const { date } = await c.req.json() as { date: string | null };

    // Prevent date updates/unlocks from the kiosk if a date is already set
    const existing = await c.env.DB.prepare(
      'SELECT date, auditor1_id, auditor2_id, is_locked FROM audit_schedules WHERE id = ?'
    ).bind(scheduleId).first<{ date: string | null; auditor1_id: string | null; auditor2_id: string | null; is_locked: number | null }>();

    const isLocked = existing && (existing.is_locked === 0 ? false : !!(existing.is_locked || (existing.date && existing.auditor1_id && existing.auditor2_id)));
    if (isLocked) {
      return c.json({ error: 'ACTION BLOCKED: This audit is locked. Dates can only be modified or unlocked from the main site after unlocking.' }, 403);
    }
    
    let phaseId: string | null = null;
    if (date) {
      const matchingPhase = await c.env.DB.prepare(
        'SELECT id FROM audit_phases WHERE start_date <= ? AND end_date >= ? LIMIT 1'
      ).bind(date, date).first<{ id: string }>();
      if (matchingPhase) {
        phaseId = matchingPhase.id;
      }
    }

    if (phaseId) {
      await c.env.DB.prepare(
        `UPDATE audit_schedules SET date = ?, phase_id = ? WHERE id = ?`
      ).bind(date, phaseId, scheduleId).run();
    } else {
      await c.env.DB.prepare(
        `UPDATE audit_schedules SET date = ? WHERE id = ?`
      ).bind(date ?? null, scheduleId).run();
    }

    // Auto-activation check (Pending -> Awaiting Approval once assignments are complete)
    const updatedSchedule = await c.env.DB.prepare(
      'SELECT status, date, supervisor_id, auditor1_id, auditor2_id FROM audit_schedules WHERE id = ?'
    ).bind(scheduleId).first<{ status: string; date: string | null; supervisor_id: string | null; auditor1_id: string | null; auditor2_id: string | null }>();

    if (updatedSchedule) {
      if (updatedSchedule.status === 'Pending') {
        if (updatedSchedule.date && updatedSchedule.supervisor_id && updatedSchedule.auditor1_id && updatedSchedule.auditor2_id) {
          await c.env.DB.prepare(
            "UPDATE audit_schedules SET status = 'Awaiting Approval' WHERE id = ?"
          ).bind(scheduleId).run();
        }
      } else if (updatedSchedule.status === 'In Progress' || updatedSchedule.status === 'Awaiting Approval') {
        if (!updatedSchedule.date || !updatedSchedule.supervisor_id || !updatedSchedule.auditor1_id || !updatedSchedule.auditor2_id) {
          await c.env.DB.prepare(
            "UPDATE audit_schedules SET status = 'Pending' WHERE id = ?"
          ).bind(scheduleId).run();
        }
      }
    }

    // Bust the mobile cache so the next poll reflects the updated date
    await c.env.SETTINGS.delete('mobile_cache');
    return c.json({ success: true });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

/**
 * GET /api/public/stats
 *
 * Unauthenticated endpoint that returns aggregated stats for the landing page.
 * Responses are edge-cached by Cloudflare for 5 minutes (300 s) so D1 is
 * queried at most once per 5 minutes regardless of traffic — zero auth overhead,
 * negligible Worker CPU cost.
 */
pub.get('/stats', async (c) => {
  try {
    const db = c.env.DB;

    // Run all queries in parallel via D1 batch
    const [
      assetsRow,
      auditsRow,
      phasesResult,
      activitiesResult,
      deptAuditsResult,
    ] = await db.batch([
      // Total assets across all non-exempted departments
      db.prepare(`
        SELECT COALESCE(SUM(l.total_assets), 0) AS total 
        FROM locations l
        JOIN departments d ON l.department_id = d.id
      `),
      // Audit compliance counts
      db.prepare(`SELECT COUNT(*) AS total, SUM(CASE WHEN status = 'Completed' THEN 1 ELSE 0 END) AS completed FROM audit_schedules`),
      // All phases ordered by start date
      db.prepare(`SELECT id, name, start_date, end_date FROM audit_phases ORDER BY start_date ASC LIMIT 10`),
      // 5 most recent system activity messages (column is `timestamp`, not `created_at`)
      db.prepare(`SELECT type, message, timestamp FROM system_activities ORDER BY timestamp DESC LIMIT 5`),
      // Per-department audit compliance for top performers
      db.prepare(`
        SELECT d.name,
               COUNT(a.id)                                                         AS total,
               SUM(CASE WHEN a.status = 'Completed' THEN 1 ELSE 0 END)            AS completed,
               (SELECT COALESCE(SUM(l.total_assets), 0) FROM locations l WHERE l.department_id = d.id) AS real_total_assets
        FROM departments d
        LEFT JOIN audit_schedules a ON a.department_id = d.id
        WHERE d.is_exempted = 0 
        GROUP BY d.id, d.name
        HAVING total > 0 AND real_total_assets > 0
        ORDER BY (CAST(completed AS REAL) / total) DESC, total DESC
        LIMIT 3
      `),
    ]);

    const totalAssets = (assetsRow.results?.[0] as any)?.total ?? 0;

    const auditRow = auditsRow.results?.[0] as any;
    const totalAudits = auditRow?.total ?? 0;
    const completedAudits = auditRow?.completed ?? 0;
    const complianceProgress = totalAudits > 0 ? Math.round((completedAudits / totalAudits) * 100) : 0;

    const phases = (phasesResult.results ?? []).map((p: any) => ({
      id: p.id,
      name: p.name,
      startDate: p.start_date,
      endDate: p.end_date,
    }));

    const activities = (activitiesResult.results ?? []).map((a: any) => ({
      type: a.type,
      message: a.message,
      createdAt: a.timestamp,
    }));

    const topDepartments = (deptAuditsResult.results ?? []).map((d: any) => ({
      name: d.name,
      compliance: d.total > 0 ? Math.round((d.completed / d.total) * 100) : 0,
    }));

    // Edge cache: Cloudflare caches this response for 5 minutes across all
    // requests hitting the same CF datacenter, so D1 is rarely queried.
    c.header('Cache-Control', 'public, max-age=300, s-maxage=300');

    return c.json({
      totalAssets,
      totalPhases: phases.length,
      complianceProgress,
      phases,
      activities,
      topDepartments,
    });
  } catch (err: any) {
    console.error('[Public Stats] Error:', err);
    // Return empty payload so the landing page still renders gracefully
    return c.json({
      totalAssets: 0,
      totalPhases: 0,
      complianceProgress: 0,
      phases: [],
      activities: [],
      topDepartments: [],
    });
  }
});

/**
 * GET /api/public/kiosk-dashboard
 *
 * PUBLIC endpoint — no auth required. Returns full institutional dashboard
 * data for the kiosk display (kiosk.inspect-able.com).
 * Edge-cached for 60 seconds (matches kiosk polling interval).
 */
pub.get('/kiosk-dashboard', async (c) => {
  try {
    const db = c.env.DB;
    const [
      schedulesResult, usersResult, deptsResult, locsResult,
      phasesResult, buildingsResult, kpiTiersResult, kpiTargetsResult,
      instKpisResult,
    ] = await db.batch([
      db.prepare(`SELECT id, department_id, location_id, supervisor_id, auditor1_id, auditor2_id, date, status, phase_id, report_path, is_locked FROM audit_schedules ORDER BY date ASC`),
      db.prepare(`SELECT id, name, email, designation, department_id, roles, status, is_verified, certification_issued, certification_expiry, contact_number FROM users WHERE status = 'Active' ORDER BY name ASC`),
      db.prepare(`SELECT id, name, abbr, head_of_dept_id, description, audit_group_id, is_exempted, is_archived, tier, is_task_force FROM departments ORDER BY name ASC`),
      db.prepare(`SELECT id, name, abbr, department_id, building_id, level, description, supervisor_id, contact, total_assets, status FROM locations ORDER BY name ASC`),
      db.prepare(`SELECT id, name, start_date, end_date, description, status FROM audit_phases ORDER BY start_date ASC`),
      db.prepare(`SELECT id, name, abbr, description, type FROM buildings ORDER BY name ASC`),
      db.prepare(`SELECT id, name, min_assets FROM kpi_tiers ORDER BY name ASC`),
      db.prepare(`SELECT id, tier_id, phase_id, target_percentage FROM kpi_tier_targets`),
      db.prepare(`SELECT phase_id, target_percentage FROM institution_kpi_targets`),
    ]);

    // Map helpers
    const mapSchedule = (r: any) => ({
      id: r.id, departmentId: r.department_id, locationId: r.location_id,
      supervisorId: r.supervisor_id, auditor1Id: r.auditor1_id, auditor2Id: r.auditor2_id,
      date: r.date, status: r.status, phaseId: r.phase_id,
      reportPath: r.report_path, isLocked: r.is_locked === null ? undefined : (r.is_locked === 1),
    });

    const mapUser = (r: any) => ({
      id: r.id, name: r.name, email: r.email, designation: r.designation,
      departmentId: r.department_id, roles: typeof r.roles === 'string' ? JSON.parse(r.roles) : (r.roles || ['Staff']),
      status: r.status, isVerified: r.is_verified === 1,
      certificationIssued: r.certification_issued, certificationExpiry: r.certification_expiry,
      contactNumber: r.contact_number,
    });

    const mapDept = (r: any) => ({
      id: r.id, name: r.name, abbr: r.abbr, headOfDeptId: r.head_of_dept_id,
      description: r.description || '', auditGroupId: r.audit_group_id,
      isExempted: r.is_exempted === 1, isArchived: r.is_archived === 1,
      tier: r.tier, isTaskForce: r.is_task_force === 1,
    });

    const mapLoc = (r: any) => ({
      id: r.id, name: r.name, abbr: r.abbr, departmentId: r.department_id,
      buildingId: r.building_id, building: '', level: r.level,
      description: r.description || '', supervisorId: r.supervisor_id,
      contact: r.contact || '', totalAssets: r.total_assets, status: r.status,
    });

    const mapPhase = (r: any) => ({
      id: r.id, name: r.name, startDate: r.start_date, endDate: r.end_date,
      description: r.description, status: r.status,
    });

    const mapBuilding = (r: any) => ({
      id: r.id, name: r.name, abbr: r.abbr, description: r.description, type: r.type,
    });

    const mapKPITier = (r: any) => ({ id: r.id, name: r.name, minAssets: r.min_assets });
    const mapKPITierTarget = (r: any) => ({ id: r.id, tierId: r.tier_id, phaseId: r.phase_id, targetPercentage: r.target_percentage });
    const mapInstKPI = (r: any) => ({ id: r.phase_id, phaseId: r.phase_id, targetPercentage: r.target_percentage });

    c.header('Cache-Control', 'public, max-age=60, s-maxage=60');
    return c.json({
      schedules: (schedulesResult.results ?? []).map(mapSchedule),
      users: (usersResult.results ?? []).map(mapUser),
      departments: (deptsResult.results ?? []).map(mapDept),
      locations: (locsResult.results ?? []).map(mapLoc),
      phases: (phasesResult.results ?? []).map(mapPhase),
      buildings: (buildingsResult.results ?? []).map(mapBuilding),
      kpiTiers: (kpiTiersResult.results ?? []).map(mapKPITier),
      kpiTierTargets: (kpiTargetsResult.results ?? []).map(mapKPITierTarget),
      institutionKPIs: (instKpisResult.results ?? []).map(mapInstKPI),
      activities: [], // removed from kiosk — system_activities query dropped
    });
  } catch (err: any) {
    console.error('[Kiosk Dashboard] Error:', err);
    return c.json({ error: 'Failed to load dashboard data' }, 500);
  }
});

pub.get('/branding', async (c) => {
  try {
    let brandingVal = await c.env.SETTINGS.get('branding');
    if (!brandingVal) {
      const res = await c.env.DB.prepare('SELECT value FROM system_settings WHERE id = ?').bind('branding').first<{ value: string }>();
      if (res?.value) {
        brandingVal = res.value;
      }
    }
    const branding = brandingVal ? JSON.parse(brandingVal) : null;
    return c.json({ branding });
  } catch (err: any) {
    return c.json({ branding: null });
  }
});

export { pub as publicRoutes };
