import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { Bindings, Variables } from '../types';
import { requirePolicy, emptyContextBuilder, userPatchContextBuilder } from '../middleware/pbac';
import { evaluateAccess, deriveCapabilities } from '../utils/policyEngine';
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
// Users
router.get('/users', async (c) => {
  try {
    const caller = c.get('user');
    const callerCaps = deriveCapabilities({ id: caller?.id || '', email: caller?.email || '', role: caller?.role || '', roles: caller?.roles || [], departmentId: caller?.departmentId || null, certificationExpiry: caller?.certificationExpiry || null, qualifications: caller?.qualifications || [] });
    const isSuperAdmin = caller?.email?.toLowerCase() === 'admin@poliku.edu.my';
    const isAdmin = callerCaps.has('system:admin');

    let sql = 'SELECT id, name, email, roles, designation, picture, department_id, contact_number, status, is_verified, must_change_pin, certification_issued, certification_expiry, renewal_requested, last_active, password_hash, qualifications FROM users';
    const binds: any[] = [];
    
    // Filtering logic
    const filters: string[] = [];
    if (!isSuperAdmin) {
      filters.push('email != ?');
      binds.push('admin@poliku.edu.my');
    }


    if (filters.length > 0) {
      sql += ' WHERE ' + filters.join(' AND ');
    }

    const { results } = await c.env.DB.prepare(sql).bind(...binds).all();

    return c.json((results || []).map((u: any) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      roles: JSON.parse(u.roles || '["Staff"]'),
      designation: u.designation,
      picture: u.picture,
      departmentId: u.department_id,
      contactNumber: u.contact_number,
      status: u.status,
      isVerified: u.is_verified === 1,
      mustChangePIN: u.must_change_pin === 1,
      certificationIssued: u.certification_issued,
      certificationExpiry: u.certification_expiry,
      renewalRequested: u.renewal_requested ?? null,
      lastActive: u.last_active,
      hasPassword: !!u.password_hash,
      qualifications: JSON.parse(u.qualifications || '[]'),
    })));
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

router.post('/users', requirePolicy('user.create', emptyContextBuilder()), zValidator('json', userSchema), async (c) => {
  const newUser = c.req.valid('json');
  const caller = c.get('user');
  const callerCaps = deriveCapabilities({ id: caller?.id || '', email: caller?.email || '', role: caller?.role || '', roles: caller?.roles || [], departmentId: caller?.departmentId || null, certificationExpiry: caller?.certificationExpiry || null, qualifications: caller?.qualifications || [] });
  const isSuperAdmin = caller?.email?.toLowerCase() === 'admin@poliku.edu.my';
  const isAdmin = callerCaps.has('system:admin');

  // Enforce departmental isolation for non-admins
  if (!isSuperAdmin && !isAdmin && callerCaps.has('manage:departments')) {
    if (newUser.departmentId !== caller.departmentId) {
      return c.json({ error: 'Coordinators can only create users in their own department' }, 403);
    }
  }

  const id = newUser.id || crypto.randomUUID();

  // Check for duplicate email (case-insensitive)
  const existing = await c.env.DB.prepare('SELECT id, name FROM users WHERE LOWER(email) = ?').bind(newUser.email.toLowerCase()).first();
  if (existing) {
    return c.json({ error: `Email ${newUser.email} is already registered to ${(existing as any).name}.` }, 409);
  }

  // 1. Calculate Binding Roles if not explicitly provided
  let roles = newUser.roles;
  if (!roles || roles.length === 0) {
    roles = getRolesForDesignation(newUser.designation) || ['Staff'];
  }

  // 1.5 Calculate qualifications with certificate sync
  const today = new Date().toISOString().split('T')[0];
  const isCertValid = !!newUser.certificationExpiry && newUser.certificationExpiry >= today;
  let qualifications = newUser.qualifications || [];
  if (isCertValid && !qualifications.includes('Inspector')) {
    qualifications = [...qualifications, 'Inspector'];
  }

  // 2. Set Default Password Hash & Force PIN Change for manual creation
  const defaultHash = await hashPassword(DEFAULT_USER_PASSWORD);
  const mustChangePIN = newUser.mustChangePIN !== undefined ? newUser.mustChangePIN : true;

  try {
    await c.env.DB.prepare(
      `INSERT INTO users 
       (id, name, email, password_hash, roles, designation, picture, department_id, contact_number, status, is_verified, must_change_pin, certification_issued, certification_expiry, qualifications) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      id,
      newUser.name,
      newUser.email.toLowerCase().trim(),
      defaultHash,
      JSON.stringify(roles),
      newUser.designation ?? null,
      newUser.picture ?? null,
      newUser.departmentId ?? null,
      newUser.contactNumber ?? null,
      newUser.status ?? 'Active',
      newUser.isVerified ? 1 : 0,
      mustChangePIN ? 1 : 0,
      newUser.certificationIssued ?? null,
      newUser.certificationExpiry ?? null,
      JSON.stringify(qualifications)
    ).run();

    return c.json({ id, ...newUser, roles, mustChangePIN, qualifications });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

router.patch(
  '/users/:id',
  zValidator('json', patchUserSchema),
  requirePolicy('user.update', userPatchContextBuilder()),
  async (c) => {
  const id = c.req.param('id');
  const updates = c.req.valid('json');
  const caller = c.get('user');
  const callerRoles: string[] = caller?.roles || [];
  const callerCaps = deriveCapabilities({ id: caller?.id || '', email: caller?.email || '', role: caller?.role || '', roles: callerRoles, departmentId: caller?.departmentId || null, certificationExpiry: caller?.certificationExpiry || null, qualifications: caller?.qualifications || [] });
  const isSuperAdmin = caller?.email?.toLowerCase() === 'admin@poliku.edu.my';
  const isAdmin = callerCaps.has('system:admin');
  const isCoordinator = callerCaps.has('manage:departments') && !isAdmin;

  // Fetch target user's current record to compare fields and bypass checks for unchanged values
  const targetUserDB = await c.env.DB.prepare(
    'SELECT name, email, roles, designation, department_id, contact_number, is_verified, certification_issued, certification_expiry, password_hash, qualifications FROM users WHERE id = ?'
  ).bind(id).first<{
    name: string;
    email: string;
    roles: string;
    designation: string | null;
    department_id: string | null;
    contact_number: string | null;
    is_verified: number;
    certification_issued: string | null;
    certification_expiry: string | null;
    password_hash: string | null;
    qualifications: string | null;
  }>();

  if (!targetUserDB) {
    return c.json({ error: 'User not found' }, 404);
  }

  // Filter out updates that don't change values to avoid false-positive permission blocks
  if (updates.name !== undefined && updates.name === targetUserDB.name) delete updates.name;
  if (updates.email !== undefined && updates.email.toLowerCase().trim() === targetUserDB.email.toLowerCase().trim()) delete updates.email;
  if (updates.designation !== undefined && updates.designation === targetUserDB.designation) delete updates.designation;
  if (updates.departmentId !== undefined && updates.departmentId === targetUserDB.department_id) delete updates.departmentId;
  if (updates.contactNumber !== undefined && updates.contactNumber === targetUserDB.contact_number) delete updates.contactNumber;

  if (updates.roles !== undefined) {
    try {
      const currentRoles = JSON.parse(targetUserDB.roles || '[]');
      if (
        Array.isArray(updates.roles) &&
        updates.roles.length === currentRoles.length &&
        updates.roles.every(r => currentRoles.includes(r))
      ) {
        delete updates.roles;
      }
    } catch (e) {
      // Keep updates.roles on parse error
    }
  }

  if (updates.isVerified !== undefined) {
    const currentVerified = targetUserDB.is_verified === 1;
    if (updates.isVerified === currentVerified) delete updates.isVerified;
  }

  if (updates.certificationIssued !== undefined && updates.certificationIssued === targetUserDB.certification_issued) {
    delete updates.certificationIssued;
  }

  if (updates.certificationExpiry !== undefined && updates.certificationExpiry === targetUserDB.certification_expiry) {
    delete updates.certificationExpiry;
  }

  // ── Scoping & Authorization Checks ──
  if (isSuperAdmin) {
    // Superadmin bypass
  } else if (!isAdmin && !isCoordinator && caller?.id !== id) {
    // Staff can only update themselves
    return c.json({ error: 'Forbidden' }, 403);
  } else if (!isAdmin && isCoordinator) {
    // Coordinators can update themselves OR users in their department
    if (caller?.id !== id) {
      if (targetUserDB.department_id !== caller?.departmentId) {
        return c.json({ error: 'Coordinators can only manage users within their own department' }, 403);
      }
      
      // Prevent Coordinator from re-assigning user to another department
      if (updates.departmentId && updates.departmentId !== caller?.departmentId) {
         return c.json({ error: 'Cannot re-assign user to a different department' }, 403);
      }
    }
  }

  // Check if target user's profile is complete
  const isTargetProfileComplete = !!(
    targetUserDB.name &&
    targetUserDB.designation &&
    targetUserDB.department_id &&
    targetUserDB.contact_number
  );

  // If a non-admin is updating themselves:
  if (caller?.id === id && !isAdmin) {
    // Completed profiles cannot change name, departmentId, or designation
    if (isTargetProfileComplete && (updates.name !== undefined || updates.departmentId !== undefined || updates.designation !== undefined)) {
      return c.json({ error: 'Forbidden: completed profiles can only be modified by an administrator' }, 403);
    }
  }

  // Sync roles if designation is updated — always rebind, even if roles were
  // explicitly provided, to prevent designation/role drift (e.g. Admin editing a
  // user whose roles were corrupted by a prior profile save with wrong default).
  if (updates.designation !== undefined) {
    const boundRoles = getRolesForDesignation(updates.designation);
    if (boundRoles) {
      updates.roles = boundRoles;
    }
  }

  // Only Admin can change verification and certification
  if (!isAdmin && (updates.isVerified !== undefined || updates.certificationIssued !== undefined || updates.certificationExpiry !== undefined)) {
    return c.json({ error: 'Forbidden: only Admin can change verification or certification' }, 403);
  }
  // ── PBAC: Certification issuance/renewal requires manage:certs capability ──
  if ((updates.certificationIssued !== undefined || updates.certificationExpiry !== undefined)) {
    const certifyResult = evaluateAccess(caller as any, 'user.certify', { targetDepartmentId: targetUserDB.department_id });
    if (!certifyResult.allowed) {
      return c.json({ error: certifyResult.reason || 'Forbidden: certification management requires Admin role' }, 403);
    }
  }

  // Protect Google-bound email: if user has no password_hash, email is managed by Google OAuth
  if (updates.email !== undefined && !targetUserDB.password_hash) {
    return c.json({ error: 'Email is managed by Google. Unlink the Google account first to change the email.' }, 403);
  }

  // ── Role Enforcement ──
  if (updates.roles !== undefined) {
    const newRole = Array.isArray(updates.roles) ? updates.roles[0] : null; // single role
    if (!newRole) {
      return c.json({ error: 'Invalid role assignment' }, 400);
    }

    const targetDesignation = updates.designation !== undefined ? updates.designation : targetUserDB.designation;
    const boundRoles = getRolesForDesignation(targetDesignation);
    const isBound = boundRoles && boundRoles.includes(newRole);

    // Only Admin can manually assign a role that is NOT bound to their designation, or assign the 'Admin' role
    if (newRole === 'Admin' && !isAdmin) {
      return c.json({ error: 'Forbidden: only Admin can assign the Admin role' }, 403);
    }

    if (!isBound && !isAdmin) {
      return c.json({ error: 'Forbidden: only Admin can perform manual role overrides' }, 403);
    }

    // Demoting an Admin is only allowed by Admins
    try {
      const currentRoles = JSON.parse(targetUserDB.roles || '[]');
      if (currentRoles.includes('Admin') && !isAdmin) {
        return c.json({ error: 'Forbidden: only Admin can demote an Admin user' }, 403);
      }
    } catch (e) {
      // Ignore JSON parse errors
    }
    
    // Normalize to single role
    updates.roles = [newRole];
  }

  // Sync qualifications with certificate changes (or keep existing)
  const finalCertExpiry = updates.certificationExpiry !== undefined ? updates.certificationExpiry : targetUserDB.certification_expiry;
  let currentQuals: string[] = [];
  try {
    currentQuals = JSON.parse(targetUserDB.qualifications || '[]');
  } catch (e) {}
  let finalQuals = updates.qualifications !== undefined ? updates.qualifications : [...currentQuals];

  const today = new Date().toISOString().split('T')[0];
  const isCertValid = !!finalCertExpiry && finalCertExpiry >= today;

  if (isCertValid) {
    if (!finalQuals.includes('Inspector')) {
      finalQuals.push('Inspector');
    }
  } else {
    finalQuals = finalQuals.filter(q => q !== 'Inspector');
  }

  const qualsChanged = JSON.stringify(finalQuals.sort()) !== JSON.stringify(currentQuals.sort());
  if (qualsChanged) {
    updates.qualifications = finalQuals;
  } else {
    delete updates.qualifications;
  }

  const fields: string[] = [];
  const values: any[] = [];

  if (updates.password !== undefined) { 
    const hash = await hashPassword(updates.password);
    fields.push('password_hash = ?'); 
    values.push(hash); 
  }
  if (updates.email !== undefined) { fields.push('email = ?'); values.push(updates.email.toLowerCase().trim()); }
  if (updates.name !== undefined) { fields.push('name = ?'); values.push(updates.name); }
  if (updates.roles !== undefined) { fields.push('roles = ?'); values.push(JSON.stringify(updates.roles)); }
  if (updates.designation !== undefined) { fields.push('designation = ?'); values.push(updates.designation); }
  if (updates.departmentId !== undefined) { fields.push('department_id = ?'); values.push(updates.departmentId); }
  if (updates.contactNumber !== undefined) { fields.push('contact_number = ?'); values.push(updates.contactNumber); }
  if (updates.isVerified !== undefined) { fields.push('is_verified = ?'); values.push(updates.isVerified ? 1 : 0); }
  if (updates.mustChangePIN !== undefined) { fields.push('must_change_pin = ?'); values.push(updates.mustChangePIN ? 1 : 0); }
  if (updates.lastActive !== undefined) { fields.push('last_active = ?'); values.push(updates.lastActive); }
  if (updates.certificationIssued !== undefined) { fields.push('certification_issued = ?'); values.push(updates.certificationIssued); }
  if (updates.certificationExpiry !== undefined) { fields.push('certification_expiry = ?'); values.push(updates.certificationExpiry); }
  if (updates.renewalRequested !== undefined) { fields.push('renewal_requested = ?'); values.push(updates.renewalRequested); }
  if (updates.qualifications !== undefined) { fields.push('qualifications = ?'); values.push(JSON.stringify(updates.qualifications)); }

  if (fields.length === 0) return c.json({ success: true });

  try {
    await c.env.DB.prepare(
      `UPDATE users SET ${fields.join(', ')} WHERE id = ?`
    ).bind(...values, id).run();
    // Evict cached roles/departmentId if any privileged fields changed
    const privilegedChanged = updates.roles !== undefined || updates.departmentId !== undefined
      || updates.isVerified !== undefined || updates.certificationIssued !== undefined
      || updates.certificationExpiry !== undefined || updates.renewalRequested !== undefined
      || updates.qualifications !== undefined;
    if (privilegedChanged) {
      await c.env.SETTINGS.delete(`ucache:${id}`).catch(() => {});
    }

    // â”€â”€â”€ Auto-cleanup: If certification was revoked/expired, unassign this user from all future audits â”€â”€â”€
    if (updates.certificationExpiry !== undefined) {
      const today = new Date().toISOString().split('T')[0];
      const isExpired = !updates.certificationExpiry || updates.certificationExpiry < today;
      if (isExpired) {
        await unassignSpecificAuditorFromFutureAudits(c.env.DB, id, today);
        invalidateScheduleCache(c.env.SETTINGS);
      }
    }

    // â”€â”€â”€ COI enforcement: If user's department changed, unassign them from audits in their new department â”€â”€â”€
    if (updates.departmentId !== undefined && updates.departmentId !== null) {
      const today = new Date().toISOString().split('T')[0];
      // Find all future audits in the new department where this user is assigned
      const conflictedAudits = await c.env.DB.prepare(
        `SELECT id, auditor1_id, auditor2_id, status, is_locked FROM audit_schedules 
         WHERE department_id = ? AND (auditor1_id = ? OR auditor2_id = ?) AND date >= ?`
      ).bind(updates.departmentId, id, id, today).all<any>();

      for (const audit of conflictedAudits.results || []) {
        const clear1 = audit.auditor1_id === id;
        const clear2 = audit.auditor2_id === id;
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
      if (conflictedAudits.results && conflictedAudits.results.length > 0) {
        invalidateScheduleCache(c.env.SETTINGS);
      }
    }

    return c.json({ success: true });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

router.delete('/users/:id', requirePolicy('user.delete', emptyContextBuilder()), async (c) => {
  const id = c.req.param('id');
  try {
    // Step 1: Clear all foreign key references before deleting the user
    // Clear from system_activities (FK: user_id)
    await c.env.DB.prepare('UPDATE system_activities SET user_id = NULL WHERE user_id = ?').bind(id).run();
    // Clear from departments (head_of_dept_id)
    await c.env.DB.prepare('UPDATE departments SET head_of_dept_id = NULL WHERE head_of_dept_id = ?').bind(id).run();
    // Clear from locations (supervisor_id)
    await c.env.DB.prepare('UPDATE locations SET supervisor_id = NULL WHERE supervisor_id = ?').bind(id).run();
    // Clear from audit_schedules (supervisor_id, auditor1_id, auditor2_id)
    await c.env.DB.prepare('UPDATE audit_schedules SET supervisor_id = NULL, auditor1_id = NULL, auditor2_id = NULL WHERE supervisor_id = ? OR auditor1_id = ? OR auditor2_id = ?').bind(id, id, id).run();
    // Clear from users (department_id â€” unassign from department)
    await c.env.DB.prepare('UPDATE users SET department_id = NULL WHERE department_id = ?').bind(id).run();

    // Step 2: Now safe to delete the user
    await c.env.DB.prepare('DELETE FROM users WHERE id = ?').bind(id).run();
    // Evict roles cache + force-out active session
    await Promise.allSettled([
      c.env.SETTINGS.delete(`ucache:${id}`),
      c.env.SETTINGS.delete(`sess:${id}`),
    ]);
    return c.json({ success: true });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

router.post('/users/:id/verify', requirePolicy('user.verify', emptyContextBuilder()), async (c) => {
  const id = c.req.param('id');
  try {
    await c.env.DB.prepare('UPDATE users SET is_verified = 1, status = \'Active\' WHERE id = ?').bind(id).run();
    // Evict stale role cache so next request fetches updated status from D1
    await c.env.SETTINGS.delete(`ucache:${id}`).catch(() => {});
    return c.json({ success: true });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// Departments

export { router };