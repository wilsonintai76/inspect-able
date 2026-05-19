import React from 'react';
import { ShieldCheck, Calendar, CheckCircle2, Clock, TrendingUp, GraduationCap, ShieldAlert, Info, Package } from 'lucide-react';
import { User } from '@shared/types';
import { KioskSchedule } from './types';

interface Props {
  currentUser: User;
  mySchedules: KioskSchedule[];
  myStats: {
    total: number;
    completed: number;
    inProgress: number;
    pending: number;
    completionRate: number;
    workload: number;
  };
  certInfo: {
    days: number;
    status: 'safe' | 'warning' | 'expired';
    expiryDate: string;
  } | null;
  saving: string | null;
  threshold: number;
  onDateChange: (scheduleId: string, newDate: string) => Promise<void>;
  onLocate: (locationName: string) => void;
}

export const KioskOfficerHub: React.FC<Props> = ({
  currentUser,
  mySchedules,
  myStats,
  certInfo,
  saving,
  threshold,
  onDateChange,
  onLocate,
}) => {
  const isOverThreshold = myStats.workload >= threshold;

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
      {/* Greeting Card */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 sm:p-8 rounded-3xl border border-slate-200 shadow-2xs">
        <div>
          <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            <ShieldCheck className="w-6 h-6 text-indigo-600 shrink-0" />
            Personal Officer Hub
          </h2>
          <p className="text-slate-500 text-xs sm:text-sm mt-1">
            Welcome back, <span className="font-extrabold text-slate-700">{currentUser.name}</span>. Manage your assigned inspections below.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0 bg-emerald-50 px-3 py-1.5 rounded-full border border-emerald-100 self-start md:self-auto">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
          <span className="text-[10px] font-black text-emerald-700 uppercase tracking-wider">Active duty</span>
        </div>
      </div>

      {/* Personal Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        {[
          { label: 'Total Assigned', value: myStats.total, icon: Calendar, bg: 'bg-blue-50 text-blue-600', border: 'border-blue-100' },
          { label: 'Completed', value: myStats.completed, icon: CheckCircle2, bg: 'bg-emerald-50 text-emerald-600', border: 'border-emerald-100' },
          { label: 'In Progress', value: myStats.inProgress, icon: Clock, bg: 'bg-amber-50 text-amber-600', border: 'border-amber-100' },
          { label: 'Completion Rate', value: `${myStats.completionRate}%`, icon: TrendingUp, bg: 'bg-indigo-50 text-indigo-600', border: 'border-indigo-100' },
          { 
            label: 'Workload', 
            value: `${myStats.workload.toLocaleString()} / ${threshold.toLocaleString()}`, 
            icon: Package, 
            bg: isOverThreshold ? 'bg-rose-50 text-rose-600' : 'bg-indigo-50 text-indigo-600', 
            border: isOverThreshold ? 'border-rose-200' : 'border-indigo-100',
            textClass: isOverThreshold ? 'text-rose-600 font-extrabold' : 'text-slate-900'
          }
        ].map((c, i) => (
          <div key={i} className={`bg-white p-4 sm:p-5 rounded-2xl border ${c.border} shadow-2xs flex items-center gap-3 sm:gap-4`}>
            <div className={`w-10 h-10 rounded-xl ${c.bg} flex items-center justify-center shrink-0`}>
              <c.icon className="w-5 h-5 animate-in zoom-in-50 duration-500" />
            </div>
            <div>
              <p className="text-[9px] sm:text-[10px] font-black text-slate-400 uppercase tracking-wider">{c.label}</p>
              <p className={`text-xs sm:text-base font-black ${c.textClass || 'text-slate-900'}`}>{c.value}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: My Schedules */}
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xs overflow-hidden">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between">
              <h3 className="font-extrabold text-slate-900 text-sm sm:text-base">My Assigned Tasks</h3>
              <span className="px-2.5 py-0.5 bg-slate-100 text-slate-600 rounded-full text-[9px] sm:text-[10px] font-black uppercase tracking-wider">
                {mySchedules.length} {mySchedules.length === 1 ? 'Inspection' : 'Inspections'}
              </span>
            </div>
            <div className="divide-y divide-slate-100">
              {mySchedules.map(s => {
                const isSavingDate = saving === s.id;
                return (
                  <div key={s.id} className="p-4 sm:p-5 hover:bg-slate-50/55 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-center gap-4 min-w-0">
                      {/* Calendar Block */}
                      <div className="w-12 h-12 rounded-xl bg-slate-50 border border-slate-200 flex flex-col items-center justify-center shrink-0">
                        <span className="text-[9px] font-black text-indigo-600 uppercase tracking-tight">
                          {s.date ? new Date(s.date).toLocaleString('default', { month: 'short' }) : 'N/A'}
                        </span>
                        <span className="text-base font-black text-slate-900 leading-none">
                          {s.date ? s.date.split('-')[2] : '-'}
                        </span>
                      </div>
                      
                      <div className="min-w-0">
                        <h4 className="font-black text-slate-900 text-sm sm:text-base truncate">
                          {s.locationName}
                        </h4>
                        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 mt-1">
                          <span className="text-[10px] sm:text-xs font-semibold text-slate-500">
                            {s.departmentName}
                          </span>
                          <span className="w-1 h-1 bg-slate-300 rounded-full"></span>
                          <span className="text-[10px] sm:text-xs font-bold text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded-md">
                            {s.totalAssets} Assets
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0">
                      {/* Date Picker Input */}
                      <div className="flex flex-col gap-0.5 items-start sm:items-end">
                        <label className="text-[8px] text-slate-400 font-black uppercase tracking-wider">Scheduled Date</label>
                        <div className="relative flex items-center">
                          <input
                            type="date"
                            title="Inspection Date"
                            value={s.date || ''}
                            disabled={isSavingDate}
                            onChange={(e) => onDateChange(s.id, e.target.value)}
                            className="px-2 py-1 bg-slate-50 hover:bg-slate-100 disabled:opacity-50 border border-slate-200 text-[10px] sm:text-xs font-extrabold text-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all cursor-pointer"
                          />
                          {isSavingDate && (
                            <span className="absolute right-2 w-3.5 h-3.5 border-2 border-indigo-600/30 border-t-indigo-600 rounded-full animate-spin" />
                          )}
                        </div>
                      </div>

                      {/* Status badge */}
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider border ${
                          s.status === 'Completed'
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-100'
                            : s.status === 'In Progress'
                            ? 'bg-amber-50 text-amber-700 border-amber-100'
                            : 'bg-slate-50 text-slate-600 border-slate-200'
                        }`}>
                          {s.status}
                        </span>

                        <button
                          onClick={() => onLocate(s.locationName)}
                          className="px-2.5 py-1 bg-indigo-50 hover:bg-indigo-600 text-indigo-700 hover:text-white rounded-lg text-[10px] font-black transition-all flex items-center gap-1 active:scale-95 shadow-2xs"
                        >
                          Locate
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
              {mySchedules.length === 0 && (
                <div className="p-10 text-center">
                  <div className="w-12 h-12 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-3">
                    <Calendar className="w-6 h-6 text-slate-300" />
                  </div>
                  <p className="text-xs text-slate-500 font-bold">No upcoming inspections assigned to you.</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Widgets */}
        <div className="space-y-6">
          {/* Certification Widget */}
          {certInfo && (
            <div className={`rounded-3xl p-5 text-white shadow-md relative overflow-hidden transition-all duration-300 ${
              certInfo.status === 'safe' ? 'bg-linear-to-br from-indigo-600 to-blue-700 shadow-indigo-500/10' :
              certInfo.status === 'warning' ? 'bg-linear-to-br from-amber-500 to-orange-600 shadow-amber-500/10' :
              'bg-linear-to-br from-rose-600 to-red-700 shadow-rose-500/10'
            }`}>
              <GraduationCap className="absolute -right-4 -bottom-4 text-white/10 w-24 h-24" />
              <div className="relative z-10">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-sm font-black uppercase tracking-wider">Certification</h4>
                  <div className="px-2.5 py-1 rounded-lg border border-white/20 text-[10px] font-black uppercase">
                    {certInfo.status === 'expired' ? 'Expired' : `${certInfo.days} Days Left`}
                  </div>
                </div>
                
                <p className="text-white/90 text-xs leading-relaxed mb-1">
                  {certInfo.status === 'safe' && `Your inspecting officer certificate is valid. It will expire on ${new Date(certInfo.expiryDate).toLocaleDateString()}.`}
                  {certInfo.status === 'warning' && `Your inspecting officer certificate is expiring soon on ${new Date(certInfo.expiryDate).toLocaleDateString()}. Please renew soon.`}
                  {certInfo.status === 'expired' && `Your certificate expired on ${new Date(certInfo.expiryDate).toLocaleDateString()}. Access to inspection forms is suspended.`}
                </p>
              </div>
            </div>
          )}

          {/* Security Widget */}
          <div className="bg-white rounded-3xl border border-slate-200 p-5 shadow-2xs space-y-3">
            <h4 className="text-xs font-black uppercase text-slate-400 tracking-wider flex items-center gap-1.5">
              <ShieldAlert className="w-4 h-4 text-indigo-600" />
              Security Policy
            </h4>
            <p className="text-[11px] sm:text-xs text-slate-500 leading-relaxed">
              To protect your session in shared campus workspaces, this kiosk will automatically log out and reset if no touch or mouse activity is detected for <span className="font-extrabold text-slate-800">5 minutes</span>.
            </p>
            <div className="p-3 rounded-xl bg-indigo-50 border border-indigo-100 flex items-start gap-2">
              <Info className="w-3.5 h-3.5 text-indigo-600 shrink-0 mt-0.5" />
              <p className="text-[10px] text-indigo-700 font-semibold leading-relaxed">
                Always sign out manually using the exit button in the top right profile menu when you are done.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
