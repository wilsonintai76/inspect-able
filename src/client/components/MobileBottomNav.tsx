import React from 'react';
import { AppView } from '@shared/types';
import { hasCapability } from '../lib/pbacUtils';
import {
  LayoutDashboard,
  CalendarDays,
  Users,
  Network,
  MapPin,
  Settings,
  UserCircle,
} from 'lucide-react';

interface MobileBottomNavProps {
  activeView: AppView;
  onViewChange: (view: AppView) => void;
  userRoles: string[];
  isCertified?: boolean;
  qualifications?: string[];
}

interface NavItem {
  view: AppView;
  icon: React.ElementType;
  label: string;
}

export const MobileBottomNav: React.FC<MobileBottomNavProps> = ({
  activeView,
  onViewChange,
  userRoles,
  isCertified,
  qualifications,
}) => {
  const clientUser = {
    roles: userRoles,
    qualifications: qualifications || [],
    certificationExpiry: isCertified ? '2099-12-31' : null,
  };

  const canAccessSchedule =
    hasCapability(clientUser, 'schedule:manage_dept') ||
    hasCapability(clientUser, 'schedule:manage_all') ||
    hasCapability(clientUser, 'asset_inspector');
  const canAccessTeam = hasCapability(clientUser, 'manage:users');
  const canAccessDepts = hasCapability(clientUser, 'manage:departments');
  const canAccessLocations = hasCapability(clientUser, 'manage:locations');
  const canAccessSettings =
    hasCapability(clientUser, 'manage:settings') ||
    hasCapability(clientUser, 'system:admin');

  // Build the nav items list — always show Dashboard + Profile, add role-gated items
  const navItems: NavItem[] = [
    { view: 'dashboard', icon: LayoutDashboard, label: 'Home' },
    ...(canAccessSchedule
      ? [{ view: 'schedule' as AppView, icon: CalendarDays, label: 'Schedule' }]
      : []),
    ...(canAccessTeam
      ? [{ view: 'team' as AppView, icon: Users, label: 'Team' }]
      : []),
    ...(canAccessDepts
      ? [{ view: 'departments' as AppView, icon: Network, label: 'Depts' }]
      : []),
    ...(canAccessLocations
      ? [{ view: 'locations' as AppView, icon: MapPin, label: 'Locations' }]
      : []),
    ...(canAccessSettings
      ? [{ view: 'settings' as AppView, icon: Settings, label: 'Settings' }]
      : []),
    { view: 'profile', icon: UserCircle, label: 'Profile' },
  ];

  // On very small screens cap at 5 items to avoid crowding
  const visibleItems = navItems.slice(0, 5);

  return (
    <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-md border-t border-slate-200 shadow-[0_-4px_20px_rgba(0,0,0,0.06)]">
      <div className="flex items-stretch justify-around h-16 px-1">
        {visibleItems.map(({ view, icon: Icon, label }) => {
          const isActive = activeView === view;
          return (
            <button
              key={view}
              id={`mobile-nav-${view}`}
              onClick={() => onViewChange(view)}
              className={`flex flex-col items-center justify-center gap-1 flex-1 py-2 px-1 transition-all active:scale-90 relative ${
                isActive ? 'text-blue-600' : 'text-slate-400'
              }`}
            >
              {isActive && (
                <span className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 rounded-full bg-blue-600 animate-in zoom-in-x" />
              )}
              <Icon
                className={`w-5 h-5 transition-all ${isActive ? 'text-blue-600' : 'text-slate-400'}`}
                strokeWidth={isActive ? 2.5 : 1.8}
              />
              <span
                className={`text-[9px] font-black uppercase tracking-wider leading-none transition-all ${
                  isActive ? 'text-blue-600' : 'text-slate-400'
                }`}
              >
                {label}
              </span>
            </button>
          );
        })}
      </div>
      {/* Safe area padding for iOS home indicator */}
      <div className="h-safe-area-inset-bottom" />
    </nav>
  );
};
