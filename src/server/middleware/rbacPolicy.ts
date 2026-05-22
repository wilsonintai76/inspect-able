// RBAC policy for all roles, enforced in backend
// Source of truth: RBAC_ROLE_MATRIX.md
import { UserRole } from '@shared/types';

export type RBACPermission =
  | 'view:overview'
  | 'view:schedule:all'
  | 'view:schedule:own'
  | 'view:schedule:cross'
  | 'view:matrix'
  | 'set:audit:date'
  | 'self:assign:internal'
  | 'self:assign:cross'
  | 'assign:others'       // Admin only — was missing (caused 403 for all)
  | 'auto:assign'
  | 'officer:hub'
  | 'view:members:all'
  | 'view:members:dept'
  | 'edit:team'
  | 'manage:departments'
  | 'manage:locations'
  | 'admin:hub'           // Admin only — was missing (caused 403 for all)
  | 'system:settings';

export const RBAC_POLICY: Record<RBACPermission, UserRole[]> = {
  // Institutional Overview — all roles
  'view:overview':          ['Admin', 'Coordinator', 'Supervisor', 'Auditor', 'Staff'],
  // Inspection Schedule
  'view:schedule:all':      ['Admin'],                                          // View All Dept Schedules
  'view:schedule:own':      ['Admin', 'Coordinator', 'Supervisor', 'Auditor', 'Staff'], // View Own Dept Schedule
  'view:schedule:cross':    ['Admin', 'Coordinator', 'Supervisor', 'Auditor'], // View Cross-Audit Dept Schedules
  'view:matrix':            ['Admin', 'Coordinator', 'Supervisor', 'Auditor'], // View Audit Matrix
  'set:audit:date':         ['Admin', 'Coordinator', 'Supervisor'],             // Set Audit Dates (*priority rules in app)
  'self:assign:internal':   ['Admin', 'Supervisor', 'Auditor'],                // Self-Assign (internal audit)
  'self:assign:cross':      ['Admin', 'Supervisor', 'Auditor'],                // Self-Assign (cross-audit)
  'assign:others':          ['Admin', 'Coordinator'],                            // Assign Others (schedule) — Coordinators: dept-scoped
  'auto:assign':            ['Admin'],                                          // Auto-Assign
  // Officer Hub
  'officer:hub':            ['Admin', 'Supervisor', 'Auditor'],
  // User Management
  'view:members:all':       ['Admin'],                                          // View All Members
  'view:members:dept':      ['Admin', 'Coordinator', 'Supervisor'],             // View Dept Members
  'edit:team':              ['Admin', 'Coordinator'],                           // Add/Edit Team
  // Data Registries
  'manage:departments':     ['Admin', 'Coordinator'],                           // Department Registry
  'manage:locations':       ['Admin', 'Coordinator', 'Supervisor'],             // Location Registry (**restricted ops)
  // System
  'admin:hub':              ['Admin', 'Coordinator'],                           // Admin Hub (Coordinator: dept-scoped)
  'system:settings':        ['Admin'],                                          // System Settings
};

// Certification requirement and COI/cross-audit rules are enforced in the middleware layer.
