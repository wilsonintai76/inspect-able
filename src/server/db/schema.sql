-- D1 Database Schema for Inspect-able (SQLite)

-- Users Table
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY, -- UID from Supabase Auth
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT, -- Native password hash
  roles TEXT NOT NULL, -- JSON array of UserRole
  designation TEXT,
  picture TEXT,
  department_id TEXT,
  contact_number TEXT,
  status TEXT DEFAULT 'Pending', -- Active, Inactive, Suspended, Pending
  is_verified INTEGER DEFAULT 0, -- Boolean
  must_change_pin INTEGER DEFAULT 0, -- Boolean
  certification_issued TEXT, -- ISO Date
  certification_expiry TEXT, -- ISO Date
  renewal_requested TEXT, -- ISO Date
  last_active TEXT, -- ISO Date
  dashboard_config TEXT, -- JSON string
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Departments Table
CREATE TABLE IF NOT EXISTS departments (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  abbr TEXT NOT NULL,
  head_of_dept_id TEXT,
  description TEXT,
  audit_group_id TEXT,
  is_exempted INTEGER DEFAULT 0,
  total_assets INTEGER DEFAULT 0,
  uninspected_asset_count INTEGER DEFAULT 0,
  tier TEXT,
  is_task_force INTEGER DEFAULT 0,
  auditors_required INTEGER DEFAULT 2,
  is_archived INTEGER DEFAULT 0,
  archived_by TEXT,
  archived_at TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_departments_unique_name ON departments(name, abbr);

-- Buildings Table
CREATE TABLE IF NOT EXISTS buildings (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  abbr TEXT NOT NULL,
  description TEXT,
  type TEXT, -- Administrative, Academic, Residential, Other
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Locations Table
-- NOTE: the `building` TEXT column that was here is removed (normalization migration below).
--       Use building_id → buildings.name for display instead.
CREATE TABLE IF NOT EXISTS locations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  abbr TEXT NOT NULL,
  department_id TEXT NOT NULL,
  building_id TEXT,
  level TEXT,
  description TEXT,
  supervisor_id TEXT,
  contact TEXT,
  total_assets INTEGER DEFAULT 0,
  uninspected_asset_count INTEGER DEFAULT 0,
  is_active INTEGER DEFAULT 1,
  status TEXT DEFAULT 'Active', -- Active, Archived, Pending_Delete
  archived_by TEXT,
  archived_at TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (department_id) REFERENCES departments(id),
  FOREIGN KEY (building_id) REFERENCES buildings(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_locations_unique_name ON locations(name, department_id, level, building_id);

-- Cross Audit Permissions Table (Relational Group-Level support)
CREATE TABLE IF NOT EXISTS cross_audit_permissions (
  id TEXT PRIMARY KEY,
  auditor_dept_id TEXT, -- NULL if group-level
  target_dept_id TEXT,  -- NULL if group-level
  auditor_group_id TEXT, -- NULL if dept-level
  target_group_id TEXT,  -- NULL if dept-level
  is_active INTEGER DEFAULT 1,
  is_mutual INTEGER DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (auditor_dept_id) REFERENCES departments(id),
  FOREIGN KEY (target_dept_id) REFERENCES departments(id),
  FOREIGN KEY (auditor_group_id) REFERENCES audit_groups(id),
  FOREIGN KEY (target_group_id) REFERENCES audit_groups(id)
);

-- Department Mappings Table
CREATE TABLE IF NOT EXISTS department_mappings (
  id TEXT PRIMARY KEY,
  source_name TEXT UNIQUE NOT NULL,
  target_department_id TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Location Mappings Table
CREATE TABLE IF NOT EXISTS location_mappings (
  id TEXT PRIMARY KEY,
  source_name TEXT UNIQUE NOT NULL,
  target_location_id TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (target_location_id) REFERENCES locations(id)
);

-- Institution KPI Targets Table
CREATE TABLE IF NOT EXISTS institution_kpi_targets (
  phase_id TEXT PRIMARY KEY,
  target_percentage REAL NOT NULL
);

-- Audit Phases Table
CREATE TABLE IF NOT EXISTS audit_phases (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'Active',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Audit Schedules Table
CREATE TABLE IF NOT EXISTS audit_schedules (
  id TEXT PRIMARY KEY,
  department_id TEXT NOT NULL,
  location_id TEXT NOT NULL,
  supervisor_id TEXT,
  auditor1_id TEXT,
  auditor2_id TEXT,
  date TEXT,
  status TEXT DEFAULT 'Pending', -- Pending, In Progress, Completed
  phase_id TEXT,
  report_path TEXT,
  total_assets_inspected INTEGER,
  asset_status_summary TEXT,
  is_locked INTEGER DEFAULT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (department_id) REFERENCES departments(id),
  FOREIGN KEY (location_id) REFERENCES locations(id),
  FOREIGN KEY (phase_id) REFERENCES audit_phases(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_audit_schedules_unique_location_phase ON audit_schedules(location_id, phase_id);

-- System Activities Table
CREATE TABLE IF NOT EXISTS system_activities (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  user_id TEXT,
  message TEXT NOT NULL,
  timestamp TEXT DEFAULT CURRENT_TIMESTAMP,
  metadata TEXT, -- JSON string
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- System Settings Table
CREATE TABLE IF NOT EXISTS system_settings (
  id TEXT PRIMARY KEY,
  value TEXT NOT NULL, -- JSON string
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Audit Groups Table
CREATE TABLE IF NOT EXISTS audit_groups (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  color TEXT,
  tier TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- KPI Tiers Table
CREATE TABLE IF NOT EXISTS kpi_tiers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  min_assets INTEGER NOT NULL,
  description TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- KPI Tier Targets Table
CREATE TABLE IF NOT EXISTS kpi_tier_targets (
  id TEXT PRIMARY KEY,
  tier_id TEXT NOT NULL,
  phase_id TEXT NOT NULL,
  target_percentage REAL NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (tier_id) REFERENCES kpi_tiers(id),
  FOREIGN KEY (phase_id) REFERENCES audit_phases(id)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_kpi_tier_targets_unique ON kpi_tier_targets(tier_id, phase_id);

-- Strategic Memos Table
CREATE TABLE IF NOT EXISTS strategic_memos (
  id TEXT PRIMARY KEY,
  year INTEGER NOT NULL,
  institution_name TEXT NOT NULL,
  projected_kpi REAL NOT NULL,
  feasibility_score INTEGER NOT NULL,
  total_assets INTEGER NOT NULL,
  total_auditors INTEGER NOT NULL,
  risk_level TEXT NOT NULL,
  content_json TEXT NOT NULL, -- Full snapshot of entities and pairings
  r2_html_key TEXT,
  approved_by TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (approved_by) REFERENCES users(id)
);

-- OAuth Accounts Table (Google login identities)
CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  provider TEXT NOT NULL,                   -- e.g. 'google'
  provider_account_id TEXT NOT NULL,        -- Google's stable `sub` claim
  provider_email TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Sessions Table (server-side session tracking)
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,                      -- matches KV sess:{userId}.sessionId
  user_id TEXT NOT NULL,
  expires_at TEXT NOT NULL,                 -- ISO 8601
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  ip_address TEXT,
  user_agent TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Indices for performance
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);
CREATE INDEX IF NOT EXISTS idx_locations_dept ON locations(department_id);
CREATE INDEX IF NOT EXISTS idx_locations_building ON locations(building_id);
CREATE INDEX IF NOT EXISTS idx_locations_status ON locations(status);
CREATE INDEX IF NOT EXISTS idx_schedules_phase ON audit_schedules(phase_id);
CREATE INDEX IF NOT EXISTS idx_schedules_dept ON audit_schedules(department_id);
CREATE INDEX IF NOT EXISTS idx_schedules_status ON audit_schedules(status);
CREATE INDEX IF NOT EXISTS idx_activities_timestamp ON system_activities(timestamp);
CREATE INDEX IF NOT EXISTS idx_activities_user ON system_activities(user_id);
CREATE INDEX IF NOT EXISTS idx_deptmapping_source ON department_mappings(source_name);
CREATE INDEX IF NOT EXISTS idx_cross_audit_auditor ON cross_audit_permissions(auditor_dept_id);
CREATE INDEX IF NOT EXISTS idx_cross_audit_target ON cross_audit_permissions(target_dept_id);
CREATE INDEX IF NOT EXISTS idx_memos_year ON strategic_memos(year);
CREATE INDEX IF NOT EXISTS idx_schedules_supervisor ON audit_schedules(supervisor_id);
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_users_cert_expiry ON users(certification_expiry);
CREATE INDEX IF NOT EXISTS idx_users_department ON users(department_id);
CREATE INDEX IF NOT EXISTS idx_users_status_verified ON users(status, is_verified);

-- ─── Migration: remove denormalized `building` column from locations ──────────
-- Run once against existing databases with:
--   wrangler d1 execute inspect-able-db --remote --command "ALTER TABLE locations DROP COLUMN building;"
-- The column is no longer written by the server. building_id → buildings.name for display.
-- ─────────────────────────────────────────────────────────────────────────────
