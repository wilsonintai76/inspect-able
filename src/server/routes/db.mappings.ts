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

export { router };