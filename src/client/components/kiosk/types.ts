export interface KioskSchedule {
  id: string;
  departmentName: string;
  departmentAbbr: string;
  locationName: string;
  totalAssets: number;
  supervisorId: string | null;
  supervisorName: string | null;
  auditor1Id: string | null;
  auditor1Name: string | null;
  auditor2Id: string | null;
  auditor2Name: string | null;
  date: string | null;
  status: string;
  phaseId: string;
  phaseName: string;
  phaseStart: string;
  phaseEnd: string;
}

export interface KioskUser {
  id: string;
  name: string;
  designation: string | null;
  departmentId: string | null;
  roles: string[];
  certificationExpiry: string | null;
  assetsAssigned: number;
}

export interface KioskPhase {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  status: string;
}

export type AssignRole = 'auditor1' | 'auditor2' | 'supervisor';
