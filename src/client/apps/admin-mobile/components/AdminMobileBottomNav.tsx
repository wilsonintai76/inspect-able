import React from 'react';
import { hasCapability } from '../../../lib/pbacUtils';
import { User } from '@shared/types';
import {
  LayoutDashboard, CalendarDays, Users, Network, MapPin, UserCircle,
} from 'lucide-react';

export type AdminMobileView = 'dashboard' | 'schedule' | 'team' | 'departments' | 'locations' | 'profile';

interface NavItem {
  view: AdminMobileView;
  icon: React.ElementType;
  label: string;
}

interface Props {
  activeView: AdminMobileView;
  onViewChange: (view: AdminMobileView) => void;
  currentUser: User;
}

export const AdminMobileBottomNav: React.FC<Props> = ({ activeView, onViewChange, currentUser }) => {
  const pbac = { roles: currentUser.roles, qualifications: currentUser.qualifications || [], certificationExpiry: currentUser.certificationExpiry || null };

  const allItems: NavItem[] = [
    { view: 'dashboard', icon: LayoutDashboard, label: 'Home' },
    { view: 'schedule', icon: CalendarDays, label: 'Schedule' },
    { view: 'team', icon: Users, label: 'Team' },
    { view: 'departments', icon: Network, label: 'Depts' },
    { view: 'locations', icon: MapPin, label: 'Locations' },
    { view: 'profile', icon: UserCircle, label: 'Profile' },
  ];

  const visibleItems = allItems.filter(item => {
    if (item.view === 'dashboard' || item.view === 'profile') return true;
    if (item.view === 'schedule') return hasCapability(pbac, 'schedule:manage_dept') || hasCapability(pbac, 'schedule:manage_all') || hasCapability(pbac, 'asset_inspector');
    if (item.view === 'team') return hasCapability(pbac, 'manage:users');
    if (item.view === 'departments') return hasCapability(pbac, 'manage:departments');
    if (item.view === 'locations') return hasCapability(pbac, 'manage:locations');
    return false;
  });

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-md border-t border-slate-200 shadow-[0_-4px_24px_rgba(0,0,0,0.08)]"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
      <div className="flex items-stretch justify-around h-16">
        {visibleItems.map(({ view, icon: Icon, label }) => {
          const isActive = activeView === view;
          return (
            <button
              key={view}
              id={`admin-nav-${view}`}
              onClick={() => onViewChange(view)}
              className={`flex flex-col items-center justify-center gap-1 flex-1 py-2 px-1 transition-all active:scale-90 relative ${isActive ? 'text-blue-600' : 'text-slate-400'}`}
            >
              {isActive && (
                <span className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 rounded-full bg-blue-600" />
              )}
              <Icon
                className={`w-5 h-5 transition-all ${isActive ? 'text-blue-600' : 'text-slate-400'}`}
                strokeWidth={isActive ? 2.5 : 1.8}
              />
              <span className={`text-[9px] font-black uppercase tracking-wider leading-none ${isActive ? 'text-blue-600' : 'text-slate-400'}`}>
                {label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};
