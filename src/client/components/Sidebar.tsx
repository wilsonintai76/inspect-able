
import React from 'react';
import { UserRole, AppView } from '@shared/types';
import { useRBAC } from '../contexts/RBACContext';
import { BRAND, BRANDING } from '../constants';
import { 
  ShieldCheck, 
  X, 
  PieChart, 
  CalendarDays, 
  Users, 
  Network, 
  MapPin, 
  Settings, 
  Server, 
  Database, 
  LogOut,
  Building2,
  LayoutDashboard,
  Languages,
  ShieldAlert
} from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
  activeView: AppView;
  onViewChange: (view: AppView) => void;
  onLogout: () => void;
  userRoles: UserRole[];
  isCertified?: boolean;
  isProfileComplete?: boolean;
}

interface NavItemProps {
  icon: React.ElementType;
  label: string;
  active?: boolean;
  onClick: () => void;
}

const NavItem: React.FC<NavItemProps> = ({ icon: Icon, label, active, onClick }) => (
  <button
    onClick={onClick}
    className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all group ${
      active 
        ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20' 
        : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900'
    }`}
  >
    <Icon className={`w-4 h-4 ${active ? 'text-white' : 'text-slate-400 group-hover:text-blue-600'}`} />
    <span className="font-semibold text-sm">{label}</span>
  </button>
);

export const Sidebar: React.FC<SidebarProps> = ({ 
  isOpen, onClose, activeView, onViewChange, onLogout, userRoles, isCertified, isProfileComplete 
}) => {
  const { hasPermission } = useRBAC();
  const { locale, setLocale, t } = useLanguage();
  const isAdmin = userRoles.includes('Admin');
  const isCoordinator = userRoles.includes('Coordinator');
  const isSupervisor = userRoles.includes('Supervisor');
  const isAuditor = userRoles.includes('Auditor');
  const isStaff = userRoles.includes('Staff');

  const hasPerm = (perm: string) => hasPermission(perm, userRoles);

  // Show Auditor Dashboard if user is certified, regardless of role.
  const showAuditorDashboard = isCertified && hasPerm('view:audit:assigned');
  
  const canAccessSchedule = hasPerm('view:schedule:all') || hasPerm('view:schedule:own');
  const canAccessLocations = hasPerm('manage:locations');
  const canAccessTeam = hasPerm('view:team:all') || hasPerm('view:team:own');
  const canAccessDepartments = hasPerm('manage:departments');
  const canAccessAdminSettings = hasPerm('manage:system');
  const showMainDashboard = hasPerm('view:overview');

  return (
    <>
      {isOpen && (
        <div 
          className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-40 lg:hidden"
          onClick={onClose}
        />
      )}

      <aside className={`
        fixed top-0 left-0 h-full bg-white border-r border-slate-200 z-50 w-72 
        transition-transform duration-300 ease-in-out lg:translate-x-0
        ${isOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        <div className="flex flex-col h-full p-6">
          <div className="flex items-center gap-3 mb-10 px-2">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center overflow-hidden shrink-0">
              <img 
                src={BRANDING.logoBrand} 
                alt="Logo" 
                className="w-full h-full object-contain" 
              />
            </div>
            <div>
              <h1 className="text-xl font-black tracking-tight text-slate-900 leading-tight">Inspect-<span className="text-blue-600">able</span></h1>
              <p className="text-[9px] text-slate-400 font-black uppercase tracking-widest leading-tight">Asset Inspection &amp; Management</p>
              <p className="text-[8px] text-slate-300 font-bold uppercase tracking-widest mt-0.5">v{import.meta.env.VITE_APP_VERSION || '1.0.0'}</p>
            </div>
            <button 
              onClick={onClose}
              title="Close sidebar"
              className="ml-auto lg:hidden text-slate-400 hover:text-slate-600"
            >
              <X className="w-6 h-6" />
            </button>
          </div>

          <nav className="grow space-y-2 overflow-y-auto pr-1">
            <div className="px-2 pb-2 text-[10px] font-black uppercase tracking-widest text-slate-400">{t('ui.main_menu')}</div>
            {showMainDashboard && (
              <NavItem 
                icon={PieChart} 
                label={t('nav.overview')} 
                active={activeView === 'overview'} 
                onClick={() => { onViewChange('overview'); onClose(); }} 
              />
            )}
            
            {hasPerm('view:admin:dashboard') && (
              <NavItem 
                icon={ShieldAlert} 
                label="Admin Hub" 
                active={activeView === 'admin-dashboard'} 
                onClick={() => { onViewChange('admin-dashboard'); onClose(); }} 
              />
            )}
            
            {showAuditorDashboard && (
              <NavItem 
                icon={LayoutDashboard} 
                label="Officer Hub" 
                active={activeView === 'auditor-dashboard'} 
                onClick={() => { onViewChange('auditor-dashboard'); onClose(); }} 
              />
            )}
            
            {canAccessSchedule && (
              <NavItem 
                icon={CalendarDays} 
                label={t('nav.inspection_schedule')} 
                active={activeView === 'schedule'} 
                onClick={() => { onViewChange('schedule'); onClose(); }} 
              />
            )}
            
            {(canAccessLocations || canAccessTeam || canAccessDepartments || canAccessAdminSettings) && (
              <div className="px-2 pt-6 pb-2 text-[10px] font-black uppercase tracking-widest text-slate-400">{t('ui.administration')}</div>
            )}

            {canAccessTeam && (
              <NavItem 
                icon={Users} 
                label={t('nav.user_management')} 
                active={activeView === 'team'} 
                onClick={() => { onViewChange('team'); onClose(); }} 
              />
            )}

            {canAccessDepartments && (
              <NavItem 
                icon={Network} 
                label={t('nav.departments')} 
                active={activeView === 'departments'} 
                onClick={() => { onViewChange('departments'); onClose(); }} 
              />
            )}

            {canAccessLocations && (
              <NavItem 
                icon={MapPin} 
                label={t('nav.asset_locations')} 
                active={activeView === 'locations'} 
                onClick={() => { onViewChange('locations'); onClose(); }} 
              />
            )}

            {canAccessLocations && (
              <NavItem 
                icon={Building2} 
                label="Building Registry" 
                active={activeView === 'buildings'} 
                onClick={() => { onViewChange('buildings'); onClose(); }} 
              />
            )}

            {canAccessAdminSettings && (
              <NavItem 
                icon={Settings} 
                label={t('nav.system_settings')} 
                active={activeView === 'settings'}
                onClick={() => { onViewChange('settings'); onClose(); }} 
              />
            )}
          </nav>

          <div className="mt-auto pt-6 space-y-4">
            {/* Language Selection Removed (v1.9.6) */}
            <div className="bg-slate-900 rounded-2xl p-4 text-white relative overflow-hidden">
              <div className="relative z-10">
                <p className="text-xs font-medium text-slate-400 mb-1">Infrastructure</p>
                <p className="text-sm font-bold mb-3 flex items-center gap-2">
                  <Server className="w-4 h-4 text-emerald-400" />
                  Cloudflare Workers
                </p>
                <div className="h-1.5 w-full bg-white/10 rounded-full overflow-hidden">
                  <div className="h-full w-full bg-emerald-500"></div>
                </div>
                <div className="flex items-center justify-between mt-2">
                  <p className="text-[10px] text-emerald-300 font-bold flex items-center gap-1">
                    <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></span>
                    D1 · KV · R2
                  </p>
                  <span className="text-[10px] text-slate-500 font-mono font-medium">v{import.meta.env.VITE_APP_VERSION || '1.0.0'}</span>
                </div>
              </div>
              <Database className="absolute -right-4 -bottom-4 text-white/5 w-24 h-24" />
            </div>
            
            <button 
              onClick={onLogout}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-red-600 hover:border-red-100 transition-all text-sm font-semibold"
            >
              <LogOut className="w-4 h-4" />
              Logout
            </button>
          </div>
        </div>
      </aside>
    </>
  );
};

