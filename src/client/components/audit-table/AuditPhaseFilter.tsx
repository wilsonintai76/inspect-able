import React from 'react';
import { AuditPhase } from '@shared/types';

interface AuditPhaseFilterProps {
  auditPhases: AuditPhase[];
  selectedPhaseId: string;
  onPhaseChange: (id: string) => void;
}

export const AuditPhaseFilter: React.FC<AuditPhaseFilterProps> = ({ auditPhases, selectedPhaseId, onPhaseChange }) => (
  <div className="flex flex-wrap items-center gap-2 px-2">
    {[
      { id: 'All', name: 'All Phases' },
      { id: 'Unscheduled', name: 'Unscheduled' },
      ...auditPhases.map(p => ({ id: p.id, name: p.name }))
    ].map(phase => (
      <button
        key={phase.id}
        onClick={() => onPhaseChange(phase.id)}
        className={`px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all border ${
          selectedPhaseId === phase.id
            ? 'bg-slate-800 text-white border-slate-800'
            : phase.id === 'Unscheduled'
            ? 'bg-amber-50 text-amber-600 border-amber-200 hover:bg-amber-100'
            : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'
        }`}
      >
        {phase.name}
      </button>
    ))}
  </div>
);
