import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { Bindings, Variables } from '../types';
import { requirePolicy, emptyContextBuilder } from '../middleware/pbac';
import { sendSupervisorApprovalEmail } from '../services/emailService';
import { hashPassword } from '../services/authService';
import { backupD1ToR2, cleanupOldBackups } from '../services/backupService';
import { 
  DEFAULT_USER_PASSWORD, getRolesForDesignation, logApprovalReminderActivity, invalidateScheduleCache,
  edgeCache, auditLockGuard, zeroAssetGuard, statusTransitionGuard, patchAuditPermissionGuard,
  auditSchema, patchAuditSchema, userSchema, patchUserSchema
} from './db.shared';
import { 
  unassignExpiredAuditors, handleLocationDepartmentTransfer, refreshDepartmentAssetTotals,
  unassignSpecificAuditorFromFutureAudits, cleanupAuditsForArchivedLocation
} from '../services/auditMaintenanceService';
import { auditAssignmentGuard } from '../middleware/conflictOfInterest';

const router = new Hono<{ Bindings: Bindings, Variables: Variables }>();
// Audit Phases
router.get('/audit-phases', async (c) => {
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

router.post('/audit-phases', requirePolicy('phase.manage', emptyContextBuilder()), async (c) => {
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

router.patch('/audit-phases/:id', requirePolicy('phase.manage', emptyContextBuilder()), async (c) => {
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

router.delete('/audit-phases/:id', requirePolicy('phase.manage', emptyContextBuilder()), async (c) => {
  const id = c.req.param('id');
  try {
    await c.env.DB.prepare('DELETE FROM audit_phases WHERE id = ?').bind(id).run();
    return c.json({ success: true });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// KPI Tiers
router.get('/kpi-tiers', async (c) => {
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

router.post('/kpi-tiers', requirePolicy('kpi.manage', emptyContextBuilder()), async (c) => {
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

router.patch('/kpi-tiers/:id', requirePolicy('kpi.manage', emptyContextBuilder()), async (c) => {
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

router.delete('/kpi-tiers/:id', requirePolicy('kpi.manage', emptyContextBuilder()), async (c) => {
  const id = c.req.param('id');
  try {
    await c.env.DB.prepare('DELETE FROM kpi_tiers WHERE id = ?').bind(id).run();
    return c.json({ success: true });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// KPI Tier Targets
router.get('/kpi-tier-targets', async (c) => {
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

router.post('/kpi-tier-targets', requirePolicy('kpi.manage', emptyContextBuilder()), async (c) => {
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

router.delete('/kpi-tier-targets/:id', requirePolicy('kpi.manage', emptyContextBuilder()), async (c) => {
  const id = c.req.param('id');
  try {
    await c.env.DB.prepare('DELETE FROM kpi_tier_targets WHERE id = ?').bind(id).run();
    return c.json({ success: true });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// Audit Groups
router.get('/audit-groups', async (c) => {
  try {
    const { results } = await c.env.DB.prepare('SELECT * FROM audit_groups').all();
    return c.json(results);
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

router.post('/audit-groups', requirePolicy('group.manage', emptyContextBuilder()), async (c) => {
  const group = await c.req.json();
  const id = group.id || crypto.randomUUID();
  try {
    await c.env.DB.prepare('INSERT INTO audit_groups (id, name, description) VALUES (?, ?, ?)').bind(id, group.name, group.description ?? null).run();
    return c.json({ id, ...group });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

router.patch('/audit-groups/:id', requirePolicy('group.manage', emptyContextBuilder()), async (c) => {
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

router.delete('/audit-groups/:id', requirePolicy('group.manage', emptyContextBuilder()), async (c) => {
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
router.get('/institution-kpi-targets', async (c) => {
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

router.post('/institution-kpi-targets', requirePolicy('kpi.manage', emptyContextBuilder()), async (c) => {
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

// â”€â”€â”€ Buildings â€” KV read-through cache â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

router.get('/buildings', async (c) => {
  try {
    return c.json(await buildingsFromKVorD1(c));
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

router.post('/buildings', requirePolicy('admin.manage', emptyContextBuilder()), zValidator('json', z.object({
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

router.patch('/buildings/:id', requirePolicy('admin.manage', emptyContextBuilder()), zValidator('json', z.object({
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

router.delete('/buildings/:id', requirePolicy('admin.manage', emptyContextBuilder()), async (c) => {
  const id = c.req.param('id');
  try {
    await c.env.DB.prepare('DELETE FROM buildings WHERE id = ?').bind(id).run();
    await c.env.SETTINGS.delete(KV_BUILDINGS).catch(() => {});
    return c.json({ success: true });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// System Settings (SQL version for persistence if KV is for volatile)
router.get('/system-settings', async (c) => {
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

router.post('/system-settings/:id', requirePolicy('system.settings', emptyContextBuilder()), async (c) => {
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
router.get('/activity', async (c) => {
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

router.post('/activity', async (c) => {
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

// â”€â”€â”€ Backup Routes â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

// POST /db/backup â€” manually trigger a D1â†’R2 backup (Admin only)
router.post('/backup', requirePolicy('system.settings', emptyContextBuilder()), async (c) => {
  try {
    const result = await backupD1ToR2({ db: c.env.DB, bucket: c.env.BACKUP });
    return c.json({ success: true, key: result.key, tablesSync: result.tablesSync, rowsSync: result.rowsSync, errors: result.errors });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// GET /db/backups â€” list all backup files in R2 (Admin only)
router.get('/backups', requirePolicy('system.settings', emptyContextBuilder()), async (c) => {
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
// DELETE /db/backups?key=backups/... — delete a specific backup file (Admin only)
router.delete('/backups', requirePolicy('system.settings', emptyContextBuilder()), async (c) => {
  const key = c.req.query('key');
  if (!key || !key.startsWith('backups/')) {
    return c.json({ error: 'Invalid key' }, 400);
  }
  try {
    await c.env.BACKUP.delete(key);
    return c.json({ success: true });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// POST /db/backups/cleanup — delete backups older than ?days= (default 7) (Admin only)
router.post('/backups/cleanup', requirePolicy('system.settings', emptyContextBuilder()), async (c) => {
  try {
    const days = parseInt(c.req.query('days') || '7', 10) || 7;
    const result = await cleanupOldBackups(c.env.BACKUP, days);
    return c.json({ success: true, ...result });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});
// GET /db/backups/download?key=backups/... â€” stream a backup file as download (Admin only)
router.get('/backups/download', requirePolicy('system.settings', emptyContextBuilder()), async (c) => {
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

// POST /db/backups/restore â€” restore D1 from uploaded JSON backup (Admin only)
router.post('/backups/restore', requirePolicy('system.settings', emptyContextBuilder()), async (c) => {
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

export { router };