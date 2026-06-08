PRAGMA foreign_keys=off;

CREATE TABLE audit_schedules_new (
  id TEXT PRIMARY KEY,
  department_id TEXT NOT NULL,
  location_id TEXT NOT NULL,
  supervisor_id TEXT,
  auditor1_id TEXT,
  auditor2_id TEXT,
  date TEXT,
  status TEXT DEFAULT 'Pending',
  phase_id TEXT, -- Removing NOT NULL
  report_path TEXT,
  is_locked INTEGER DEFAULT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (department_id) REFERENCES departments(id),
  FOREIGN KEY (location_id) REFERENCES locations(id),
  FOREIGN KEY (phase_id) REFERENCES audit_phases(id)
);

INSERT INTO audit_schedules_new SELECT * FROM audit_schedules;
DROP TABLE audit_schedules;
ALTER TABLE audit_schedules_new RENAME TO audit_schedules;

PRAGMA foreign_keys=on;
