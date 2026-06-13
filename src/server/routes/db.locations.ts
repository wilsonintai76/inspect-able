import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { Bindings, Variables } from '../types';
import { requirePolicy, emptyContextBuilder } from '../middleware/pbac';
import { deriveCapabilities } from '../utils/policyEngine';
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
// Locations
router.get('/locations', async (c) => {
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

router.post('/locations', requirePolicy('location.manage', emptyContextBuilder()), async (c) => {
  const loc = await c.req.json();
  const id = loc.id || crypto.randomUUID();
  const caller = c.get('user');
  const callerRoles: string[] = caller?.roles || [];
  const callerCaps = deriveCapabilities({ id: caller?.id || '', email: caller?.email || '', role: caller?.role || '', roles: callerRoles, departmentId: caller?.departmentId || null, certificationExpiry: caller?.certificationExpiry || null });
  const isAdmin = callerCaps.has('system:admin') || caller?.email?.toLowerCase() === 'admin@poliku.edu.my';
  const isCoordinator = callerCaps.has('manage:departments') && !isAdmin;
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
    // Refresh department asset totals after adding a new location
    await refreshDepartmentAssetTotals(c.env.DB);
    return c.json({ id, ...loc });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

router.patch('/locations/:id', requirePolicy('location.manage', emptyContextBuilder()), async (c) => {
  const id = c.req.param('id');
  const updates = await c.req.json();
  const caller = c.get('user');
  const callerCaps = deriveCapabilities({ id: caller?.id || '', email: caller?.email || '', role: caller?.role || '', roles: caller?.roles || [], departmentId: caller?.departmentId || null, certificationExpiry: caller?.certificationExpiry || null });
  const isAdmin = callerCaps.has('system:admin') || caller?.email?.toLowerCase() === 'admin@poliku.edu.my';
  const isCoordinator = callerCaps.has('manage:departments') && !isAdmin;
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
      fields.push('archived_by = ?'); values.push(caller ? (caller.email ? `${caller.name} (${caller.email})` : caller.name) : 'Unknown');
      fields.push('archived_at = ?'); values.push(new Date().toISOString());
    } else if (updates.status === 'Active') {
      fields.push('archived_by = ?'); values.push(null);
      fields.push('archived_at = ?'); values.push(null);
    }
  }

  if (fields.length === 0) return c.json({ success: true });

  try {
    // Snapshot: detect department transfer BEFORE applying the update
    const oldDeptId: string | null = updates.departmentId !== undefined
      ? ((await c.env.DB.prepare('SELECT department_id FROM locations WHERE id = ? LIMIT 1').bind(id).first<{ department_id: string }>())?.department_id ?? null)
      : null;
    const isDeptTransfer = updates.departmentId !== undefined && oldDeptId !== null && updates.departmentId !== oldDeptId;

    await c.env.DB.prepare(`UPDATE locations SET ${fields.join(', ')} WHERE id = ?`).bind(...values, id).run();
    if (updates.supervisorId !== undefined) {
      await c.env.DB.prepare('UPDATE audit_schedules SET supervisor_id = ? WHERE location_id = ?').bind(updates.supervisorId || null, id).run();
    }

    // â”€â”€â”€ Department Transfer: Repair schedules + enforce COI â”€â”€â”€
    if (isDeptTransfer) {
      await handleLocationDepartmentTransfer(c.env.DB, id, updates.departmentId!, oldDeptId!);
      invalidateScheduleCache(c.env.SETTINGS);
    }

    // ─── Archive Cleanup: Remove all non-completed audits for archived location ───
    if (updates.status === 'Archived') {
      await cleanupAuditsForArchivedLocation(c.env.DB, id);
      invalidateScheduleCache(c.env.SETTINGS);
    }

    // â”€â”€â”€ Refresh department asset totals after any location change â”€â”€â”€
    await refreshDepartmentAssetTotals(c.env.DB);

    return c.json({ success: true });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

router.delete('/locations/:id', requirePolicy('location.manage', emptyContextBuilder()), async (c) => {
  const id = c.req.param('id');
  const caller = c.get('user');
  const callerCaps = deriveCapabilities({ id: caller?.id || '', email: caller?.email || '', role: caller?.role || '', roles: caller?.roles || [], departmentId: caller?.departmentId || null, certificationExpiry: caller?.certificationExpiry || null });
  const isAdmin = callerCaps.has('system:admin') || caller?.email?.toLowerCase() === 'admin@poliku.edu.my';
  const isCoordinator = callerCaps.has('manage:departments') && !isAdmin;
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
    ).bind(caller ? (caller.email ? `${caller.name} (${caller.email})` : caller.name) : 'Unknown', new Date().toISOString(), id).run();
    // Refresh department asset totals after archiving a location
    await refreshDepartmentAssetTotals(c.env.DB);
    return c.json({ success: true });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

router.delete('/locations/:id/purge', requirePolicy('data.purge', emptyContextBuilder()), async (c) => {
  const id = c.req.param('id');
  try {
    const row = await c.env.DB.prepare("SELECT status FROM locations WHERE id = ? LIMIT 1").bind(id).first<{ status: string }>();
    if (!row) return c.json({ error: 'Not found' }, 404);
    if (row.status !== 'Archived') return c.json({ error: 'Location must be archived before purging' }, 400);
    await c.env.DB.prepare('DELETE FROM audit_schedules WHERE location_id = ?').bind(id).run();
    await c.env.DB.prepare('DELETE FROM locations WHERE id = ?').bind(id).run();
    await refreshDepartmentAssetTotals(c.env.DB);
    return c.json({ success: true });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

export { router };