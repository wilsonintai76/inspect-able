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

router.get('/locations/duplicates', requirePolicy('system.admin', emptyContextBuilder()), async (c) => {
  try {
    const { results: duplicates } = await c.env.DB.prepare(`
      SELECT LOWER(TRIM(name)) as normalized_name, COUNT(*) as count 
      FROM locations 
      WHERE status != 'Archived' 
      GROUP BY normalized_name 
      HAVING count > 1
    `).all();

    if (!duplicates || duplicates.length === 0) {
      return c.json([]);
    }

    const duplicateNames = duplicates.map((d: any) => d.normalized_name);
    const placeholders = duplicateNames.map(() => '?').join(',');
    
    const { results: locations } = await c.env.DB.prepare(`
      SELECT l.*, d.name as department_name, b.name as building_name
      FROM locations l
      LEFT JOIN departments d ON l.department_id = d.id
      LEFT JOIN buildings b ON l.building_id = b.id
      WHERE LOWER(TRIM(l.name)) IN (${placeholders})
      AND l.status != 'Archived'
      ORDER BY LOWER(TRIM(l.name)), d.name
    `).bind(...duplicateNames).all();

    const grouped = duplicateNames.map((name: string) => {
      const locs = locations.filter((l: any) => l.name.toLowerCase().trim() === name);
      return {
        name: locs[0]?.name || name,
        locations: locs.map((l: any) => ({
          id: l.id,
          name: l.name,
          departmentId: l.department_id,
          departmentName: l.department_name,
          buildingName: l.building_name,
          totalAssets: l.total_assets || 0,
          uninspectedAssetCount: l.uninspected_asset_count || 0,
          status: l.status
        }))
      };
    });

    return c.json(grouped);
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

router.post('/locations', requirePolicy('location.manage', emptyContextBuilder()), async (c) => {
  const loc = await c.req.json();
  const id = loc.id || crypto.randomUUID();
  const caller = c.get('user');
  const callerRoles: string[] = caller?.roles || [];
  const callerCaps = deriveCapabilities({ id: caller?.id || '', email: caller?.email || '', role: caller?.role || '', roles: callerRoles, departmentId: caller?.departmentId || null, certificationExpiry: caller?.certificationExpiry || null, qualifications: caller?.qualifications || [] });
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
    // Auto-generate audit schedule for the new location (unscheduled — no phase pre-assigned)
    if (loc.departmentId) {
      await c.env.DB.prepare(
        `INSERT OR IGNORE INTO audit_schedules (id, department_id, location_id, supervisor_id, status, phase_id) VALUES (?, ?, ?, ?, 'Pending', NULL)`
      ).bind(crypto.randomUUID(), loc.departmentId, id, loc.supervisorId || null).run();
      invalidateScheduleCache(c.env.SETTINGS);
    }

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
  const callerCaps = deriveCapabilities({ id: caller?.id || '', email: caller?.email || '', role: caller?.role || '', roles: caller?.roles || [], departmentId: caller?.departmentId || null, certificationExpiry: caller?.certificationExpiry || null, qualifications: caller?.qualifications || [] });
  const isAdmin = callerCaps.has('system:admin') || caller?.email?.toLowerCase() === 'admin@poliku.edu.my';
  const isCoordinator = callerCaps.has('manage:departments') && !isAdmin;
  const isSupervisor = callerCaps.has('manage:locations') && !callerCaps.has('manage:departments') && !isAdmin;

  if (!isAdmin && !isCoordinator && !isSupervisor) {
    return c.json({ error: 'Forbidden: you must be an administrator, coordinator, or supervisor to edit locations.' }, 403);
  }

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
  // Supervisors may only edit locations in their own department
  if (!isAdmin && isSupervisor) {
    const existing = await c.env.DB.prepare('SELECT department_id FROM locations WHERE id = ? LIMIT 1').bind(id).first<{ department_id: string }>();
    if (!existing) return c.json({ error: 'Location not found' }, 404);
    if (existing.department_id !== caller?.departmentId) {
      return c.json({ error: 'Supervisors can only edit locations in their own department' }, 403);
    }
    // Supervisors cannot archive, restore, or change department
    if (updates.status !== undefined) {
      return c.json({ error: 'Supervisors cannot archive or restore locations' }, 403);
    }
    if (updates.departmentId !== undefined) {
      return c.json({ error: 'Supervisors cannot re-assign a location to a different department' }, 403);
    }
    // Supervisors can only update: buildingId, level, totalAssets, contact
    const allowedFields = ['buildingId', 'level', 'totalAssets', 'contact', 'uninspectedAssetCount', 'supervisorId'];
    const disallowed = Object.keys(updates).filter(k => !allowedFields.includes(k) && k !== 'building');
    if (disallowed.length > 0) {
      return c.json({ error: `Supervisors cannot modify: ${disallowed.join(', ')}` }, 403);
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
    console.error('[PATCH /locations/:id] Error:', err?.message, err);
    return c.json({ error: err?.message || 'Internal server error updating location' }, 500);
  }
});

router.delete('/locations/:id', requirePolicy('location.manage', emptyContextBuilder()), async (c) => {
  const id = c.req.param('id');
  const caller = c.get('user');
  const callerCaps = deriveCapabilities({ id: caller?.id || '', email: caller?.email || '', role: caller?.role || '', roles: caller?.roles || [], departmentId: caller?.departmentId || null, certificationExpiry: caller?.certificationExpiry || null, qualifications: caller?.qualifications || [] });
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
    // Build a safe archived_by string (cap at 200 chars to avoid bind issues)
    const archivedBy = caller
      ? (caller.email ? `${caller.name} (${caller.email})` : caller.name || 'Unknown')
      : 'Unknown';

    await c.env.DB.prepare(
      "UPDATE locations SET status = 'Archived', is_active = 0, archived_by = ?, archived_at = ? WHERE id = ?"
    ).bind(archivedBy.substring(0, 200), new Date().toISOString(), id).run();

    // Clean up non-completed audits for the archived location
    await cleanupAuditsForArchivedLocation(c.env.DB, id);
    invalidateScheduleCache(c.env.SETTINGS);

    // Refresh department asset totals
    await refreshDepartmentAssetTotals(c.env.DB);

    return c.json({ success: true });
  } catch (err: any) {
    console.error('[DELETE /locations/:id] Error:', err?.message, err);
    return c.json({ error: err?.message || 'Internal server error archiving location' }, 500);
  }
});

router.delete('/locations/:id/purge', requirePolicy('data.purge', emptyContextBuilder()), async (c) => {
  const id = c.req.param('id');
  try {
    const row = await c.env.DB.prepare("SELECT status FROM locations WHERE id = ? LIMIT 1").bind(id).first<{ status: string }>();
    if (!row) return c.json({ error: 'Not found' }, 404);
    if (row.status !== 'Archived') return c.json({ error: 'Location must be archived before purging' }, 400);
    await c.env.DB.prepare('DELETE FROM audit_reports WHERE audit_id IN (SELECT id FROM audit_schedules WHERE location_id = ?)').bind(id).run();
    await c.env.DB.prepare('DELETE FROM audit_schedules WHERE location_id = ?').bind(id).run();
    await c.env.DB.prepare('DELETE FROM location_mappings WHERE target_location_id = ?').bind(id).run();
    await c.env.DB.prepare('DELETE FROM locations WHERE id = ?').bind(id).run();
    await refreshDepartmentAssetTotals(c.env.DB);
    return c.json({ success: true });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

router.post('/locations/merge', requirePolicy('location.manage', emptyContextBuilder()), async (c) => {
  const { sourceIds, targetId } = await c.req.json() as { sourceIds: string[], targetId: string };
  if (!sourceIds || sourceIds.length === 0 || !targetId) {
    return c.json({ error: 'Source IDs and Target ID required' }, 400);
  }

  try {
    // 1. Get totals and names from sources and target
    const allIds = [...sourceIds, targetId];
    const placeholders = allIds.map(() => '?').join(',');
    const { results } = await c.env.DB.prepare(
      `SELECT id, name, description, total_assets, uninspected_asset_count, supervisor_id FROM locations WHERE id IN (${placeholders})`
    ).bind(...allIds).all();

    const locs = results as { id: string, name: string, description: string | null, total_assets: number, uninspected_asset_count: number, supervisor_id: string | null }[];
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
    const targetSchedule = await c.env.DB.prepare('SELECT id FROM audit_schedules WHERE location_id = ? LIMIT 1').bind(targetId).first<{ id: string }>();
    
    if (targetSchedule) {
      statements.push(c.env.DB.prepare(
        `UPDATE audit_reports SET audit_id = ? WHERE audit_id IN (SELECT id FROM audit_schedules WHERE location_id IN (${sourcePlaceholders}))`
      ).bind(targetSchedule.id, ...sourceIds));
    } else {
      // Unlikely edge case where target has no schedule: we must delete reports to avoid FK failure
      statements.push(c.env.DB.prepare(
        `DELETE FROM audit_reports WHERE audit_id IN (SELECT id FROM audit_schedules WHERE location_id IN (${sourcePlaceholders}))`
      ).bind(...sourceIds));
    }
    statements.push(c.env.DB.prepare(
      `DELETE FROM audit_schedules WHERE location_id IN (${sourcePlaceholders})`
    ).bind(...sourceIds));

    // 4. Update Mappings (so old sources now map to target)
    statements.push(c.env.DB.prepare(
      `UPDATE location_mappings SET target_location_id = ? WHERE target_location_id IN (${sourcePlaceholders})`
    ).bind(targetId, ...sourceIds));

    // 5. Delete Sources
    statements.push(c.env.DB.prepare(
      `DELETE FROM locations WHERE id IN (${sourcePlaceholders})`
    ).bind(...sourceIds));

    await c.env.DB.batch(statements);

    // Refresh department asset totals after merge
    await refreshDepartmentAssetTotals(c.env.DB);

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

router.delete('/locations/:id/force', requirePolicy('system.reset', emptyContextBuilder()), async (c) => {
  const id = c.req.param('id');
  try {
    await c.env.DB.prepare('DELETE FROM audit_reports WHERE audit_id IN (SELECT id FROM audit_schedules WHERE location_id = ?)').bind(id).run();
    await c.env.DB.prepare('DELETE FROM audit_schedules WHERE location_id = ?').bind(id).run();
    await c.env.DB.prepare('DELETE FROM location_mappings WHERE target_location_id = ?').bind(id).run();
    await c.env.DB.prepare('DELETE FROM locations WHERE id = ?').bind(id).run();
    await refreshDepartmentAssetTotals(c.env.DB);
    return c.json({ success: true });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// â”€â”€â”€ RESET LOCATIONS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Deletes ALL locations and consolidation groups. Keeps departments.
router.post('/locations/clear', requirePolicy('system.reset', emptyContextBuilder()), async (c) => {
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
    await refreshDepartmentAssetTotals(c.env.DB);

    return c.json({ success: true, message: 'Locations and groups cleared. Departments maintained.' });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

router.post('/locations/bulk', requirePolicy('location.manage', emptyContextBuilder()), async (c) => {
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
    const statements = processedLocs.flatMap((loc: any) => {
      const id = loc.id || crypto.randomUUID();
      const locInsert = c.env.DB.prepare(
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

      const stmts = [locInsert];
      if (loc.departmentId) {
        stmts.push(c.env.DB.prepare(
          `INSERT OR IGNORE INTO audit_schedules (id, department_id, location_id, supervisor_id, status, phase_id) VALUES (?, ?, ?, ?, 'Pending', NULL)`
        ).bind(crypto.randomUUID(), loc.departmentId, id, loc.supervisorId || null));
      }
      return stmts;
    });

    await c.env.DB.batch(statements);
    // Refresh department asset totals after bulk location insert
    await refreshDepartmentAssetTotals(c.env.DB);
    return c.json({ success: true, count: processedLocs.length, skipped });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

router.post('/locations/sync-notes', requirePolicy('location.manage', emptyContextBuilder()), async (c) => {
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

router.post('/locations/upsert', requirePolicy('location.manage', emptyContextBuilder()), async (c) => {
  const locs = await c.req.json();
  try {
    const activePhase = await c.env.DB.prepare(
      "SELECT id FROM audit_phases WHERE status = 'Active' ORDER BY start_date DESC LIMIT 1"
    ).first<{ id: string }>();

    const statements = locs.flatMap((l: any) => {
      const id = l.id || crypto.randomUUID();
      const locUpsert = c.env.DB.prepare(`
        INSERT INTO locations 
        (id, name, abbr, department_id, building_id, level, description, supervisor_id, contact, total_assets, uninspected_asset_count, is_active, status) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(name, department_id, level, building_id) DO UPDATE SET
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
      
      const stmts = [locUpsert];
      if (l.departmentId) {
        stmts.push(c.env.DB.prepare(
          `INSERT OR IGNORE INTO audit_schedules (id, department_id, location_id, supervisor_id, status, phase_id) VALUES (?, ?, ?, ?, 'Pending', NULL)`
        ).bind(crypto.randomUUID(), l.departmentId, id, l.supervisorId || null));
      }
      return stmts;
    });

    // D1 batch limit is 100 statements
    const CHUNK = 50;
    for (let i = 0; i < statements.length; i += CHUNK) {
      await c.env.DB.batch(statements.slice(i, i + CHUNK));
    }
    // Refresh department asset totals after upsert
    await refreshDepartmentAssetTotals(c.env.DB);
    
    return c.json({ success: true, count: locs.length });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

router.post('/locations/sync', requirePolicy('location.manage', emptyContextBuilder()), async (c) => {
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

    // Refresh department asset totals after sync
    await refreshDepartmentAssetTotals(c.env.DB);

    return c.json({ success: true, rulesApplied: mappings.length });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// Department Mappings

export { router };