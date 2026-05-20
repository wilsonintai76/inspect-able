import React from 'react';
import { ChevronDown, Filter } from 'lucide-react';
import { Building as BuildingType } from '@shared/types';

interface AuditFiltersBarProps {
  departments: string[];
  selectedDept: string;
  onDeptChange: (dept: string) => void;
  uniqueBlocks: string[];
  selectedBlock: string;
  onBlockChange: (block: string) => void;
  uniqueLevels: string[];
  selectedLevel: string;
  onLevelChange: (level: string) => void;
  selectedStatus: string;
  onStatusChange: (status: string) => void;
  buildings: BuildingType[];
}

export const AuditFiltersBar: React.FC<AuditFiltersBarProps> = ({
  departments, selectedDept, onDeptChange,
  uniqueBlocks, selectedBlock, onBlockChange,
  uniqueLevels, selectedLevel, onLevelChange,
  selectedStatus, onStatusChange,
  buildings,
}) => (
  <div className="bg-white rounded-[32px] p-4 border border-slate-200 shadow-sm">
    <div className="flex flex-col lg:flex-row gap-4">
      <div className="flex items-center gap-2 text-slate-400 text-xs font-bold uppercase tracking-widest mb-2 lg:mb-0 lg:mr-4">
        <Filter className="w-4 h-4" />
        Filters
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 grow">

        {/* Department */}
        <div className="relative">
          <label className="text-[9px] font-black uppercase text-slate-400 tracking-widest ml-1 mb-1 block">Department</label>
          <div className="relative">
            <select
              title="Department"
              className="w-full pl-4 pr-8 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold focus:ring-2 focus:ring-blue-500/20 outline-none transition-all appearance-none cursor-pointer hover:bg-white"
              value={selectedDept}
              onChange={(e) => onDeptChange(e.target.value)}
            >
              {departments.map(d => (
                <option key={d} value={d}>{d === 'All' ? 'All Departments' : d}</option>
              ))}
            </select>
            <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 w-3 h-3 pointer-events-none" />
          </div>
        </div>

        {/* Block / Building */}
        <div className="relative">
          <label className="text-[9px] font-black uppercase text-slate-400 tracking-widest ml-1 mb-1 block">Block / Building</label>
          <div className="relative">
            <select
              title="Block / Building"
              className="w-full pl-4 pr-8 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold focus:ring-2 focus:ring-blue-500/20 outline-none transition-all appearance-none cursor-pointer hover:bg-white"
              value={selectedBlock}
              onChange={(e) => onBlockChange(e.target.value)}
            >
              {uniqueBlocks.map(b => {
                if (b === 'All') return <option key={b} value={b}>All Blocks</option>;
                const fullBuilding = buildings.find(building => building.abbr === b);
                const displayName = fullBuilding ? `${b} | ${fullBuilding.name}` : b;
                return <option key={b} value={b}>{displayName}</option>;
              })}
            </select>
            <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 w-3 h-3 pointer-events-none" />
          </div>
        </div>

        {/* Level */}
        <div className="relative">
          <label className="text-[9px] font-black uppercase text-slate-400 tracking-widest ml-1 mb-1 block">Level</label>
          <div className="relative">
            <select
              title="Level"
              className="w-full pl-4 pr-8 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold focus:ring-2 focus:ring-blue-500/20 outline-none transition-all appearance-none cursor-pointer hover:bg-white"
              value={selectedLevel}
              onChange={(e) => onLevelChange(e.target.value)}
            >
              {uniqueLevels.map(l => (
                <option key={l} value={l}>{l === 'All' ? 'All Levels' : l}</option>
              ))}
            </select>
            <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 w-3 h-3 pointer-events-none" />
          </div>
        </div>

        {/* Status */}
        <div className="relative">
          <label className="text-[9px] font-black uppercase text-slate-400 tracking-widest ml-1 mb-1 block">Status</label>
          <div className="relative">
            <select
              title="Status"
              className="w-full pl-4 pr-8 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold focus:ring-2 focus:ring-blue-500/20 outline-none transition-all appearance-none cursor-pointer hover:bg-white"
              value={selectedStatus}
              onChange={(e) => onStatusChange(e.target.value)}
            >
              <option value="All">All Statuses</option>
              <option value="Pending">Pending</option>
              <option value="Awaiting Approval">Awaiting Approval</option>
              <option value="In Progress">In Progress</option>
              <option value="Completed">Completed</option>
            </select>
            <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 w-3 h-3 pointer-events-none" />
          </div>
        </div>

      </div>
    </div>
  </div>
);
