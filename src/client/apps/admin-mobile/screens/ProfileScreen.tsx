import React, { useState } from 'react';
import { User } from '@shared/types';
import { UserCircle, Phone, Save, Award, Building, Briefcase, LogOut } from 'lucide-react';
import { gateway } from '../../../services/dataGateway';

interface Props {
  currentUser: User;
  onLogout: () => void;
  onUserUpdate: (updated: User) => void;
}

export const AdminMobileProfile: React.FC<Props> = ({ currentUser, onLogout, onUserUpdate }) => {
  const [phone, setPhone] = useState(currentUser.contactNumber || '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const today = new Date().toISOString().split('T')[0];
  const certExpiry = currentUser.certificationExpiry;
  const certValid = certExpiry && certExpiry >= today;
  const certDaysLeft = certExpiry ? Math.ceil((new Date(certExpiry).getTime() - Date.now()) / 86400000) : null;

  const handleSave = async () => {
    setSaving(true);
    try {
      await gateway.updateUser(currentUser.id, { contactNumber: phone });
      onUserUpdate({ ...currentUser, contactNumber: phone });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      alert('Failed to save. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const role = currentUser.roles?.[0] || 'Guest';
  const roleColour: Record<string, string> = {
    Admin: 'bg-purple-100 text-purple-700 border-purple-200',
    Coordinator: 'bg-amber-100 text-amber-700 border-amber-200',
    Supervisor: 'bg-indigo-100 text-indigo-700 border-indigo-200',
    Inspector: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    Guest: 'bg-slate-100 text-slate-600 border-slate-200',
  };

  return (
    <div className="space-y-4">
      {/* Avatar card */}
      <div className="bg-gradient-to-br from-blue-600 to-indigo-700 rounded-3xl p-6 text-white shadow-xl shadow-blue-500/20">
        <div className="flex items-center gap-4">
          {currentUser.picture ? (
            <img src={currentUser.picture} alt="" className="w-16 h-16 rounded-2xl object-cover border-2 border-white/30 shadow-lg" />
          ) : (
            <div className="w-16 h-16 rounded-2xl bg-white/20 flex items-center justify-center">
              <UserCircle className="w-9 h-9 text-white" />
            </div>
          )}
          <div className="min-w-0">
            <h2 className="text-lg font-black truncate">{currentUser.name}</h2>
            <p className="text-blue-200 text-xs truncate">{currentUser.email}</p>
            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
              <span className={`px-2.5 py-1 rounded-xl text-[10px] font-black uppercase border ${roleColour[role] || roleColour.Guest}`}>
                {role}
              </span>
              {currentUser.designation && (
                <span className="text-blue-200 text-[10px] font-medium">{currentUser.designation}</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Department */}
      {currentUser.departmentId && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center">
              <Building className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Department</p>
              <p className="text-sm font-bold text-slate-900 mt-0.5">{currentUser.departmentId}</p>
            </div>
          </div>
        </div>
      )}

      {/* Certification */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 bg-emerald-50 rounded-xl flex items-center justify-center">
            <Award className="w-5 h-5 text-emerald-600" />
          </div>
          <div>
            <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Certification</p>
          </div>
        </div>
        {certValid ? (
          <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-3">
            <p className="text-emerald-700 font-bold text-sm">✓ Valid Certificate</p>
            <p className="text-emerald-600 text-xs mt-0.5">
              Expires: {certExpiry} ({certDaysLeft}d left)
            </p>
          </div>
        ) : (
          <div className="bg-rose-50 border border-rose-100 rounded-xl p-3">
            <p className="text-rose-700 font-bold text-sm">✗ No valid certificate</p>
            <p className="text-rose-500 text-xs mt-0.5">
              {certExpiry ? `Expired: ${certExpiry}` : 'No certificate issued'}
            </p>
          </div>
        )}
      </div>

      {/* Contact */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 space-y-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-slate-50 rounded-xl flex items-center justify-center">
            <Phone className="w-5 h-5 text-slate-500" />
          </div>
          <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Contact Number</p>
        </div>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="tel"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              placeholder="e.g. 012-3456789"
              maxLength={20}
              className="w-full pl-10 pr-3 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent bg-slate-50"
            />
          </div>
          <button
            onClick={handleSave}
            disabled={saving}
            className={`flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-bold transition-all active:scale-95 ${
              saved ? 'bg-emerald-500 text-white' : 'bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-500/20'
            } disabled:opacity-60`}
          >
            {saving ? (
              <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            {saved ? 'Saved!' : 'Save'}
          </button>
        </div>
      </div>

      {/* Sign out */}
      <button
        onClick={onLogout}
        className="w-full flex items-center justify-center gap-2.5 py-3.5 bg-rose-50 border border-rose-100 text-rose-600 rounded-2xl font-bold text-sm active:scale-95 transition-all"
      >
        <LogOut className="w-4 h-4" />
        Sign Out
      </button>

      <p className="text-[10px] text-slate-400 text-center font-medium pb-2">
        Inspect-able v{import.meta.env.VITE_APP_VERSION} · Admin Mobile
      </p>
    </div>
  );
};
