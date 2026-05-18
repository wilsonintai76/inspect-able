import { AuditSchedule, User, AppNotification, Department, Location } from '@shared/types';

// ─── System Exclusions ─────────────────────────────────────────────
// Software Development is a superadmin internal department — excluded from
// consolidation, pairing, printing, and institutional counts.
export const SOFTWARE_DEV_DEPT_NAME = 'Software Development';

// Superadmin email — excluded from auditor counts, pairing, and printing.
export const SUPERADMIN_EMAIL = 'admin@poliku.edu.my';

// New Department List based on user provided data
export const INITIAL_DEPARTMENTS: Omit<Department, 'id'>[] = [
  { name: 'Unit Kamsis', abbr: 'KAMSIS', headOfDeptId: 'dummy-user-id', description: 'Student Accommodation Unit', auditGroupId: null },
  { name: 'Jabatan Kejuruteraan Elektrik', abbr: 'JKE', headOfDeptId: 'dummy-user-id', description: 'Electrical Engineering Department', auditGroupId: null },
  { name: 'Jabatan Kejuruteraan Awam', abbr: 'JKA', headOfDeptId: 'dummy-user-id', description: 'Civil Engineering Department', auditGroupId: null },
  { name: 'Jabatan Kejuruteraan Mekanikal', abbr: 'JKM', headOfDeptId: 'dummy-user-id', description: 'Mechanical Engineering Department', auditGroupId: null },
  { name: 'Jabatan Kejuruteraan Petrokimia', abbr: 'JKP', headOfDeptId: 'dummy-user-id', description: 'Petrochemical Engineering', auditGroupId: null },
  { name: 'Jabatan Teknologi Maklumat & Komunikasi', abbr: 'JTMK', headOfDeptId: 'dummy-user-id', description: 'ICT Department', auditGroupId: null },
  { name: 'Unit Perpustakaan', abbr: 'LIB', headOfDeptId: 'dummy-user-id', description: 'Library Unit', auditGroupId: null },
  { name: 'Jabatan Pengajian Am', abbr: 'JPA', headOfDeptId: 'dummy-user-id', description: 'General Studies Department', auditGroupId: null },
  { name: 'Unit Latihan & Pendidikan Lanjutan', abbr: 'ULPL', headOfDeptId: 'dummy-user-id', description: 'Training & Advanced Education', auditGroupId: null },
  { name: 'Jabatan Matematik, Sains & Komputer', abbr: 'JMSK', headOfDeptId: 'dummy-user-id', description: 'Mathematics, Science & Computer', auditGroupId: null },
  { name: 'Unit Teknologi Maklumat & Komunikasi', abbr: 'UTMK', headOfDeptId: 'dummy-user-id', description: 'ICT Support Unit', auditGroupId: null },
  { name: 'Unit Pembangunan & Senggaraan', abbr: 'UPS', headOfDeptId: 'dummy-user-id', description: 'Development & Maintenance', auditGroupId: null },
  { name: 'Jabatan Perdagangan', abbr: 'JP', headOfDeptId: 'dummy-user-id', description: 'Commerce Department', auditGroupId: null },
  { name: 'Pejabat TP Sokongan Akademik', abbr: 'TPSA', headOfDeptId: 'dummy-user-id', description: 'Academic Support Office', auditGroupId: null },
  { name: 'Jabatan Sukan & Kokurikulum', abbr: 'JSKK', headOfDeptId: 'dummy-user-id', description: 'Sports & Co-curriculum', auditGroupId: null },
  { name: 'Unit Pentadbiran', abbr: 'ADMIN', headOfDeptId: 'dummy-user-id', description: 'Administration Unit', auditGroupId: null },
  { name: 'Unit Instruksional & Multimedia', abbr: 'UIM', headOfDeptId: 'dummy-user-id', description: 'Instructional & Multimedia', auditGroupId: null },
  { name: 'Unit Peperiksaan', abbr: 'EXAM', headOfDeptId: 'dummy-user-id', description: 'Examination Unit', auditGroupId: null },
  { name: 'Jabatan Hal Ehwal Pelajar', abbr: 'JHEP', headOfDeptId: 'dummy-user-id', description: 'Student Affairs Department', auditGroupId: null },
  { name: 'Pejabat Pengarah', abbr: 'DIR', headOfDeptId: 'dummy-user-id', description: 'Director Office', auditGroupId: null },
  { name: 'Unit Pengurusan Kualiti', abbr: 'QMS', headOfDeptId: 'dummy-user-id', description: 'Quality Management Unit', auditGroupId: null },
  { name: 'Unit Psikologi & Kerjaya', abbr: 'UPK', headOfDeptId: 'dummy-user-id', description: 'Psychology & Career', auditGroupId: null },
  { name: 'Unit Perhubungan & Latihan Industri', abbr: 'UPLI', headOfDeptId: 'dummy-user-id', description: 'Industrial Training', auditGroupId: null },
  { name: 'Unit CISEC', abbr: 'CISEC', headOfDeptId: 'dummy-user-id', description: 'CISEC Unit', auditGroupId: null },
  { name: 'Pejabat TP Akademik', abbr: 'TPA', headOfDeptId: 'dummy-user-id', description: 'Academic Deputy Office', auditGroupId: null },
  { name: 'Unit R&D', abbr: 'RND', headOfDeptId: 'dummy-user-id', description: 'Research & Development', auditGroupId: null }
];

// Configuration for generating sample users (Auditors) matching the provided data
export const DEPT_AUDITOR_COUNTS: Record<string, number> = {
  'Unit Kamsis': 6,
  'Jabatan Kejuruteraan Elektrik': 12,
  'Jabatan Kejuruteraan Awam': 3,
  'Jabatan Kejuruteraan Mekanikal': 3,
  'Jabatan Kejuruteraan Petrokimia': 2,
  'Jabatan Teknologi Maklumat & Komunikasi': 2,
  'Unit Perpustakaan': 2,
  'Jabatan Matematik, Sains & Komputer': 10,
  // Others default to 1 in logic
};

export const INITIAL_LOCATIONS: Omit<Location, 'id'>[] = [
  {
    name: 'Kamsis Block A',
    abbr: 'KAM-A',
    departmentId: 'dummy-dept-id',
    building: 'Hostel Complex',
    level: 'GND FLOOR',
    description: 'Male student accommodation block',
    supervisorId: 'dummy-user-id',
    contact: 'x101'
  },
  {
    name: 'High Voltage Lab',
    abbr: 'HV-LAB',
    departmentId: 'dummy-dept-id',
    building: 'Engineering Block E',
    level: 'FIRST FLOOR',
    description: 'Main electrical testing facility',
    supervisorId: 'dummy-user-id',
    contact: 'x202'
  },
  {
    name: 'Concrete Lab',
    abbr: 'CIV-LAB',
    departmentId: 'dummy-dept-id',
    building: 'Engineering Block C',
    level: 'GND FLOOR',
    description: 'Materials testing laboratory',
    supervisorId: 'dummy-user-id',
    contact: 'x303'
  },
  {
    name: 'Computer Lab 1',
    abbr: 'IT-LAB1',
    departmentId: 'dummy-dept-id',
    building: 'IT Centre',
    level: 'SECOND FLOOR',
    description: 'Software development lab',
    supervisorId: 'dummy-user-id',
    contact: 'x404'
  },
  {
    name: 'Main Library Hall',
    abbr: 'LIB-MAIN',
    departmentId: 'dummy-dept-id',
    building: 'Central Library',
    level: 'THIRD FLOOR',
    description: 'Main collection and reading area',
    supervisorId: 'dummy-user-id',
    contact: 'x505'
  }
];

// Added phaseId to each initial audit to match the mandatory phaseId property in AuditSchedule
export const INITIAL_AUDITS: Omit<AuditSchedule, 'id'>[] = [
  {
    locationId: 'dummy-loc-id',
    supervisorId: 'dummy-user-id',
    auditor1Id: null,
    auditor2Id: null,
    date: '2024-12-01',
    status: 'Pending',
    departmentId: 'dummy-dept-id',
    phaseId: 'p1'
  },
  {
    locationId: 'dummy-loc-id',
    supervisorId: 'dummy-user-id',
    auditor1Id: null,
    auditor2Id: null,
    date: '2024-12-05',
    status: 'Pending',
    departmentId: 'dummy-dept-id',
    phaseId: 'p1'
  },
  {
    locationId: 'dummy-loc-id',
    supervisorId: 'dummy-user-id',
    auditor1Id: null,
    auditor2Id: null,
    date: '2024-11-28',
    status: 'Pending',
    departmentId: 'dummy-dept-id',
    phaseId: 'p1'
  }
];

export const INITIAL_NOTIFICATIONS: AppNotification[] = [
  {
    id: 'n1',
    title: 'Asset Data Imported',
    message: 'System populated with latest departmental asset counts.',
    timestamp: 'Just now',
    type: 'success',
    read: false,
  },
  {
    id: 'n2',
    title: 'Schedule Optimization',
    message: 'JKE and Kamsis flagged as Mega Targets requiring multiple teams.',
    timestamp: '5 mins ago',
    type: 'info',
    read: false,
  }
];

// Set a dynamic date for mock user (45 days from now)
const fortyFiveDaysLater = new Date();
fortyFiveDaysLater.setDate(fortyFiveDaysLater.getDate() + 45);

// Branding Assets
export const BRAND = {
  logoBrand: '/brandhorizontal.png'
};

export const DEFAULT_BRANDING = {
  logoBrand: '/brandhorizontal.png',
  logoInstitution: '/Politeknik Kuching Sarawak logo.png'
};

export const BRANDING = { ...DEFAULT_BRANDING };
