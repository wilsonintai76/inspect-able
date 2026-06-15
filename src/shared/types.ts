
export interface AuditSchedule {
  id: string;
  departmentId: string;
  locationId: string;
  supervisorId: string | null;
  auditor1Id: string | null;
  auditor2Id: string | null;
  date: string | null;
  status: 'Pending' | 'In Progress' | 'Completed';
  phaseId: string;
  isLocked?: boolean;
  reportPath?: string | null;
  totalAssetsInspected?: number | null;
  assetStatusSummary?: string | null;
  verifiedAssetCount?: number | null;
  assetStatuses?: Record<string, number> | null;
}

export type AssignmentMode = 'cross-audit' | 'open-audit';

export type Designation = 'Head Of Department' | 'Head Of Programme' | 'Coordinator' | 'Supervisor' | 'Staff';

export type UserRole = 'Admin' | 'Coordinator' | 'Supervisor' | 'Guest';
export type AppView = 'dashboard' | 'overview' | 'schedule' | 'team' | 'settings' | 'departments' | 'locations' | 'profile' | 'knowledge-base' | 'auditor-dashboard' | 'buildings' | 'admin-dashboard';

export interface User {
  id: string;
  name: string;
  email: string;
  pin?: string;
  roles: string[];
  designation?: Designation;
  picture?: string;
  departmentId?: string;
  contactNumber?: string;
  permissions?: string[];
  lastActive?: string;
  certificationIssued?: string; // ISO-8601 date string
  certificationExpiry?: string; // ISO-8601 date string
  qualifications?: string[];
  renewalRequested?: string | null; // ISO-8601 date string when officer applied for renewal
  status: 'Active' | 'Inactive' | 'Suspended' | 'Pending';
  isVerified?: boolean;
  mustChangePIN?: boolean;
  hasPassword?: boolean; // false if Google OAuth-bound (no local password)
  password?: string;
  dashboardConfig?: DashboardConfig;
}

export interface Department {
  id: string;
  name: string;
  abbr: string;
  headOfDeptId: string | null;
  headName?: string | null;
  description: string;
  auditGroupId: string | null; // UUID of the AuditGroup (Normalized)
  totalAssets?: number;
  uninspectedAssetCount?: number;
  auditorCount?: number;
  isExempted?: boolean;
  isSystemExempted?: boolean;
  isArchived?: boolean;
  archivedBy?: string | null;
  archivedAt?: string | null;
  tier?: 'Small' | 'Medium' | 'Large';
  isTaskForce?: boolean;
  auditorsRequiredOverride?: number;
}

export interface AuditGroup {
  id: string;
  name: string;
  description?: string;
  color?: string;
  tier?: 'Small' | 'Medium' | 'Large';
}

export interface Building {
  id: string;
  name: string;
  abbr: string;
  description?: string;
  type?: 'Administrative' | 'Academic' | 'Residential' | 'Workshop/Laboratory' | 'Other';
  createdAt?: string;
}

export interface Location {
  id: string;
  name: string;
  abbr: string;
  departmentId: string;
  buildingId?: string | null;
  building: string;
  level?: string;
  description: string;
  supervisorId: string | null;
  contact: string;
  totalAssets?: number;
  uninspectedAssetCount?: number;
  isActive?: boolean;
  status?: 'Active' | 'Archived' | 'Pending_Delete';
  archivedBy?: string | null;
  archivedAt?: string | null;
}

export interface DashboardConfig {
  showStats: boolean;
  showTrends: boolean;
  showUpcoming: boolean;
  showDeptDistribution: boolean;
  showKPI: boolean;
  showCertification?: boolean;
}

export interface AppNotification {
  id: string;
  title: string;
  message: string;
  timestamp: string;
  type: 'info' | 'warning' | 'success' | 'urgent';
  read: boolean;
}

export interface AuditInsight {
  summary: string;
  recommendations: string[];
}

export interface CrossAuditPermission {
  id: string;
  auditorDeptId?: string | null;
  targetDeptId?: string | null;
  auditorGroupId?: string | null;
  targetGroupId?: string | null;
  isActive: boolean;
  isMutual: boolean;
}

export interface AuditPhase {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  description?: string;
  status?: string;
}

export interface KPITier {
  id: string;
  name: string;
  minAssets: number;
  targets?: Record<string, number>; // phaseId -> target %
}

export interface KPITierTarget {
  id: string;
  tierId: string;
  phaseId: string;
  targetPercentage: number;
}

export interface InstitutionKPITarget {
  id: string;
  phaseId: string;
  targetPercentage: number;
}

export interface DepartmentMapping {
  id: string;
  sourceName: string;
  targetDepartmentId: string;
}

export interface LocationMapping {
  id: string;
  sourceName: string;
  targetLocationId: string;
  createdAt?: string;
}

export interface SystemActivity {
  id: string;
  type: 'SCHEDULE_DATE' | 'AUDITOR_ASSIGNED' | 'LOCATION_CREATED' | 'LOCATION_UPDATED' | 'LOCATION_ARCHIVED' | 'LOCATION_DELETED' | 'AUDIT_COMPLETED' | 'ADMIN_RESET' | 'CREATE' | 'UPDATE' | 'DELETE' | 'ARCHIVE' | 'LOGIN_TASK_COMPLETED';
  userId: string | null;
  auditId?: string;
  message: string;
  timestamp?: string;
  metadata?: Record<string, any>;
}

export interface AuditConstraintsState {
  maxAssetsPerDay: number;
  maxLocationsPerDay: number;
  minAuditorsPerLocation: number;
  dailyInspectionCapacity: number;
}

export interface SystemSetting {
  id: string;
  value: any;
  updatedAt?: string;
}

export type Locale = 'en';
