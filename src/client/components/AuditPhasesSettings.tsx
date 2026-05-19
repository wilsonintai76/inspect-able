
import React, { useState } from 'react';
import { AuditPhase } from '@shared/types';
import { CalendarX, Pencil, CalendarCheck, ChevronRight, Zap, History } from 'lucide-react';

interface AuditPhasesSettingsProps {
  phases: AuditPhase[];
  isAdmin?: boolean;
  onAdd: (phase: Omit<AuditPhase, 'id'>) => void;
  onUpdate: (id: string, updates: Partial<AuditPhase>) => void;
  onDelete: (id: string) => void;
}

const PHASE_NAMES = ['Phase 1', 'Phase 2', 'Phase 3'];
const PHASE_DURATION_DAYS = 30;

/** Returns YYYY-MM-DD string for a date offset by N days */
const addDays = (dateStr: string, days: number): string => {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
};

/** Formats YYYY-MM-DD to DD/MM/YYYY */
const formatDisplayDate = (dateStr: string): string => {
  if (!dateStr) return '—';
  try {
    const [year, month, day] = dateStr.split('-');
    return `${day}/${month}/${year}`;
  } catch (e) {
    return dateStr;
  }
};

export const AuditPhasesSettings: React.FC<AuditPhasesSettingsProps> = ({ phases, isAdmin = false, onAdd, onUpdate, onDelete }) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [startDate, setStartDate] = useState('');

  // Determine which phase slot is being edited/created (0-indexed)
  const editingPhase = phases.find(p => p.id === editingId);
  const editingSlot = editingPhase ? PHASE_NAMES.indexOf(editingPhase.name) : -1;

  const handleStartDateChange = (value: string) => {
    setStartDate(value);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!startDate) return;

    const endDate = addDays(startDate, PHASE_DURATION_DAYS);

    if (editingId) {
      onUpdate(editingId, { startDate, endDate });
      setEditingId(null);
    }
    setStartDate('');
  };

  const startEdit = (phase: AuditPhase) => {
    setEditingId(phase.id);
    setStartDate(phase.startDate || '');
  };

  const resetForm = () => {
    setEditingId(null);
    setStartDate('');
  };

  const checkIsActive = (phase: AuditPhase) => {
    const today = new Date();
    const start = new Date(phase.startDate);
    const end = new Date(phase.endDate);
    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);
    return today >= start && today <= end;
  };

  // Sort phases by their fixed name order
  const sortedPhases = [...phases].sort((a, b) =>
    PHASE_NAMES.indexOf(a.name) - PHASE_NAMES.indexOf(b.name)
  );

  return (
    <div className="bg-white rounded-[32px] border border-slate-200 shadow-sm overflow-hidden p-8 mt-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <h3 className="text-xl font-bold text-slate-900">Movable Asset Inspection Phases</h3>
          <p className="text-sm text-slate-500">
            Set the start date for each phase. The end date is automatically set to 30 days later.
          </p>
        </div>
      </div>

      {(!phases || phases.length === 0) ? (
        <div className="text-center py-10 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
          <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-3 text-slate-400">
            <CalendarX className="w-6 h-6" />
          </div>
          <p className="text-sm text-slate-500 font-medium">No audit phases defined.</p>
          <p className="text-xs text-slate-400">Phases will be automatically created. Contact your administrator.</p>
        </div>
      ) : (
        <div className="max-h-125 overflow-y-auto custom-scrollbar pr-2">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {sortedPhases.map(phase => {
            const isActive = checkIsActive(phase);
            const isEditing = editingId === phase.id;
            // Use local state if editing, otherwise use phase's values
            const displayStart = isEditing ? startDate : phase.startDate;
            const autoEnd = displayStart ? addDays(displayStart, PHASE_DURATION_DAYS) : phase.endDate;

            return (
              <div
                key={phase.id}
                className={`p-5 rounded-3xl border-2 transition-all duration-300 relative overflow-hidden group ${
                  isEditing 
                    ? 'bg-blue-50/30 border-blue-500 shadow-xl shadow-blue-500/10 scale-[1.02] z-10'
                    : isActive
                    ? 'bg-emerald-50/40 border-emerald-500 shadow-lg shadow-emerald-500/10'
                    : 'bg-white border-slate-100 hover:border-slate-200'
                }`}
              >
                {isActive && !isEditing && (
                  <div className="absolute top-0 right-0 p-2">
                    <span className="flex h-3 w-3 relative">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
                    </span>
                  </div>
                )}

                <div className="flex justify-between items-start mb-4">
                  <h4 className={`font-black text-lg tracking-tight ${isEditing ? 'text-blue-900' : isActive ? 'text-emerald-900' : 'text-slate-900'}`}>
                    {phase.name}
                  </h4>
                  <div className="flex gap-1">
                    {isAdmin && !isEditing && (
                      <button
                        onClick={() => startEdit(phase)}
                        className={`w-8 h-8 rounded-xl flex items-center justify-center transition-colors ${
                          isActive
                            ? 'text-emerald-600 hover:bg-emerald-500/10'
                            : 'text-slate-400 hover:text-blue-600 hover:bg-blue-50'
                        }`}
                        title="Set Start Date"
                      >
                        <Pencil className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </div>

                <div className={`space-y-4 ${isEditing ? 'animate-in fade-in zoom-in-95' : ''}`}>
                  <div className="flex items-center gap-3 text-xs font-bold flex-wrap">
                    {isEditing ? (
                      <div className="grow space-y-1">
                        <label className="text-[8px] font-black uppercase text-blue-400 tracking-widest block pl-1">Start Date</label>
                        <input
                          autoFocus
                          type="date"
                          title="Phase start date"
                          className="w-full px-3 py-1.5 bg-white border-2 border-blue-200 rounded-xl text-xs font-bold focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 outline-none transition-all shadow-sm"
                          value={startDate}
                          onChange={e => handleStartDateChange(e.target.value)}
                        />
                      </div>
                    ) : (
                      <div className={`px-2.5 py-1.5 rounded-lg border flex items-center gap-2 ${isActive ? 'bg-white border-emerald-200 text-emerald-700' : 'bg-slate-50 border-slate-100 text-slate-500'}`}>
                        <CalendarCheck className="w-3 h-3" />
                        {formatDisplayDate(phase.startDate)}
                      </div>
                    )}
                    
                    {!isEditing && <ChevronRight className={`w-3 h-3 ${isActive ? 'text-emerald-300' : 'text-slate-300'}`} />}
                    
                    {!isEditing && (
                      <div className={`px-2.5 py-1.5 rounded-lg border flex items-center gap-2 ${isActive ? 'bg-white border-emerald-200 text-emerald-700' : 'bg-slate-50 border-slate-100 text-slate-500'}`}>
                        <CalendarX className="w-3 h-3" />
                        {formatDisplayDate(autoEnd)}
                      </div>
                    )}
                  </div>

                  {isEditing && (
                    <div className="flex items-center gap-3 text-xs font-bold pt-1 border-t border-blue-100/50">
                      <div className="grow space-y-1">
                         <label className="text-[8px] font-black uppercase text-slate-400 tracking-widest block pl-1">End Date (Auto)</label>
                         <div className="px-3 py-1.5 bg-slate-100/50 border border-slate-200 rounded-xl text-xs text-slate-400 flex items-center gap-2">
                            <CalendarX className="w-3 h-3" />
                            {formatDisplayDate(autoEnd)}
                         </div>
                      </div>
                    </div>
                  )}

                  <div className="flex items-center justify-between">
                    <div className="text-[9px] font-bold text-slate-300 uppercase tracking-widest">
                      30-day window
                    </div>
                    {isEditing && (
                      <div className="flex gap-1.5">
                        <button 
                          onClick={handleSubmit} 
                          disabled={!startDate}
                          className="w-8 h-8 bg-blue-600 text-white rounded-lg flex items-center justify-center hover:bg-blue-700 shadow-md shadow-blue-500/20 active:scale-90 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                          title="Save Changes"
                        >
                          <Zap className="w-3 h-3 fill-current" />
                        </button>
                        <button 
                          onClick={resetForm}
                          className="w-8 h-8 bg-white text-slate-400 border border-slate-200 rounded-lg flex items-center justify-center hover:bg-slate-50 active:scale-90 transition-all"
                          title="Cancel"
                        >
                          <CalendarX className="w-3 h-3" />
                        </button>
                      </div>
                    )}
                  </div>

                  {!isEditing && (
                    isActive ? (
                      <div className="flex items-center gap-2 py-2 px-3 bg-emerald-500 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest w-fit animate-pulse">
                        <Zap className="w-3 h-3" />
                        Live Operation Window
                      </div>
                    ) : (
                      <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                        <History className="w-3 h-3" />
                        Standard Window
                      </div>
                    )
                  )}
                </div>
              </div>
            );
          })}
          </div>
        </div>
      )}
    </div>
  );
};
