import React from 'react';
import { Calendar, Package, Loader2, Phone, Plus, X } from 'lucide-react';
import { KioskSchedule, KioskUser, KioskPhase, AssignRole } from './types';
import { StatusBadge } from './StatusBadge';

const ROLE_LABELS: Record<AssignRole, string> = {
  supervisor: 'Supervisor',
  auditor1: 'Auditor 1',
  auditor2: 'Auditor 2',
};

interface Props {
  schedule: KioskSchedule;
  users: KioskUser[];
  phases: KioskPhase[];
  maxAssets: number;
  saving: string | null;
  currentUserId: string;
  currentUserRoles: string[];
  onAssign: (scheduleId: string, userId: string, role: AssignRole) => Promise<void>;
  onUnassign: (scheduleId: string, role: AssignRole) => Promise<void>;
  onDateChange: (scheduleId: string, date: string) => Promise<void>;
  onShowToast: (message: string, type: 'success' | 'warning' | 'error' | 'info') => void;
}

export const ScheduleCard: React.FC<Props> = ({
  schedule,
  users,
  phases,
  maxAssets,
  saving,
  currentUserId,
  currentUserRoles,
  onAssign,
  onUnassign,
  onDateChange,
  onShowToast,
}) => {
  const isSaving = saving === schedule.id;
  const isCompleted = schedule.status === 'Completed';
  const isLocked = schedule.isLocked === true;

  // Kiosk is self-assign only — no admin "assign others"

  // Get global date boundaries across all phases to allow planned phase overwriting
  const minDate = phases.length > 0
    ? phases.reduce((min, p) => p.startDate < min ? p.startDate : min, phases[0].startDate)
    : schedule.phaseStart;
  const maxDate = phases.length > 0
    ? phases.reduce((max, p) => p.endDate > max ? p.endDate : max, phases[0].endDate)
    : schedule.phaseEnd;
  const today = new Date().toISOString().split('T')[0];
  const phaseActive = today >= schedule.phaseStart && today <= schedule.phaseEnd;
 
  const roleUsers = (role: AssignRole): KioskUser[] => {
    // Supervisor is handled in main app — not assignable from kiosk
    if (role === 'supervisor') return [];
    // Certified officers (auditors) cannot audit their own department
    return users.filter(
      u =>
        (u.roles.includes('Auditor') || u.roles.includes('Coordinator') || u.roles.includes('Supervisor') || u.roles.includes('Admin')) &&
        u.departmentId !== schedule.departmentId &&
        u.id === currentUserId,
    );
  };
 
  return (
    <div
      className={`bg-white border rounded-3xl transition-all duration-200 hover:shadow-lg hover:shadow-slate-200/80 ${
        isCompleted ? 'opacity-75' : ''
      }`}
    >
      {/* ── Header ───────────────────────────────────────────────────── */}
      <div className="px-3 sm:px-6 pt-4 sm:pt-5 pb-3 sm:pb-4 border-b border-slate-100">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1.5 flex-wrap">
              <span className="px-2 py-0.5 bg-slate-100 text-slate-600 text-[10px] font-black rounded-lg uppercase tracking-wide">
                {schedule.departmentAbbr}
              </span>
              <StatusBadge status={schedule.status} />
              {phaseActive && (
                <span className="px-2 py-0.5 bg-blue-600 text-white text-[10px] font-black rounded-lg">
                  ACTIVE
                </span>
              )}
            </div>
            <h3 className="font-black text-slate-900 text-sm leading-tight mb-0.5 line-clamp-2 wrap-break-word">
              {schedule.locationName}
            </h3>
            <p className="text-[11px] text-slate-500 font-medium line-clamp-2 wrap-break-word">
              {schedule.departmentName}
            </p>
          </div>
 
          {/* Asset count */}
          <div className="text-right shrink-0">
            <div className="flex items-center gap-1 text-slate-800">
              <Package className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-indigo-500" />
              <span className="text-base sm:text-lg font-black">{schedule.totalAssets.toLocaleString()}</span>
            </div>
            <p className="text-[9px] sm:text-[10px] text-slate-400 font-bold uppercase">assets</p>
          </div>
        </div>
      </div>
 
      {/* ── Phase & Date ─────────────────────────────────────────────── */}
      <div className="px-3 sm:px-6 py-2 sm:py-3 bg-slate-50 border-b border-slate-100 flex flex-col gap-1.5 sm:gap-2">
        {/* Phase Info */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 shrink-0">
            <Calendar className="w-3.5 h-3.5 text-slate-400" />
            <span className="text-[11px] font-bold text-slate-700">{schedule.phaseName}</span>
          </div>
          <span className="text-[10px] font-medium text-slate-400">
            {schedule.phaseStart} <span className="mx-1">to</span> {schedule.phaseEnd}
          </span>
        </div>
 
        {/* Specific Date Setter */}
        <div className="flex items-center gap-2 pl-2 sm:pl-5">
          <span className="text-[10px] font-black uppercase text-indigo-400 tracking-widest shrink-0">
            Set Date:
          </span>
          <div className="flex-1 min-w-0 bg-white border border-slate-200 rounded-lg px-2 py-1">
            {!isCompleted && !isLocked ? (
              <input
                type="date"
                value={schedule.date ?? ''}
                title="Set audit date"
                placeholder="YYYY-MM-DD"
                onChange={e => onDateChange(schedule.id, e.target.value)}
                className="w-full text-[11px] font-bold bg-transparent text-slate-700 border-0 outline-none cursor-pointer"
              />
            ) : (
              <span className="text-[11px] font-bold text-slate-600 block py-0.5 px-1 bg-slate-50 border border-slate-100 rounded-md">
                {schedule.date ?? 'No date set'}
              </span>
            )}
          </div>
          {isSaving && <Loader2 className="w-3.5 h-3.5 text-indigo-500 animate-spin shrink-0" />}
        </div>
      </div>
 
      {/* ── Assignments ──────────────────────────────────────────────── */}
      <div className="px-3 sm:px-6 py-3 sm:py-4 space-y-2.5 sm:space-y-3">
        {(['supervisor', 'auditor1', 'auditor2'] as AssignRole[]).map(role => {
          const currentName = schedule[`${role}Name` as keyof KioskSchedule] as string | null;
          const currentContact = schedule[`${role}Contact` as keyof KioskSchedule] as string | null;
          const assignedId = schedule[`${role}Id` as keyof KioskSchedule] as string | null;
          const isAssignedToMe = assignedId === currentUserId;
          // Supervisor is always read-only in kiosk — assigned from main site only
          const showReadOnly = role === 'supervisor' || isCompleted || isLocked || (!!currentName && !isAssignedToMe);
 
          return (
            <div key={role}>
              <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-1">
                {ROLE_LABELS[role]}
              </p>
 
              {showReadOnly ? (
                <div className="px-3 py-2 bg-slate-50 rounded-xl flex flex-col gap-0.5">
                  <span className="text-xs font-bold text-slate-600">{currentName ?? '—'}</span>
                  {currentContact && (
                    <span className="text-[10px] text-slate-400 font-bold flex items-center gap-1 font-mono">
                      <Phone className="w-2.5 h-2.5 opacity-60 text-slate-300" />
                      {currentContact}
                    </span>
                  )}
                </div>
              ) : isAssignedToMe ? (
                // Assigned to me — show name + remove button
                <div className="flex items-center justify-between px-3 py-2 bg-indigo-50 border border-indigo-200 rounded-xl">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-indigo-800 truncate">{currentName}</p>
                    {currentContact && (
                      <p className="text-[10px] text-indigo-600/70 font-bold font-mono flex items-center gap-1 mt-0.5">
                        <Phone className="w-2.5 h-2.5 opacity-60" />{currentContact}
                      </p>
                    )}
                  </div>
                  <button
                    onClick={() => onUnassign(schedule.id, role)}
                    title="Remove my assignment"
                    className="ml-2 p-1.5 text-indigo-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all shrink-0"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                // Empty slot — self-assign button
                (() => {
                  const eligible = roleUsers(role);
                  const auditIsPast = !!(schedule.date && schedule.date < today);
                  const noDate = !schedule.date;
                  const canAssign = eligible.length > 0 && !auditIsPast;
                  return (
                    <button
                      onClick={() => {
                        if (noDate) {
                          onShowToast('Please set the audit date for this schedule before assigning yourself.', 'warning');
                          return;
                        }
                        if (canAssign) onAssign(schedule.id, currentUserId, role);
                      }}
                      disabled={eligible.length === 0 || auditIsPast}
                      className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all ${
                        noDate
                          ? 'bg-amber-50 border-2 border-amber-200 text-amber-600 hover:border-amber-300 hover:bg-amber-100 shadow-sm'
                          : canAssign
                          ? 'bg-white border-2 border-blue-100 text-blue-600 hover:border-blue-300 hover:bg-blue-50 shadow-sm'
                          : 'bg-slate-50 border border-slate-200 text-slate-400 cursor-not-allowed'
                      }`}
                      title={eligible.length === 0 ? 'You are not eligible for this slot' : auditIsPast ? 'Audit date has passed' : noDate ? 'Tap to see what to do first' : ''}
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Assign Myself
                    </button>
                  );
                })()
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
