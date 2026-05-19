import { AuditSchedule, User, AppNotification, Department, Location } from '@shared/types';

// ─── System Exclusions ─────────────────────────────────────────────
// Software Development is a superadmin internal department — excluded from
// consolidation, pairing, printing, and institutional counts.
export const SOFTWARE_DEV_DEPT_NAME = 'Software Development';

// Superadmin email — excluded from auditor counts, pairing, and printing.
export const SUPERADMIN_EMAIL = 'admin@poliku.edu.my';



// Branding Assets
export const BRAND = {
  logoBrand: '/brandhorizontal.png'
};

export const DEFAULT_BRANDING = {
  logoBrand: '/brandhorizontal.png',
  logoInstitution: '/Politeknik Kuching Sarawak logo.png'
};

export const BRANDING = { ...DEFAULT_BRANDING };
