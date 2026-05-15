import { Hono } from 'hono';
import { Bindings, Variables } from '../types';

const pub = new Hono<{ Bindings: Bindings; Variables: Variables }>();

/**
 * GET /api/public/kiosk
 *
 * Returns all audit schedules enriched with department, location, phase,
 * and auditor/supervisor display names. Also returns all active users
 * (for the searchable assignment combobox) and phases. No auth required.
 */
pub.get('/kiosk', async (c) => {
  try {
    const db = c.env.DB;

    const [schedulesResult, usersResult, deptsResult, locsResult, phasesResult] = await db.batch([
      db.prepare(`
        SELECT s.id, s.department_id, s.location_id, s.supervisor_id,
               s.auditor1_id, s.auditor2_id, s.date, s.status, s.phase_id,
               d.name AS dept_name, d.abbr AS dept_abbr,
               l.name AS loc_name, l.total_assets,
               p.name AS phase_name, p.start_date, p.end_date
        FROM audit_schedules s
        LEFT JOIN departments d ON s.department_id = d.id
        LEFT JOIN locations l ON s.location_id = l.id
        LEFT JOIN audit_phases p ON s.phase_id = p.id
        ORDER BY s.date ASC, dept_name ASC
      `),
      db.prepare(`
        SELECT id, name, designation, department_id, roles, status, is_verified,
               certification_issued, certification_expiry
        FROM users
        WHERE status = 'Active' AND is_verified = 1
        ORDER BY name ASC
      `),
      db.prepare(`SELECT id, name, abbr FROM departments ORDER BY name ASC`),
      db.prepare(`SELECT id, name, total_assets FROM locations`),
      db.prepare(`SELECT id, name, start_date, end_date, status FROM audit_phases ORDER BY start_date ASC`),
    ]);

    // Build a lookup map for user names
    const userMap = new Map<string, { name: string; designation: string | null; departmentId: string | null; roles: string[]; certExpiry: string | null }>();
    for (const u of (usersResult.results ?? []) as any[]) {
      userMap.set(u.id, {
        name: u.name,
        designation: u.designation,
        departmentId: u.department_id,
        roles: JSON.parse(u.roles || '["Staff"]'),
        certExpiry: u.certification_expiry ?? null,
      });
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
      totalAssets: s.total_assets ?? 0,
      supervisorId: s.supervisor_id,
      supervisorName: s.supervisor_id ? (userMap.get(s.supervisor_id)?.name ?? 'Unknown') : null,
      auditor1Id: s.auditor1_id,
      auditor1Name: s.auditor1_id ? (userMap.get(s.auditor1_id)?.name ?? 'Unknown') : null,
      auditor2Id: s.auditor2_id,
      auditor2Name: s.auditor2_id ? (userMap.get(s.auditor2_id)?.name ?? 'Unknown') : null,
      date: s.date,
      status: s.status,
      phaseId: s.phase_id,
      phaseName: s.phase_name ?? '—',
      phaseStart: s.start_date,
      phaseEnd: s.end_date,
    }));

    const users = (usersResult.results ?? []).map((u: any) => ({
      id: u.id,
      name: u.name,
      designation: u.designation,
      departmentId: u.department_id,
      roles: JSON.parse(u.roles || '["Staff"]'),
      certificationExpiry: u.certification_expiry ?? null,
      assetsAssigned: auditorAssets.get(u.id) ?? 0,
    }));

    const phases = (phasesResult.results ?? []).map((p: any) => ({
      id: p.id,
      name: p.name,
      startDate: p.start_date,
      endDate: p.end_date,
      status: p.status,
    }));

    let strategyStr = await c.env.SETTINGS.get('audit_strategy');
    if (!strategyStr) {
      // Fallback to D1 if KV is empty
      const dbRes = await c.env.DB.prepare('SELECT value FROM system_settings WHERE id = ?').bind('audit_strategy').first<{ value: string }>();
      if (dbRes?.value) strategyStr = dbRes.value;
    }
    const strategy = strategyStr ? JSON.parse(strategyStr) : {};
    const maxAssets = strategy.openAuditThreshold || 500;

    c.header('Cache-Control', 'no-store');
    return c.json({ schedules, users, phases, maxAssets });
  } catch (err: any) {
    console.error('[Public Kiosk] Error:', err);
    return c.json({ schedules: [], users: [], phases: [], maxAssets: 500 });
  }
});

/**
 * PATCH /api/public/kiosk/schedules/:id
 *
 * Allows a user to self-assign to an audit slot as auditor1, auditor2 or supervisor.
 * Body: { userId: string, role: 'auditor1' | 'auditor2' | 'supervisor', date?: string | null }
 * The user must exist, be Active, and be verified. No auth token required (kiosk mode).
 */
pub.patch('/kiosk/schedules/:id', async (c) => {
  const scheduleId = c.req.param('id');
  try {
    const body = await c.req.json() as { userId?: string; role?: string; date?: string | null; action?: 'assign' | 'unassign' };
    const { userId, role, date, action = 'assign' } = body;

    if (action === 'assign') {
      if (!userId || !role) return c.json({ error: 'userId and role are required' }, 400);
      if (!['auditor1', 'auditor2', 'supervisor'].includes(role)) return c.json({ error: 'Invalid role' }, 400);

      // Verify user is active & verified
      const user = await c.env.DB.prepare(
        `SELECT id, name, status, is_verified FROM users WHERE id = ?`
      ).bind(userId).first<{ id: string; name: string; status: string; is_verified: number }>();

      if (!user) return c.json({ error: 'User not found' }, 404);
      if (user.status !== 'Active') return c.json({ error: 'Only Active users can self-assign' }, 403);
      if (!user.is_verified) return c.json({ error: 'User account is not verified' }, 403);

      const colMap: Record<string, string> = { auditor1: 'auditor1_id', auditor2: 'auditor2_id', supervisor: 'supervisor_id' };
      const col = colMap[role];

      const updates: string[] = [`${col} = ?`];
      const values: any[] = [userId];

      if (date !== undefined) {
        updates.push('date = ?');
        values.push(date);
      }

      await c.env.DB.prepare(
        `UPDATE audit_schedules SET ${updates.join(', ')} WHERE id = ?`
      ).bind(...values, scheduleId).run();

      return c.json({ success: true, name: user.name });
    } else {
      // Unassign
      if (!role) return c.json({ error: 'role is required' }, 400);
      const colMap: Record<string, string> = { auditor1: 'auditor1_id', auditor2: 'auditor2_id', supervisor: 'supervisor_id' };
      const col = colMap[role];
      if (!col) return c.json({ error: 'Invalid role' }, 400);

      await c.env.DB.prepare(
        `UPDATE audit_schedules SET ${col} = NULL WHERE id = ?`
      ).bind(scheduleId).run();

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
  const scheduleId = c.req.param('id');
  try {
    const { date } = await c.req.json() as { date: string | null };
    await c.env.DB.prepare(
      `UPDATE audit_schedules SET date = ? WHERE id = ?`
    ).bind(date ?? null, scheduleId).run();
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

export { pub as publicRoutes };
