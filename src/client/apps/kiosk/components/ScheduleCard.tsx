import React from 'react';
import { Calendar, Package, Loader2 } from 'lucide-react';
import { KioskSchedule, KioskUser, KioskPhase, AssignRole } from './types';
import { StatusBadge } from './StatusBadge';
import { UserSearchBox } from './UserSearchBox';

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
  onAssign: (scheduleId: string, userId: string, role: AssignRole) => Promise<void>;
  onUnassign: (scheduleId: string, role: AssignRole) => Promise<void>;
  onDateChange: (scheduleId: string, date: string) => Promise<void>;
}

export const ScheduleCard: React.FC<Props> = ({
  schedule,
  users,
  phases,
  maxAssets,
  saving,
  onAssign,
  onUnassign,
  onDateChange,
}) => {
  const isSaving = saving === schedule.id;
  const isCompleted = schedule.status === 'Completed';
  const isLocked = !!(schedule.date && schedule.auditor1Id && schedule.auditor2Id);

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
    if (role === 'supervisor') {
      return users.filter(
        u =>
          (u.roles.includes('Supervisor') || u.roles.includes('Coordinator') || u.roles.includes('Admin')) &&
          u.departmentId === schedule.departmentId,
      );
    }
    // Certified officers (auditors) cannot audit their own department
    return users.filter(
      u =>
        (u.roles.includes('Auditor') || u.roles.includes('Coordinator') || u.roles.includes('Supervisor') || u.roles.includes('Admin')) &&
        u.departmentId !== schedule.departmentId,
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
            <h3 className="font-black text-slate-900 text-sm leading-tight mb-0.5 line-clamp-2 break-words">
              {schedule.locationName}
            </h3>
            <p className="text-[11px] text-slate-500 font-medium line-clamp-2 break-words">
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
                min={minDate}
                max={maxDate}
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
 
          return (
            <div key={role}>
              <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-1">
                {ROLE_LABELS[role]}
              </p>
 
              {isCompleted || isLocked ? (
                <div className="px-3 py-2 bg-slate-50 rounded-xl">
                  <span className="text-xs font-bold text-slate-600">{currentName ?? '—'}</span>
                </div>
              ) : (
                <UserSearchBox
                  users={roleUsers(role)}
                  maxAssets={maxAssets}
                  placeholder={`Search ${ROLE_LABELS[role]}…`}
                  currentName={currentName}
                  onSelect={u => onAssign(schedule.id, u.id, role)}
                  onClear={() => onUnassign(schedule.id, role)}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
