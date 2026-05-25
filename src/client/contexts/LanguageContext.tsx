
import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { Locale } from '@shared/types';

interface LanguageContextType {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: string) => string;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

const translations: Record<Locale, Record<string, string>> = {
  en: {
    // Nav Labels
    'nav.overview': 'Institutional Dashboard',
    'nav.inspection_schedule': 'Inspection Schedule',
    'nav.inspecting_officer_dashboard': 'Institutional Dashboard',
    'nav.user_management': 'User Management',
    'nav.departments': 'Departments',
    'nav.asset_locations': 'Asset Locations',
    'nav.system_settings': 'System Settings',
    'nav.profile': 'My Profile',
    'nav.logout': 'Logout',
    
    // MOF Terms
    'term.inspection_schedule': 'Movable Asset Inspection Schedule',
    'term.inspection': 'Movable Asset Inspection',
    'term.inspection_report': 'Movable Asset Inspection Report',
    'term.inspecting_officer': 'Inspecting Officer',
    'term.head_of_department': 'Head of Department',
    'term.asset_location': 'Asset Location',
    
    // UI Elements
    'ui.main_menu': 'Main Menu',
    'ui.administration': 'Administration',
    'ui.database_connection': 'Database Connection',
    'ui.cloud_instance': 'Cloud Instance',
    'ui.language': 'Language',
    
    // Dashboard Specific
    'dashboard.title': 'Institutional Inspection Dashboard',
    'dashboard.subtitle': 'Real-time performance and compliance tracking across all departments.',
    'dashboard.stats_inspections': 'Total Inspections',
    'dashboard.stats_completed': 'Completed',
    'dashboard.stats_pending': 'Pending',
    'dashboard.stats_open_slots': 'Open Slots',
    'dashboard.stats_on_track': 'On Track',
    'dashboard.stats_assets': 'Assets Inspected',
    'dashboard.upcoming': 'Upcoming Inspections',
    'dashboard.no_upcoming': 'No upcoming inspections scheduled',
    'dashboard.velocity': 'Inspection Velocity',
    'dashboard.compliance': 'Performance',
    'dashboard.performance': 'Institutional Inspection Performance',
    'dashboard.progress': 'Institutional Inspection Progress',
    'dashboard.overall_completion': 'Overall Completion',
    'dashboard.global_goal': 'Global Goal',
    'dashboard.status': 'Status',
    'dashboard.on_track': 'On Track',
    'dashboard.at_risk': 'At Risk',
    'dashboard.tier_progress': 'Department Tier Progress',
    'dashboard.dept_breakdown': 'Department Breakdown',
    'dashboard.current_phase': 'Current Phase',
    'dashboard.phase_ends': 'Phase Ends'
  }
};

export const LanguageProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [locale, setLocaleState] = useState<Locale>(() => {
    return 'en';
  });

  const setLocale = (newLocale: Locale) => {
    setLocaleState(newLocale);
    localStorage.setItem('inspectable_locale', newLocale);
  };

  const t = (key: string): string => {
    return translations[locale][key] || key;
  };

  return (
    <LanguageContext.Provider value={{ locale, setLocale, t }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = () => {
  const context = useContext(LanguageContext);
  if (context === undefined) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
};
