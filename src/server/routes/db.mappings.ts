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
// Department Mappings
router.get('/department-mappings', async (c) => {
  try {
    const { results } = await c.env.DB.prepare('SELECT * FROM department_mappings').all();
    return c.json((results || []).map((m: any) => ({
      ...m,
      sourceName: m.source_name,
      targetDepartmentId: m.target_department_id
    })));
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

router.post('/department-mappings', requirePolicy('mapping.manage', emptyContextBuilder()), async (c) => {
  const mapping = await c.req.json();
  const id = mapping.id || crypto.randomUUID();
  try {
    await c.env.DB.prepare(
      'INSERT INTO department_mappings (id, source_name, target_department_id) VALUES (?, ?, ?) ON CONFLICT(source_name) DO UPDATE SET target_department_id=EXCLUDED.target_department_id'
    ).bind(id, mapping.sourceName, mapping.targetDepartmentId).run();
    return c.json({ id, ...mapping });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

router.post('/department-mappings/clear', requirePolicy('mapping.manage', emptyContextBuilder()), async (c) => {
  try {
    await c.env.DB.prepare('DELETE FROM department_mappings').run();
    return c.json({ success: true });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

router.delete('/department-mappings/:id', requirePolicy('mapping.manage', emptyContextBuilder()), async (c) => {
  const id = c.req.param('id');
  try {
    await c.env.DB.prepare('DELETE FROM department_mappings WHERE id = ?').bind(id).run();
    return c.json({ success: true });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// Location Mappings
router.get('/location-mappings', async (c) => {
  try {
    const { results } = await c.env.DB.prepare('SELECT * FROM location_mappings').all();
    return c.json((results || []).map((m: any) => ({
      ...m,
      sourceName: m.source_name,
      targetLocationId: m.target_location_id,
      createdAt: m.created_at
    })));
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

router.post('/location-mappings', requirePolicy('mapping.manage', emptyContextBuilder()), async (c) => {
  const mapping = await c.req.json();
  const id = mapping.id || crypto.randomUUID();
  try {
    await c.env.DB.prepare(
      'INSERT INTO location_mappings (id, source_name, target_location_id) VALUES (?, ?, ?) ON CONFLICT(source_name) DO UPDATE SET target_location_id=EXCLUDED.target_location_id'
    ).bind(id, mapping.sourceName, mapping.targetLocationId).run();
    return c.json({ id, ...mapping });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

router.delete('/location-mappings/:id', requirePolicy('mapping.manage', emptyContextBuilder()), async (c) => {
  const id = c.req.param('id');
  try {
    await c.env.DB.prepare('DELETE FROM location_mappings WHERE id = ?').bind(id).run();
    return c.json({ success: true });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// Permissions
router.get('/permissions', async (c) => {
  try {
    const { results } = await c.env.DB.prepare('SELECT * FROM cross_audit_permissions').all();
    return c.json((results || []).map((p: any) => ({
      id: p.id,
      auditorDeptId: p.auditor_dept_id,
      targetDeptId: p.target_dept_id,
      auditorGroupId: p.auditor_group_id,
      targetGroupId: p.target_group_id,
      isActive: p.is_active === 1,
      isMutual: p.is_mutual === 1
    })));
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

router.post('/permissions', async (c) => {
  const perm = await c.req.json();
  const id = perm.id || crypto.randomUUID();
  try {
    await c.env.DB.prepare(
      'INSERT INTO cross_audit_permissions (id, auditor_dept_id, target_dept_id, auditor_group_id, target_group_id, is_active, is_mutual) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).bind(id, perm.auditorDeptId ?? null, perm.targetDeptId ?? null, perm.auditorGroupId ?? null, perm.targetGroupId ?? null, perm.isActive ? 1 : 0, perm.isMutual ? 1 : 0).run();
    return c.json({ id, ...perm });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

router.post('/permissions/bulk', async (c) => {
  const perms = await c.req.json();
  try {
    const statements = perms.map((p: any) => {
      const id = p.id || crypto.randomUUID();
      return c.env.DB.prepare(
        'INSERT INTO cross_audit_permissions (id, auditor_dept_id, target_dept_id, auditor_group_id, target_group_id, is_active, is_mutual) VALUES (?, ?, ?, ?, ?, ?, ?)'
      ).bind(id, p.auditorDeptId ?? null, p.targetDeptId ?? null, p.auditorGroupId ?? null, p.targetGroupId ?? null, p.isActive ? 1 : 0, p.isMutual ? 1 : 0);
    });
    await c.env.DB.batch(statements);
    return c.json({ success: true, count: perms.length });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

router.delete('/permissions/:id', async (c) => {
  const id = c.req.param('id');
  try {
    await c.env.DB.prepare('DELETE FROM cross_audit_permissions WHERE id = ?').bind(id).run();
    return c.json({ success: true });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

router.delete('/permissions/bulk', async (c) => {
  const { ids } = await c.req.json();
  try {
    const placeholders = ids.map(() => '?').join(',');
    await c.env.DB.prepare(`DELETE FROM cross_audit_permissions WHERE id IN (${placeholders})`).bind(...ids).run();
    return c.json({ success: true });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

router.post('/permissions/reset-only', async (c) => {
  try {
    await c.env.DB.prepare('DELETE FROM cross_audit_permissions').run();
    return c.json({ success: true, message: 'All cross-audit assignments cleared' });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

router.post('/permissions/clear', requirePolicy('system.settings', emptyContextBuilder()), async (c) => {
  try {
    // SYNCHRONIZED RESET: Clear pairings AND groups/links (User Requirement)
    await c.env.DB.batch([
      c.env.DB.prepare('DELETE FROM cross_audit_permissions'),
      c.env.DB.prepare('UPDATE departments SET audit_group_id = NULL'),
      c.env.DB.prepare('DELETE FROM audit_groups')
    ]);
    return c.json({ success: true, message: 'All cross-audit assignments and audit groups cleared' });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

router.patch('/permissions/:id', async (c) => {
  const id = c.req.param('id');
  const updates = await c.req.json();
  const fields: string[] = [];
  const values: any[] = [];
  if (updates.auditorDeptId !== undefined) { fields.push('auditor_dept_id = ?'); values.push(updates.auditorDeptId); }
  if (updates.targetDeptId !== undefined) { fields.push('target_dept_id = ?'); values.push(updates.targetDeptId); }
  if (updates.auditorGroupId !== undefined) { fields.push('auditor_group_id = ?'); values.push(updates.auditorGroupId); }
  if (updates.targetGroupId !== undefined) { fields.push('target_group_id = ?'); values.push(updates.targetGroupId); }
  if (updates.isActive !== undefined) { fields.push('is_active = ?'); values.push(updates.isActive ? 1 : 0); }
  if (updates.isMutual !== undefined) { fields.push('is_mutual = ?'); values.push(updates.isMutual ? 1 : 0); }
  if (fields.length === 0) return c.json({ success: true });
  try {
    await c.env.DB.prepare(`UPDATE cross_audit_permissions SET ${fields.join(', ')} WHERE id = ?`).bind(...values, id).run();
    return c.json({ success: true });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// Audit Phases

export { router };