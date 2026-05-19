import React from 'react';
import { UserCircle, Phone, Save, LogOut } from 'lucide-react';
import { User } from '@shared/types';

interface Props {
  currentUser: User;
  showProfile: boolean;
  profilePhone: string;
  profileSaving: boolean;
  primaryRole: string;
  roleClass: string;
  onPhoneChange: (val: string) => void;
  onSavePhone: () => void;
  onSignOut: () => void;
}

export const KioskProfilePanel: React.FC<Props> = ({
  currentUser,
  showProfile,
  profilePhone,
  profileSaving,
  primaryRole,
  roleClass,
  onPhoneChange,
  onSavePhone,
  onSignOut,
}) => {
  if (!showProfile) return null;

  return (
    <div className="absolute right-0 top-full mt-2 w-72 bg-white rounded-2xl border border-slate-200 shadow-xl z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
      <div className="bg-indigo-600 px-4 py-3 flex items-center gap-3">
        {currentUser.picture ? (
          <img src={currentUser.picture} className="w-10 h-10 rounded-full object-cover shrink-0 border-2 border-white/30" alt="" />
        ) : (
          <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center shrink-0">
            <UserCircle className="w-5 h-5 text-white" />
          </div>
        )}
        <div className="min-w-0">
          <p className="text-sm font-black text-white truncate">{currentUser.name}</p>
          <p className="text-[10px] text-indigo-200 truncate">{currentUser.email}</p>
        </div>
        <span className={`ml-auto shrink-0 text-[9px] font-black px-2 py-1 rounded-lg ${roleClass}`}>
          {primaryRole}
        </span>
      </div>
      <div className="p-4 space-y-3">
        <div>
          <label className="block text-[10px] font-black uppercase text-slate-400 tracking-widest mb-1.5">
            Contact Number
          </label>
          <div className="relative">
            <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
            <input
              type="tel"
              value={profilePhone}
              onChange={e => onPhoneChange(e.target.value)}
              placeholder="e.g. 012-3456789"
              className="w-full pl-9 pr-3 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent"
              maxLength={20}
            />
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={onSavePhone}
            disabled={profileSaving}
            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl text-xs font-black transition-colors"
          >
            {profileSaving ? (
              <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <Save className="w-3.5 h-3.5" />
            )}
            Save
          </button>
          <button
            onClick={onSignOut}
            className="flex items-center justify-center gap-1.5 px-3 py-2.5 border border-rose-200 hover:bg-rose-50 text-rose-600 rounded-xl text-xs font-black transition-colors"
          >
            <LogOut className="w-3.5 h-3.5" />
            Sign Out
          </button>
        </div>
      </div>
    </div>
  );
};
