import React from 'react';
import { Calendar, Loader2 } from 'lucide-react';
import { KioskSchedule, KioskUser, AssignRole } from './types';
import { ScheduleCard } from './ScheduleCard';

interface Props {
  schedules: KioskSchedule[];
  users: KioskUser[];
  loading: boolean;
  saving: string | null;
  onAssign: (scheduleId: string, userId: string, role: AssignRole) => Promise<void>;
  onUnassign: (scheduleId: string, role: AssignRole) => Promise<void>;
  onDateChange: (scheduleId: string, date: string) => Promise<void>;
}

export const KioskGrid: React.FC<Props> = ({
  schedules,
  users,
  loading,
  saving,
  onAssign,
  onUnassign,
  onDateChange,
}) => {
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-32 gap-4">
        <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
        <p className="text-sm font-bold text-slate-400">Loading schedule…</p>
      </div>
    );
  }

  if (schedules.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-32 gap-4">
        <Calendar className="w-10 h-10 text-slate-300" />
        <p className="text-sm font-bold text-slate-400">No schedules match your filters</p>
      </div>
    );
  }

  return (
    <>
      <p className="text-xs font-bold text-slate-500 mb-4">
        {schedules.length} slot{schedules.length !== 1 ? 's' : ''} shown
      </p>
      <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
        {schedules.map(s => (
          <ScheduleCard
            key={s.id}
            schedule={s}
            users={users}
            saving={saving}
            onAssign={onAssign}
            onUnassign={onUnassign}
            onDateChange={onDateChange}
          />
        ))}
      </div>
    </>
  );
};
