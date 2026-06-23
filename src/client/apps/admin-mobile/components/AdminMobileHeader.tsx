import React, { useState, useEffect } from 'react';
import { User } from '@shared/types';
import { LogOut, RefreshCw, UserCircle } from 'lucide-react';
import { AdminMobileView } from './AdminMobileBottomNav';
import { BRANDING } from '../../../constants';

const VIEW_TITLES: Record<AdminMobileView, string> = {
  dashboard: 'Dashboard',
  schedule: 'Inspection Schedule',
  team: 'Team',
  departments: 'Departments',
  locations: 'Locations',
  profile: 'My Profile',
};

interface Props {
  activeView: AdminMobileView;
  currentUser: User;
  onLogout: () => void;
  onRefresh: () => void;
  isRefreshing?: boolean;
}

export const AdminMobileHeader: React.FC<Props> = ({
  activeView, currentUser, onLogout, onRefresh, isRefreshing,
}) => {
  const [showMenu, setShowMenu] = useState(false);

  // Close menu on outside click
  useEffect(() => {
    if (!showMenu) return;
    const handler = () => setShowMenu(false);
    setTimeout(() => document.addEventListener('click', handler), 0);
    return () => document.removeEventListener('click', handler);
  }, [showMenu]);

  return (
    <header
      className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200 shadow-sm"
      style={{ paddingTop: 'env(safe-area-inset-top)' }}
    >
      <div className="flex items-center gap-3 px-4 h-14">
        {/* Logo */}
        {BRANDING.logoBrand ? (
          <img src={BRANDING.logoBrand} alt="Inspect-able" className="h-7 object-contain" />
        ) : (
          <div className="w-7 h-7 bg-blue-600 rounded-xl flex items-center justify-center">
            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
          </div>
        )}

        {/* Title */}
        <div className="flex-1 min-w-0">
          <h1 className="font-black text-slate-900 text-sm tracking-tight truncate">
            {VIEW_TITLES[activeView]}
          </h1>
          <p className="text-[10px] text-slate-400 font-medium truncate">
            {currentUser.name}
          </p>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          <button
            onClick={onRefresh}
            disabled={isRefreshing}
            className="w-9 h-9 flex items-center justify-center rounded-xl text-slate-400 hover:bg-slate-100 active:scale-90 transition-all"
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-blue-500' : ''}`} />
          </button>

          {/* Avatar + menu */}
          <div className="relative">
            <button
              onClick={(e) => { e.stopPropagation(); setShowMenu(s => !s); }}
              className="w-9 h-9 flex items-center justify-center rounded-xl hover:bg-slate-100 active:scale-90 transition-all overflow-hidden"
            >
              {currentUser.picture ? (
                <img src={currentUser.picture} alt="" className="w-8 h-8 rounded-xl object-cover" />
              ) : (
                <div className="w-8 h-8 rounded-xl bg-blue-100 flex items-center justify-center">
                  <UserCircle className="w-5 h-5 text-blue-600" />
                </div>
              )}
            </button>

            {showMenu && (
              <div
                className="absolute right-0 top-full mt-2 w-56 bg-white rounded-2xl border border-slate-200 shadow-xl z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-150"
                onClick={e => e.stopPropagation()}
              >
                <div className="bg-blue-600 px-4 py-3">
                  <p className="text-sm font-black text-white truncate">{currentUser.name}</p>
                  <p className="text-[10px] text-blue-200 truncate">{currentUser.email}</p>
                  <span className="inline-block mt-1 px-2 py-0.5 bg-white/20 text-white text-[9px] font-black rounded-lg uppercase tracking-widest">
                    {(currentUser.roles?.[0]) || 'Guest'}
                  </span>
                </div>
                <div className="p-2">
                  <button
                    onClick={() => { setShowMenu(false); onLogout(); }}
                    className="w-full flex items-center gap-2.5 px-3 py-2.5 text-rose-600 hover:bg-rose-50 rounded-xl text-sm font-bold transition-colors"
                  >
                    <LogOut className="w-4 h-4" />
                    Sign Out
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};
