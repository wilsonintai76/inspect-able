import React from 'react';
import { AuditPhase } from '@shared/types';

interface AuditPhaseFilterProps {
  auditPhases: AuditPhase[];
  selectedPhaseId: string;
  onPhaseChange: (id: string) => void;
}

export const AuditPhaseFilter: React.FC<AuditPhaseFilterProps> = ({ auditPhases, selectedPhaseId, onPhaseChange }) => (
  <div className="flex flex-wrap items-center gap-2 px-2">
    {['All', 'Unscheduled', ...auditPhases.map(p => ({ id: p.id, name: p.name }))].map(phase => {
      const isString = typeof phase === 'string';
      const phaseId = isString ? phase : (phase as { id: string; name: string }).id;
      const phaseName = phase === 'All' ? 'All Phases' : phase === 'Unscheduled' ? 'Unscheduled' : (phase as { id: string; name: string }).name;
      return (
        <button
          key={phaseId}
          onClick={() => onPhaseChange(phaseId)}
          className={`px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all border ${
            selectedPhaseId === phaseId
              ? 'bg-slate-800 text-white border-slate-800'
              : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'
          }`}
        >
          {phaseName}
        </button>
      );
    })}
  </div>
);
