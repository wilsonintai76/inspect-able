import React, { useMemo } from 'react';
import {
  AuditSchedule, User, Department, Location, AuditPhase, Building,
} from '@shared/types';
import { CheckCircle2, Clock, AlertTriangle, Package, Layers, TrendingUp, Calendar } from 'lucide-react';

interface Props {
  schedules: AuditSchedule[];
  departments: Department[];
  locations: Location[];
  users: User[];
  auditPhases: AuditPhase[];
  buildings: Building[];
  currentUser: User;
}

export const DashboardScreen: React.FC<Props> = ({
  schedules, departments, locations, users, auditPhases, currentUser,
}) => {
  const today = new Date().toISOString().split('T')[0];
  const todayDisplay = new Date().toLocaleDateString('en-MY', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  const stats = useMemo(() => {
    const activeLocs = locations.filter(l => l.status !== 'Archived');
    const total = schedules.length;
    const completed = schedules.filter(s => s.status === 'Completed').length;
    const inProgress = schedules.filter(s => s.status === 'In Progress').length;
    const pending = schedules.filter(s => s.status === 'Pending').length;
    const compliance = total > 0 ? Math.round((completed / total) * 100) : 0;
    const totalAssets = activeLocs.reduce((sum, l) => sum + (l.totalAssets || 0), 0);
    const certifiedUsers = users.filter(u => u.certificationExpiry && u.certificationExpiry >= today && u.status === 'Active').length;

    // Active phase
    const activePhase = auditPhases.find(p => {
      const start = new Date(p.startDate); start.setHours(0,0,0,0);
      const end = new Date(p.endDate); end.setHours(23,59,59,999);
      const now = new Date();
      return now >= start && now <= end;
    });

    // Today's scheduled inspections
    const todaySchedules = schedules.filter(s => s.date === today);

    return { total, completed, inProgress, pending, compliance, totalAssets, certifiedUsers, activePhase, todaySchedules, activeLocs: activeLocs.length };
  }, [schedules, locations, users, auditPhases, today]);

  // Department compliance
  const deptCompliance = useMemo(() => {
    return departments
      .filter(d => d.name !== 'Software Development')
      .map(d => {
        const deptSchedules = schedules.filter(s => s.departmentId === d.id);
        const completed = deptSchedules.filter(s => s.status === 'Completed').length;
        const total = deptSchedules.length;
        return {
          name: d.abbr || d.name.substring(0, 8),
          fullName: d.name,
          compliance: total > 0 ? Math.round((completed / total) * 100) : 0,
          total,
        };
      })
      .filter(d => d.total > 0)
      .sort((a, b) => b.compliance - a.compliance)
      .slice(0, 5);
  }, [departments, schedules]);

  return (
    <div className="space-y-4">
      {/* Greeting */}
      <div>
        <h2 className="text-lg font-black text-slate-900">
          Hello, {currentUser.name.split(' ')[0]} 👋
        </h2>
        <p className="text-xs text-slate-400 font-medium mt-0.5">{todayDisplay}</p>
      </div>

      {/* Active phase banner */}
      {stats.activePhase && (
        <div className="bg-blue-600 rounded-2xl p-4 text-white shadow-lg shadow-blue-500/20">
          <div className="flex items-center gap-2 mb-1">
            <Calendar className="w-4 h-4 text-blue-200" />
            <span className="text-[10px] font-black uppercase tracking-widest text-blue-200">Active Phase</span>
          </div>
          <p className="font-black text-sm">{stats.activePhase.name}</p>
          <p className="text-blue-200 text-xs mt-0.5">
            {stats.activePhase.startDate} → {stats.activePhase.endDate}
          </p>
        </div>
      )}

      {/* Compliance ring card */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-5">
        <div className="flex items-center gap-6">
          {/* Ring */}
          <div className="relative w-24 h-24 shrink-0">
            <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36">
              <circle cx="18" cy="18" r="15.9" fill="none" stroke="#f1f5f9" strokeWidth="3.2" />
              <circle
                cx="18" cy="18" r="15.9" fill="none"
                stroke={stats.compliance >= 80 ? '#10b981' : stats.compliance >= 50 ? '#f59e0b' : '#ef4444'}
                strokeWidth="3.2"
                strokeDasharray={`${stats.compliance} ${100 - stats.compliance}`}
                strokeLinecap="round"
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-xl font-black text-slate-900">{stats.compliance}%</span>
              <span className="text-[9px] font-bold text-slate-400 uppercase">Done</span>
            </div>
          </div>
          <div className="flex-1 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-500 font-medium">Completed</span>
              <span className="font-black text-emerald-600 text-sm">{stats.completed}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-500 font-medium">In Progress</span>
              <span className="font-black text-blue-600 text-sm">{stats.inProgress}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-500 font-medium">Pending</span>
              <span className="font-black text-amber-600 text-sm">{stats.pending}</span>
            </div>
            <div className="border-t border-slate-100 pt-2 flex items-center justify-between">
              <span className="text-xs text-slate-500 font-medium">Total</span>
              <span className="font-black text-slate-900 text-sm">{stats.total}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Quick stat cards */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
          <div className="w-9 h-9 bg-blue-50 rounded-xl flex items-center justify-center mb-2">
            <Package className="w-4.5 h-4.5 text-blue-600" />
          </div>
          <p className="text-2xl font-black text-slate-900">{(stats.totalAssets).toLocaleString()}</p>
          <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest mt-0.5">Total Assets</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
          <div className="w-9 h-9 bg-emerald-50 rounded-xl flex items-center justify-center mb-2">
            <CheckCircle2 className="w-4.5 h-4.5 text-emerald-600" />
          </div>
          <p className="text-2xl font-black text-slate-900">{stats.certifiedUsers}</p>
          <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest mt-0.5">Certified</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
          <div className="w-9 h-9 bg-indigo-50 rounded-xl flex items-center justify-center mb-2">
            <Layers className="w-4.5 h-4.5 text-indigo-600" />
          </div>
          <p className="text-2xl font-black text-slate-900">{stats.activeLocs}</p>
          <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest mt-0.5">Locations</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
          <div className="w-9 h-9 bg-amber-50 rounded-xl flex items-center justify-center mb-2">
            <Clock className="w-4.5 h-4.5 text-amber-600" />
          </div>
          <p className="text-2xl font-black text-slate-900">{stats.todaySchedules.length}</p>
          <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest mt-0.5">Today</p>
        </div>
      </div>

      {/* Dept compliance */}
      {deptCompliance.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp className="w-4 h-4 text-slate-400" />
            <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Dept. Compliance</p>
          </div>
          <div className="space-y-3">
            {deptCompliance.map(dept => (
              <div key={dept.name}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-bold text-slate-700 truncate max-w-40">{dept.fullName}</span>
                  <span className={`text-xs font-black ${dept.compliance >= 80 ? 'text-emerald-600' : dept.compliance >= 50 ? 'text-amber-600' : 'text-rose-600'}`}>
                    {dept.compliance}%
                  </span>
                </div>
                <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${dept.compliance >= 80 ? 'bg-emerald-500' : dept.compliance >= 50 ? 'bg-amber-500' : 'bg-rose-500'}`}
                    style={{ width: `${dept.compliance}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Today's schedules */}
      {stats.todaySchedules.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="w-4 h-4 text-amber-500" />
            <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Today's Inspections ({stats.todaySchedules.length})</p>
          </div>
          <div className="space-y-2">
            {stats.todaySchedules.slice(0, 4).map(s => {
              const loc = locations.find(l => l.id === s.locationId);
              return (
                <div key={s.id} className="flex items-center gap-2 py-1.5 border-b border-slate-50 last:border-0">
                  <div className={`w-2 h-2 rounded-full shrink-0 ${s.status === 'Completed' ? 'bg-emerald-500' : s.status === 'In Progress' ? 'bg-blue-500' : 'bg-amber-400'}`} />
                  <span className="text-xs font-bold text-slate-700 truncate">{loc?.name || s.locationId}</span>
                  <span className={`ml-auto text-[9px] font-black uppercase shrink-0 ${s.status === 'Completed' ? 'text-emerald-600' : s.status === 'In Progress' ? 'text-blue-600' : 'text-amber-600'}`}>
                    {s.status}
                  </span>
                </div>
              );
            })}
            {stats.todaySchedules.length > 4 && (
              <p className="text-[10px] text-slate-400 font-medium text-center pt-1">
                + {stats.todaySchedules.length - 4} more
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
