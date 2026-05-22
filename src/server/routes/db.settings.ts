import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { Bindings, Variables } from '../types';
import { rbacGuard } from '../middleware/rbacGuard';
import { sendSupervisorApprovalEmail } from '../services/emailService';
import { hashPassword } from '../services/authService';
import { backupD1ToR2 } from '../services/backupService';
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

router.post('/audit-phases', rbacGuard('admin:hub'), async (c) => {
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

router.patch('/audit-phases/:id', rbacGuard('admin:hub'), async (c) => {
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

router.delete('/audit-phases/:id', rbacGuard('admin:hub'), async (c) => {
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

router.post('/kpi-tiers', rbacGuard('admin:hub'), async (c) => {
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

router.patch('/kpi-tiers/:id', rbacGuard('admin:hub'), async (c) => {
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

router.delete('/kpi-tiers/:id', rbacGuard('admin:hub'), async (c) => {
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

router.post('/kpi-tier-targets', rbacGuard('admin:hub'), async (c) => {
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

router.delete('/kpi-tier-targets/:id', rbacGuard('admin:hub'), async (c) => {
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

router.post('/audit-groups', rbacGuard('edit:team'), async (c) => {
  const group = await c.req.json();
  const id = group.id || crypto.randomUUID();
  try {
    await c.env.DB.prepare('INSERT INTO audit_groups (id, name, description) VALUES (?, ?, ?)').bind(id, group.name, group.description ?? null).run();
    return c.json({ id, ...group });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

router.patch('/audit-groups/:id', rbacGuard('edit:team'), async (c) => {
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

router.delete('/audit-groups/:id', rbacGuard('admin:hub'), async (c) => {
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

router.post('/institution-kpi-targets', rbacGuard('admin:hub'), async (c) => {
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

router.post('/buildings', rbacGuard('edit:team'), zValidator('json', z.object({
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

router.patch('/buildings/:id', rbacGuard('edit:team'), zValidator('json', z.object({
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

router.delete('/buildings/:id', rbacGuard('admin:hub'), async (c) => {
  const id = c.req.param('id');
  try {
    await c.env.DB.prepare('DELETE FROM buildings WHERE id = ?').bind(id).run();
    await c.env.SETTINGS.delete(KV_BUILDINGS).catch(() => {});
    return c.json({ success: true });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

router.post('/buildings/bulk', rbacGuard('admin:hub'), zValidator('json', z.array(z.object({
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

router.post('/system-settings/:id', rbacGuard('system:settings'), async (c) => {
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

// â”€â”€â”€ INITIALIZE DEFAULTS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Idempotently creates the 3 default audit phases, 3 KPI tiers, 9 tierÃ—phase
// targets, and 3 institution KPI targets in a single D1 batch.
// Called once after login (admin) or after a full reset. Uses INSERT OR IGNORE
// so it is safe to call repeatedly and will never duplicate rows.
router.post('/system/initialize-defaults', rbacGuard('admin:hub'), async (c) => {
  try {
    // 0. Schema migrations (idempotent â€” safe to call repeatedly)
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

    // 3. Rename legacy tier names (Tier 1â†’Small, etc.)
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

    // 4. Deduplicate tiers â€” keep first occurrence of each name, delete extras
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

    // 7. Ensure tierÃ—phase targets and institution KPI targets exist
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

// â”€â”€â”€ USERS CLEAR â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
router.post('/users/clear', rbacGuard('admin:hub'), async (c) => {
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

// â”€â”€â”€ AUDIT PHASES CLEAR â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
router.post('/audit-phases/clear', rbacGuard('admin:hub'), async (c) => {
  try {
    // audit_schedules has FK â†’ audit_phases
    await c.env.DB.prepare('DELETE FROM audit_schedules').run();
    // kpi_tier_targets has FK â†’ audit_phases
    await c.env.DB.prepare('DELETE FROM kpi_tier_targets').run();
    // institution_kpi_targets has FK â†’ audit_phases (phase_id)
    await c.env.DB.prepare('DELETE FROM institution_kpi_targets').run();
    await c.env.DB.prepare('DELETE FROM audit_phases').run();
    return c.json({ success: true });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// â”€â”€â”€ KPI CLEAR â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
router.post('/kpi/clear', rbacGuard('admin:hub'), async (c) => {
  try {
    // kpi_tier_targets has FK â†’ kpi_tiers
    await c.env.DB.prepare('DELETE FROM kpi_tier_targets').run();
    await c.env.DB.prepare('DELETE FROM institution_kpi_targets').run();
    await c.env.DB.prepare('DELETE FROM kpi_tiers').run();
    return c.json({ success: true });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// â”€â”€â”€ FULL SYSTEM RESET â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Wipes ALL operational data including phases, KPI, groups, and audit schedules.
// Keeps only the requesting admin user.
// Uses sequential individual DELETEs (not batch) so each table is independently
// committed. A batch() is atomic â€” if ANY statement fails the ENTIRE batch rolls
// back silently, which previously left departments intact.
router.post('/system/full-reset', rbacGuard('admin:hub'), async (c) => {
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

    // FK-safe deletion order â€” every child table before its parent.
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

// â”€â”€â”€ Backup Routes â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

// POST /db/backup â€” manually trigger a D1â†’R2 backup (Admin only)
router.post('/backup', rbacGuard('system:settings'), async (c) => {
  try {
    const result = await backupD1ToR2({ db: c.env.DB, bucket: c.env.BACKUP });
    return c.json({ success: true, key: result.key, tablesSync: result.tablesSync, rowsSync: result.rowsSync, errors: result.errors });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// GET /db/backups â€” list all backup files in R2 (Admin only)
router.get('/backups', rbacGuard('system:settings'), async (c) => {
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

// GET /db/backups/download?key=backups/... â€” stream a backup file as download (Admin only)
router.get('/backups/download', rbacGuard('system:settings'), async (c) => {
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
router.post('/backups/restore', rbacGuard('system:settings'), async (c) => {
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