-- Migration: Add performance indexes for audit_schedules, locations, and users
-- Date: 2026-05-22
-- Purpose: Optimize read queries, CoI compliance checks, and reduce D1 contention

-- ═══════════════════════════════════════════════════════════
-- Audit Schedules — the most heavily queried table
-- ═══════════════════════════════════════════════════════════

-- Single-column indexes for common filters
CREATE INDEX IF NOT EXISTS idx_schedules_date        ON audit_schedules(date);
CREATE INDEX IF NOT EXISTS idx_schedules_status      ON audit_schedules(status);
CREATE INDEX IF NOT EXISTS idx_schedules_location    ON audit_schedules(location_id);
CREATE INDEX IF NOT EXISTS idx_schedules_department  ON audit_schedules(department_id);
CREATE INDEX IF NOT EXISTS idx_schedules_phase       ON audit_schedules(phase_id);
CREATE INDEX IF NOT EXISTS idx_schedules_auditor1    ON audit_schedules(auditor1_id);
CREATE INDEX IF NOT EXISTS idx_schedules_auditor2    ON audit_schedules(auditor2_id);
CREATE INDEX IF NOT EXISTS idx_schedules_supervisor  ON audit_schedules(supervisor_id);

-- Composite indexes for our most common query patterns
-- "Find all open audits for a location" — used in CoI checks and location transfers
CREATE INDEX IF NOT EXISTS idx_schedules_loc_status  ON audit_schedules(location_id, status);

-- "Find audits by date + status" — used in the schedule table view
CREATE INDEX IF NOT EXISTS idx_schedules_date_status ON audit_schedules(date, status);

-- "Find audits by department + status" — used in department-level views
CREATE INDEX IF NOT EXISTS idx_schedules_dept_status ON audit_schedules(department_id, status);

-- "Find audits assigned to a specific auditor" — used in auditor dashboards and cert revocation cleanup
CREATE INDEX IF NOT EXISTS idx_schedules_auditor1_date ON audit_schedules(auditor1_id, date);
CREATE INDEX IF NOT EXISTS idx_schedules_auditor2_date ON audit_schedules(auditor2_id, date);

-- ═══════════════════════════════════════════════════════════
-- Locations — speed up department transfers and CoI lookups
-- ═══════════════════════════════════════════════════════════

-- "Find all locations in a department" — used in CoI enforcement and asset totals
CREATE INDEX IF NOT EXISTS idx_locations_department ON locations(department_id);

-- "Find archived locations" — used in the archived locations panel
CREATE INDEX IF NOT EXISTS idx_locations_status     ON locations(status);

-- ═══════════════════════════════════════════════════════════
-- Users — speed up certification checks and cascading updates
-- ═══════════════════════════════════════════════════════════

-- "Find all users in a department" — used in cascading CoI checks on dept transfer
CREATE INDEX IF NOT EXISTS idx_users_department     ON users(department_id);

-- "Find users with valid/expired certifications" — used in cert revocation cleanup
CREATE INDEX IF NOT EXISTS idx_users_cert_expiry    ON users(certification_expiry);

-- "Find active users" — used in auditor counting
CREATE INDEX IF NOT EXISTS idx_users_status         ON users(status);

-- "Find users by email" — already has UNIQUE constraint, but ensure it exists
-- (SQLite already creates an implicit index on UNIQUE columns)
