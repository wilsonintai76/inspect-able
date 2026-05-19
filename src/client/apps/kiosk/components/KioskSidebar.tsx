import React from 'react';
import { Search, ChevronDown, Filter, Package } from 'lucide-react';
import { KioskPhase } from './types';

interface AuditorStat {
  name: string;
  assets: number;
  slots: number;
}

interface Props {
  phases: KioskPhase[];
  uniqueDepartments: { id: string; name: string }[];
  uniqueBuildings: { id: string; name: string; abbr: string }[];
  uniqueLevels: string[];
  uniqueLocations: { id: string; name: string; buildingId?: string | null; buildingName?: string | null; buildingAbbr?: string | null; level?: string | null }[];
  search: string;
  phaseFilter: string;
  statusFilter: string;
  departmentFilter: string;
  buildingFilter: string;
  levelFilter: string;
  locationFilter: string;
  auditorStats: AuditorStat[];
  threshold: number;
  onSearchChange: (v: string) => void;
  onPhaseChange: (v: string) => void;
  onStatusChange: (v: string) => void;
  onDepartmentChange: (v: string) => void;
  onBuildingChange: (v: string) => void;
  onLevelChange: (v: string) => void;
  onLocationChange: (v: string) => void;
  onClearFilters: () => void;
}

export const KioskSidebar: React.FC<Props> = ({
  phases,
  uniqueDepartments,
  uniqueBuildings,
  uniqueLevels,
  uniqueLocations,
  search,
  phaseFilter,
  statusFilter,
  departmentFilter,
  buildingFilter,
  levelFilter,
  locationFilter,
  auditorStats,
  threshold,
  onSearchChange,
  onPhaseChange,
  onStatusChange,
  onDepartmentChange,
  onBuildingChange,
  onLevelChange,
  onLocationChange,
  onClearFilters,
}) => {
  const hasFilters = !!(search || phaseFilter || statusFilter || departmentFilter || buildingFilter || levelFilter || locationFilter);

  return (
    <div className="space-y-5">
      {/* ── Filters panel ──────────────────────────────────────────── */}
      <div className="bg-white border border-slate-200 rounded-3xl p-5 space-y-4">
        <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest flex items-center gap-1.5">
          <Filter className="w-3 h-3" />
          Filters
        </p>

        {/* 1. Department select */}
        <div className="relative">
          <select
            title="Filter by department"
            value={departmentFilter}
            onChange={e => {
              onDepartmentChange(e.target.value);
              onBuildingChange(''); // reset building when dept changes
              onLevelChange(''); // reset level when dept changes
              onLocationChange(''); // reset location when dept changes
            }}
            className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium outline-none appearance-none focus:border-indigo-400 transition-colors"
          >
            <option value="">All Departments</option>
            {uniqueDepartments.map(d => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
        </div>

        {/* 2. Building select */}
        <div className="relative">
          <select
            title="Filter by building"
            value={buildingFilter}
            onChange={e => {
              onBuildingChange(e.target.value);
              onLevelChange(''); // reset level when building changes
              onLocationChange(''); // reset location when building changes
            }}
            className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium outline-none appearance-none focus:border-indigo-400 transition-colors"
          >
            <option value="">All Buildings</option>
            {uniqueBuildings.map(b => (
              <option key={b.id} value={b.id}>
                {b.name} ({b.abbr})
              </option>
            ))}
          </select>
          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
        </div>

        {/* 3. Level select */}
        <div className="relative">
          <select
            title="Filter by level"
            value={levelFilter}
            onChange={e => {
              onLevelChange(e.target.value);
              onLocationChange(''); // reset location when level changes
            }}
            className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium outline-none appearance-none focus:border-indigo-400 transition-colors"
          >
            <option value="">All Levels</option>
            {uniqueLevels.map(lvl => (
              <option key={lvl} value={lvl}>
                Level {lvl}
              </option>
            ))}
          </select>
          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
        </div>

        {/* 4. Location select */}
        <div className="relative">
          <select
            title="Filter by location"
            value={locationFilter}
            onChange={e => onLocationChange(e.target.value)}
            className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium outline-none appearance-none focus:border-indigo-400 transition-colors"
          >
            <option value="">All Locations</option>
            {uniqueLocations.map(l => {
              const buildingPart = l.buildingAbbr ? l.buildingAbbr : (l.buildingName || '');
              const levelPart = l.level ? `Lvl ${l.level}` : '';
              const suffixParts = [buildingPart, levelPart].filter(Boolean).join(' - ');
              const displayName = suffixParts ? `${l.name} (${suffixParts})` : l.name;
              return (
                <option key={l.id} value={l.id}>
                  {displayName}
                </option>
              );
            })}
          </select>
          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
        </div>

        {/* 5. Phase select */}
        <div className="relative">
          <select
            id="kiosk-phase-filter"
            title="Filter by phase"
            value={phaseFilter}
            onChange={e => onPhaseChange(e.target.value)}
            className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium outline-none appearance-none focus:border-indigo-400 transition-colors"
          >
            <option value="">All Phases</option>
            {phases.map(p => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.startDate} to {p.endDate})
              </option>
            ))}
          </select>
          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
        </div>

        {/* 6. Status select */}
        <div className="relative">
          <select
            id="kiosk-status-filter"
            title="Filter by status"
            value={statusFilter}
            onChange={e => onStatusChange(e.target.value)}
            className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium outline-none appearance-none focus:border-indigo-400 transition-colors"
          >
            <option value="">All Statuses</option>
            <option value="Pending">Pending</option>
            <option value="In Progress">In Progress</option>
            <option value="Completed">Completed</option>
          </select>
          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
        </div>

        {hasFilters && (
          <button
            onClick={onClearFilters}
            className="w-full text-xs font-bold text-indigo-600 hover:text-indigo-800 transition-colors"
          >
            Clear Filters
          </button>
        )}
      </div>

      {/* ── Auditor leaderboard ─────────────────────────────────────── */}
      {auditorStats.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-3xl p-5">
          <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-4 flex items-center gap-1.5">
            <Package className="w-3 h-3" />
            Assets by Auditor
          </p>

          <div className="space-y-3">
            {auditorStats.map((a, i) => {
              const pct = Math.min(100, (a.assets / threshold) * 100);
              const isOver = a.assets >= threshold;
              return (
                <div key={a.name} className="flex items-center gap-3">
                  <span className="text-[10px] font-black text-slate-400 w-4">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[11px] font-bold text-slate-700 truncate">{a.name}</span>
                      <span className={`text-[9px] font-black shrink-0 ml-2 ${isOver ? 'text-rose-600' : 'text-indigo-600'}`}>
                        {a.assets.toLocaleString()} / {threshold.toLocaleString()}
                      </span>
                    </div>
                    <div className="h-1 bg-slate-100 rounded-full overflow-hidden">
                      {/* biome-ignore lint/style/noInlineStyle: Dynamic progress bar width */}
                      <div
                        className={`h-full rounded-full transition-all duration-500 [width:var(--pct)] ${
                          isOver 
                            ? 'bg-linear-to-r from-rose-400 to-red-500' 
                            : 'bg-linear-to-r from-indigo-400 to-purple-500'
                        }`}
                        style={{ '--pct': `${pct}%` } as React.CSSProperties}
                      />
                    </div>
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
