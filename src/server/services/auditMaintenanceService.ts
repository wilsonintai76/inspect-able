// Utility to unassign auditors with expired/revoked certificates from future audits
// and handle location department transfers (COI enforcement + schedule repair).

import { D1Database } from '@cloudflare/workers-types';

export async function unassignExpiredAuditors(db: D1Database, today: string) {
  // 1. Find all users with expired/revoked certificates
  const expiredUsers = await db.prepare(
    "SELECT id FROM users WHERE certification_expiry IS NULL OR certification_expiry < ?"
  ).bind(today).all<any>();
  const expiredUserIds: string[] = (expiredUsers.results || []).map((u: any) => u.id);
  if (expiredUserIds.length === 0) return;

  // 2. For each audit in the future, unassign if auditor1 or auditor2 is expired
  const audits = await db.prepare(
    `SELECT id, auditor1_id, auditor2_id, status, is_locked, date FROM audit_schedules WHERE (auditor1_id IN (${expiredUserIds.map(() => '?').join(',')}) OR auditor2_id IN (${expiredUserIds.map(() => '?').join(',')})) AND date >= ?`
  ).bind(...expiredUserIds, ...expiredUserIds, today).all<any>();

  for (const audit of audits.results || []) {
    let clear1 = expiredUserIds.includes(audit.auditor1_id);
    let clear2 = expiredUserIds.includes(audit.auditor2_id);
    if (clear1 || clear2) {
      let newStatus = audit.status;
      let newLocked = audit.is_locked;
      if (audit.status === 'In Progress') newStatus = 'Pending';
      if (audit.is_locked) newLocked = null;
      await db.prepare(
        'UPDATE audit_schedules SET auditor1_id = ?, auditor2_id = ?, status = ?, is_locked = ? WHERE id = ?'
      ).bind(
        clear1 ? null : audit.auditor1_id,
        clear2 ? null : audit.auditor2_id,
        newStatus,
        newLocked,
        audit.id
      ).run();
    }
  }
}

/**
 * When a location is transferred from oldDeptId to newDeptId:
 * - Update all audit_schedules for this location to newDeptId
 * - Unassign any auditor who belongs to newDeptId (COI: cannot audit own dept)
 * - Reset affected audit statuses to Pending & unlock
 */
export async function handleLocationDepartmentTransfer(
  db: D1Database,
  locationId: string,
  newDepartmentId: string,
  oldDepartmentId: string,
) {
  // 1. Update all audits for this location to the new department
  await db.prepare(
    'UPDATE audit_schedules SET department_id = ? WHERE location_id = ?'
  ).bind(newDepartmentId, locationId).run();

  // 2. For each audit, clear any auditor whose department now matches the new department
  const audits = await db.prepare(
    'SELECT id, auditor1_id, auditor2_id, status, is_locked FROM audit_schedules WHERE location_id = ?'
  ).bind(locationId).all<any>();

  for (const audit of audits.results || []) {
    let clear1 = false, clear2 = false;
    if (audit.auditor1_id) {
      const u1 = await db.prepare(
        'SELECT department_id FROM users WHERE id = ?'
      ).bind(audit.auditor1_id).first<{ department_id: string }>();
      if (u1 && u1.department_id === newDepartmentId) clear1 = true;
    }
    if (audit.auditor2_id) {
      const u2 = await db.prepare(
        'SELECT department_id FROM users WHERE id = ?'
      ).bind(audit.auditor2_id).first<{ department_id: string }>();
      if (u2 && u2.department_id === newDepartmentId) clear2 = true;
    }
    if (clear1 || clear2) {
      let newStatus = audit.status;
      let newLocked = audit.is_locked;
      if (audit.status === 'In Progress') newStatus = 'Pending';
      if (audit.is_locked) newLocked = null;
      await db.prepare(
        'UPDATE audit_schedules SET auditor1_id = ?, auditor2_id = ?, status = ?, is_locked = ? WHERE id = ?'
      ).bind(
        clear1 ? null : audit.auditor1_id,
        clear2 ? null : audit.auditor2_id,
        newStatus,
        newLocked,
        audit.id
      ).run();
    }
  }
}

/**
 * Refresh total_assets and uninspected_asset_count for all departments
 * based on the sum of their active locations.
 */
export async function refreshDepartmentAssetTotals(db: D1Database) {
  try {
    // Step 1: zero all department totals
    await db.prepare(
      `UPDATE departments SET total_assets = 0, uninspected_asset_count = 0`
    ).run();

    // Step 2: aggregate active-location totals per department and apply
    const { results } = await db.prepare(
      `SELECT department_id,
              COALESCE(SUM(total_assets), 0)            AS sum_assets,
              COALESCE(SUM(uninspected_asset_count), 0) AS sum_uninspected
       FROM locations
       WHERE status != 'Archived' AND department_id IS NOT NULL
       GROUP BY department_id`
    ).all<{ department_id: string; sum_assets: number; sum_uninspected: number }>();

    for (const row of (results || [])) {
      await db.prepare(
        `UPDATE departments SET total_assets = ?, uninspected_asset_count = ? WHERE id = ?`
      ).bind(row.sum_assets, row.sum_uninspected, row.department_id).run();
    }
  } catch (err: any) {
    console.error('[refreshDepartmentAssetTotals] Error:', err?.message, err);
    // Non-fatal — totals will be stale but data integrity is preserved
  }
}

/**
 * When a specific auditor's certificate is revoked/expired, unassign them from
 * all future audits and reset affected audit statuses.
 */
export async function unassignSpecificAuditorFromFutureAudits(
  db: D1Database,
  userId: string,
  today: string,
) {
  const audits = await db.prepare(
    `SELECT id, auditor1_id, auditor2_id, status, is_locked FROM audit_schedules 
     WHERE (auditor1_id = ? OR auditor2_id = ?) AND date >= ?`
  ).bind(userId, userId, today).all<any>();

  for (const audit of audits.results || []) {
    let clear1 = audit.auditor1_id === userId;
    let clear2 = audit.auditor2_id === userId;
    let newStatus = audit.status;
    let newLocked = audit.is_locked;
    if (audit.status === 'In Progress') newStatus = 'Pending';
    if (audit.is_locked) newLocked = null;
    await db.prepare(
      'UPDATE audit_schedules SET auditor1_id = ?, auditor2_id = ?, status = ?, is_locked = ? WHERE id = ?'
    ).bind(
      clear1 ? null : audit.auditor1_id,
      clear2 ? null : audit.auditor2_id,
      newStatus,
      newLocked,
      audit.id
    ).run();
  }
}

/**
 * Clean up audit schedules when a location is archived.
 * - Delete all non-completed audits (Pending, In Progress)
 * - Keep completed audits for historical records
 */
export async function cleanupAuditsForArchivedLocation(db: D1Database, locationId: string) {
  await db.prepare(
    `DELETE FROM audit_schedules WHERE location_id = ? AND status NOT IN ('Completed')`
  ).bind(locationId).run();
}
