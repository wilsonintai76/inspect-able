import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { Bindings, Variables } from '../types';
import { requirePolicy, emptyContextBuilder } from '../middleware/pbac';
import { sendSupervisorApprovalEmail } from '../services/emailService';
import { hashPassword } from '../services/authService';
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
// Departments
router.get('/departments', async (c) => {
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
router.post('/departments/refresh', requirePolicy('department.manage', emptyContextBuilder()), async (c) => {
  try {
    await refreshDepartmentAssetTotals(c.env.DB);
    return c.json({ success: true });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

router.post('/departments', requirePolicy('department.manage', emptyContextBuilder()), async (c) => {
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

router.patch('/departments/:id', requirePolicy('department.manage', emptyContextBuilder()), async (c) => {
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
      // Restoring â€” clear audit trail
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

router.delete('/departments/:id', requirePolicy('department.manage', emptyContextBuilder()), async (c) => {
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

router.delete('/departments/:id/purge', requirePolicy('data.purge', emptyContextBuilder()), async (c) => {
  const id = c.req.param('id');
  try {
    // Only allow purge if already archived
    const row = await c.env.DB.prepare('SELECT is_archived FROM departments WHERE id = ? LIMIT 1').bind(id).first<{ is_archived: number }>();
    if (!row) return c.json({ error: 'Not found' }, 404);
    if (row.is_archived !== 1) return c.json({ error: 'Department must be archived before purging' }, 400);
    // Orphan locations (clear dept link) rather than cascade-deleting them
    await c.env.DB.prepare('UPDATE locations SET department_id = NULL WHERE department_id = ?').bind(id).run();
    // Delete orphaned non-completed audits for the orphaned locations
    await c.env.DB.prepare(
      `DELETE FROM audit_schedules WHERE location_id IN (SELECT id FROM locations WHERE department_id IS NULL) AND status != 'Completed'`
    ).run();
    await c.env.DB.prepare('DELETE FROM departments WHERE id = ?').bind(id).run();
    await refreshDepartmentAssetTotals(c.env.DB);
    invalidateScheduleCache(c.env.SETTINGS);
    return c.json({ success: true });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

router.delete('/departments/:id/force', requirePolicy('system.reset', emptyContextBuilder()), async (c) => {
  const id = c.req.param('id');
  try {
    // Orphan locations and clean up their non-completed audits
    await c.env.DB.prepare(
      `DELETE FROM audit_schedules WHERE location_id IN (SELECT id FROM locations WHERE department_id = ?) AND status != 'Completed'`
    ).bind(id).run();
    await c.env.DB.prepare('UPDATE locations SET department_id = NULL WHERE department_id = ?').bind(id).run();
    await c.env.DB.prepare('DELETE FROM departments WHERE id = ?').bind(id).run();
    await refreshDepartmentAssetTotals(c.env.DB);
    invalidateScheduleCache(c.env.SETTINGS);
    return c.json({ success: true });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// â”€â”€â”€ RESET DEPARTMENTS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Deletes ALL departments, locations, and schedules. MAINTAINS users.
router.post('/departments/clear', requirePolicy('system.reset', emptyContextBuilder()), async (c) => {
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

    // Departments are the root â€” clearing them effectively resets the hierarchy
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

export { router };