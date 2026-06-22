import React, { useState, useMemo } from 'react';
import { Location, UserRole, Department, User, AuditPhase, Building, AuditSchedule } from '@shared/types';
import { hasCapability, CAP_PURGE_DATA } from '../lib/pbacUtils';
import { Network, ChevronDown, Landmark, User as UserIcon, Phone, Pencil, Archive, ArchiveRestore, MapPinned, Building2, Layers, Plus, Flame } from 'lucide-react';
import { LocationModal } from './LocationModal';
import { PurgeConfirmModal } from './PurgeConfirmModal';

interface LocationManagementProps {
  locations: Location[];
  departments: Department[];
  users: User[];
  userRoles: string[];
  userDeptId?: string;
  currentUser?: User;
  onAdd: (loc: Omit<Location, 'id'>) => void;
  onBulkAdd?: (locs: Omit<Location, 'id'>[]) => void;
  onUpdate: (id: string, loc: Partial<Location>) => void;
  onDelete: (id: string) => void;
  onPurge: (id: string) => void;
  phases?: AuditPhase[];
  buildings: Building[];
  schedules: AuditSchedule[];
}

export const LocationManagement: React.FC<LocationManagementProps> = ({ 
  locations, departments, users, userRoles, userDeptId, currentUser, onAdd, onUpdate, onDelete, onPurge, phases = [], buildings, schedules
}) => {
  // ── PBAC capability checks ───────────────────────────────────────────
  const pbacUser = currentUser ? { roles: currentUser.roles, qualifications: currentUser.qualifications, certificationExpiry: currentUser.certificationExpiry, departmentId: currentUser.departmentId } : { roles: userRoles, qualifications: [] as string[], certificationExpiry: null as string | null, departmentId: userDeptId || null };
  const isAdmin = hasCapability(pbacUser, 'system:admin');
  const canManage = hasCapability(pbacUser, 'manage:locations');
  const canPurge = hasCapability(pbacUser, CAP_PURGE_DATA);
  const isCoordinator = canManage && hasCapability(pbacUser, 'manage:departments') && !isAdmin;
  const isSupervisor = canManage && !hasCapability(pbacUser, 'manage:departments') && !isAdmin;
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingLocation, setEditingLocation] = useState<Location | null>(null);
  const [selectedDeptFilter, setSelectedDeptFilter] = useState('All');
  const [selectedBlockFilter, setSelectedBlockFilter] = useState('All');
  const [purgeTarget, setPurgeTarget] = useState<Location | null>(null);
  const [selectedLevelFilter, setSelectedLevelFilter] = useState('All');
  const [showArchived, setShowArchived] = useState(false);

  const LEVELS = ["LEVEL 1", "LEVEL 2", "LEVEL 3", "LEVEL 4", "LEVEL 5"];

  // isAdmin, isCoordinator, isSupervisor, canManage now PBAC-derived above

  const getBuildingAbbr = (buildingId?: string, buildingName?: string) => {
    if (buildingId) {
      const b = buildings.find(b => b.id === buildingId);
      if (b) return b.abbr;
    }
    // Fallback if legacy building name matches a building
    if (buildingName) {
      const cleanName = buildingName.toLowerCase().trim();
      const b = buildings.find(b => b.name.toLowerCase().trim() === cleanName);
      if (b) return b.abbr;
      // If we cannot find it in buildings, return the name as fallback
      return buildingName;
    }
    return '';
  };

  const filteredLocations = useMemo(() => {
    let base = ((isCoordinator || isSupervisor) && !isAdmin)
      ? locations.filter(l => l.departmentId === userDeptId) 
      : locations;

    // Hide archived unless showArchived is on
    if (!showArchived) base = base.filter(l => l.status !== 'Archived');

    if (selectedDeptFilter !== 'All') {
      base = base.filter(l => l.departmentId === selectedDeptFilter);
    }
    if (selectedBlockFilter !== 'All') {
      base = base.filter(l => getBuildingAbbr(l.buildingId, l.building) === selectedBlockFilter);
    }
    if (selectedLevelFilter !== 'All') {
      base = base.filter(l => l.level === selectedLevelFilter);
    }

    return [...base].sort((a, b) => {
      if (a.departmentId !== b.departmentId) {
        return a.departmentId.localeCompare(b.departmentId);
      }
      const buildingA = getBuildingAbbr(a.buildingId, a.building);
      const buildingB = getBuildingAbbr(b.buildingId, b.building);
      if (buildingA !== buildingB) {
        return buildingA.localeCompare(buildingB);
      }
      const indexA = LEVELS.indexOf(a.level || '');
      const indexB = LEVELS.indexOf(b.level || '');
      if (indexA !== -1 && indexB !== -1) return indexA - indexB;
      return (a.level || '').localeCompare(b.level || '');
    });
  }, [locations, showArchived, isCoordinator, isSupervisor, isAdmin, userDeptId, selectedDeptFilter, selectedBlockFilter, selectedLevelFilter]);

  const availableBlocks = useMemo(() => {
    let base = ((isCoordinator || isSupervisor) && !isAdmin) ? locations.filter(l => l.departmentId === userDeptId) : locations;
    if (selectedDeptFilter !== 'All') base = base.filter(l => l.departmentId === selectedDeptFilter);
    // Resolve building names from buildings state if building name is missing in location
    const abbrs = base.map(l => getBuildingAbbr(l.buildingId, l.building)).filter(Boolean);
    return Array.from(new Set(abbrs)).sort() as string[];
  }, [locations, buildings, isCoordinator, isSupervisor, isAdmin, userDeptId, selectedDeptFilter]);

  const availableLevels = useMemo(() => {
    let base = ((isCoordinator || isSupervisor) && !isAdmin) ? locations.filter(l => l.departmentId === userDeptId) : locations;
    if (selectedDeptFilter !== 'All') base = base.filter(l => l.departmentId === selectedDeptFilter);
    if (selectedBlockFilter !== 'All') {
      base = base.filter(l => getBuildingAbbr(l.buildingId, l.building) === selectedBlockFilter);
    }
    return Array.from(new Set(base.map(l => l.level).filter(Boolean))).sort((a: any, b: any) => {
      const indexA = LEVELS.indexOf(a || '');
      const indexB = LEVELS.indexOf(b || '');
      if (indexA !== -1 && indexB !== -1) return indexA - indexB;
      return (a || '').localeCompare(b || '');
    });
  }, [locations, isCoordinator, isSupervisor, isAdmin, userDeptId, selectedDeptFilter, selectedBlockFilter]);

  const handleSave = (data: Omit<Location, 'id'> | Partial<Location>) => {
    if (editingLocation) {
      onUpdate(editingLocation.id, data as Partial<Location>);
    } else {
      onAdd(data as Omit<Location, 'id'>);
    }
  };

  const startEdit = (loc: Location) => {
    setEditingLocation(loc);
    setIsModalOpen(true);
  };

  const startAdd = () => {
    setEditingLocation(null);
    setIsModalOpen(true);
  };

  // Helper to get consistent color for departments
  const getColorIndex = (str: string) => {
    let hash = 0;
    for (let i = 0; i < (str?.length || 0); i++) {
      hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    return Math.abs(hash);
  };

  const AVATAR_COLORS = [
    'bg-blue-100 text-blue-600 border-blue-200',
    'bg-emerald-100 text-emerald-600 border-emerald-200',
    'bg-indigo-100 text-indigo-600 border-indigo-200',
    'bg-purple-100 text-purple-600 border-purple-200',
    'bg-amber-100 text-amber-600 border-amber-200',
    'bg-rose-100 text-rose-600 border-rose-200',
    'bg-cyan-100 text-cyan-600 border-cyan-200',
    'bg-slate-100 text-slate-600 border-slate-200'
  ];

  const activePhase = useMemo(() => {
    const today = new Date();
    return (phases || []).find(p => {
      const start = new Date(p.startDate);
      const end = new Date(p.endDate);
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
      return today >= start && today <= end;
    });
  }, [phases]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-end gap-2">
        {canManage && (
          <>
            {!isSupervisor && (() => {
              const archivedCount = locations.filter(l => l.status === 'Archived').length;
              return archivedCount > 0 ? (
                <button
                  onClick={() => setShowArchived(v => !v)}
                  className={`px-3 py-2 rounded-2xl text-[12px] font-bold transition-all flex items-center gap-2 border ${
                    showArchived ? 'bg-amber-50 border-amber-200 text-amber-700' : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50'
                  }`}
                  title={showArchived ? 'Hide archived locations' : `Show ${archivedCount} archived location${archivedCount > 1 ? 's' : ''}`}
                >
                  <Archive className="w-4 h-4" />
                  {archivedCount}
                </button>
              ) : null;
            })()}
            {!isSupervisor && (
            <button 
              onClick={startAdd}
              className={`px-4 py-2 rounded-2xl text-[13px] font-bold shadow-lg transition-all flex items-center justify-center gap-2 whitespace-nowrap active:scale-95 ${
                activePhase 
                  ? 'bg-white/10 text-white border border-white/20 hover:bg-white/20 shadow-none' 
                  : 'bg-blue-600 text-white shadow-blue-500/20 hover:bg-blue-700'
              }`}
            >
              <Plus className="w-4 h-4" />
              New Location
            </button>
            )}
          </>
        )}
      </div>

      {/* FILTERS BAR */}
      <div className="flex flex-col sm:flex-row items-center gap-3 bg-white p-2 rounded-[24px] border border-slate-100 shadow-sm sm:w-fit">
        {isAdmin && (
          <div className="relative min-w-45 w-full sm:w-auto">
            <Network className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 w-3.5 h-3.5" />
            <select
              title="Filter by Department"
              className="w-full pl-10 pr-8 py-2 bg-slate-50/50 border border-slate-100 rounded-xl text-xs font-bold focus:ring-2 focus:ring-blue-500/10 outline-none transition-all appearance-none cursor-pointer hover:bg-white"
              value={selectedDeptFilter}
              onChange={(e) => {
                setSelectedDeptFilter(e.target.value);
                setSelectedBlockFilter('All');
                setSelectedLevelFilter('All');
              }}
            >
              <option value="All">All Departments</option>
              {departments.map(d => (
                <option key={d.id} value={d.id}>{d.name} ({d.abbr})</option>
              ))}
            </select>
            <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 w-3 h-3 pointer-events-none" />
          </div>
        )}

        <div className="relative min-w-35 w-full sm:w-auto">
          <Building2 className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 w-3.5 h-3.5" />
          <select
            title="Filter by Building/Block"
            className="w-full pl-10 pr-8 py-2 bg-slate-50/50 border border-slate-100 rounded-xl text-xs font-bold focus:ring-2 focus:ring-blue-500/10 outline-none transition-all appearance-none cursor-pointer hover:bg-white"
            value={selectedBlockFilter}
            onChange={(e) => {
              setSelectedBlockFilter(e.target.value);
              setSelectedLevelFilter('All');
            }}
          >
            <option value="All">All Building/Block</option>
            {availableBlocks.map(b => {
              const fullBuilding = buildings.find(building => building.abbr === b);
              const displayName = fullBuilding ? `${b} | ${fullBuilding.name}` : b;
              return (
                <option key={b} value={b}>{displayName}</option>
              );
            })}
          </select>
          <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 w-3 h-3 pointer-events-none" />
        </div>

        <div className="relative min-w-35 w-full sm:w-auto">
          <Layers className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 w-3.5 h-3.5" />
          <select
            title="Filter by Level"
            className="w-full pl-10 pr-8 py-2 bg-slate-50/50 border border-slate-100 rounded-xl text-xs font-bold focus:ring-2 focus:ring-blue-500/10 outline-none transition-all appearance-none cursor-pointer hover:bg-white"
            value={selectedLevelFilter}
            onChange={(e) => setSelectedLevelFilter(e.target.value)}
          >
            <option value="All">All Levels</option>
            {availableLevels.map(l => (
              <option key={l} value={l}>{l}</option>
            ))}
          </select>
          <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 w-3 h-3 pointer-events-none" />
        </div>
      </div>

      {/* ── Mobile card list (< lg) ── */}
      <div className="lg:hidden space-y-3">
        {filteredLocations.map(loc => {
          const dept = departments.find(d => d.id === loc.departmentId);
          const colorClass = AVATAR_COLORS[getColorIndex(dept?.name || loc.departmentId) % AVATAR_COLORS.length];
          const isArchivedLoc = loc.status === 'Archived';
          const bAbbr = getBuildingAbbr(loc.buildingId, loc.building);
          const supervisorIds = loc.supervisorId ? loc.supervisorId.split(',').map(id => id.trim()).filter(Boolean) : [];
          const isAssigned = schedules.some(s => s.locationId === loc.id && s.status !== 'Completed' && (s.date || s.auditor1Id || s.auditor2Id));
          return (
            <div key={loc.id} className={`bg-white rounded-2xl border border-slate-200 shadow-sm p-4 ${isArchivedLoc ? 'opacity-60' : ''}`}>
              <div className="flex items-start gap-3">
                <div className={`w-11 h-11 rounded-xl flex items-center justify-center text-xs font-black shadow-sm border ${colorClass} shrink-0`}>
                  {loc.abbr}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-slate-900 text-sm leading-tight flex items-center gap-1.5 flex-wrap">
                    {loc.name}
                    {isArchivedLoc && <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-400 text-[9px] font-black border border-slate-200 uppercase">Archived</span>}
                  </div>
                  <div className="flex flex-wrap gap-2 mt-1">
                    {bAbbr && <span className="flex items-center gap-1 text-[10px] text-slate-400 font-medium"><Building2 className="w-3 h-3" />{bAbbr}</span>}
                    {loc.level && <span className="flex items-center gap-1 text-[10px] text-slate-400 font-medium"><Layers className="w-3 h-3" />{loc.level}</span>}
                    <span className="text-[10px] text-slate-400 font-medium">{dept?.name || ''}</span>
                  </div>
                  {supervisorIds.length > 0 && (
                    <div className="text-[10px] text-slate-500 mt-1 flex items-center gap-1">
                      <UserIcon className="w-3 h-3 opacity-50" />
                      {supervisorIds.map(id => users.find(u => u.id === id)?.name || id).join(', ')}
                    </div>
                  )}
                  <div className="flex items-center gap-3 mt-1.5">
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 text-[10px] font-bold border border-slate-200">
                      {loc.totalAssets || 0} assets
                    </span>
                    {(loc.uninspectedAssetCount || 0) > 0 && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-rose-100 text-rose-600 text-[10px] font-bold border border-rose-200">
                        {loc.uninspectedAssetCount} uninspected
                      </span>
                    )}
                  </div>
                </div>
                {canManage && (
                  <div className="flex flex-col gap-1.5 shrink-0">
                    <button onClick={() => startEdit(loc)} className="w-8 h-8 flex items-center justify-center bg-white border border-slate-200 text-slate-400 hover:text-blue-600 rounded-xl" title="Edit">
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    {!isSupervisor && (
                      isArchivedLoc ? (
                        <>
                          <button onClick={() => onUpdate(loc.id, { status: 'Active' })} className="w-8 h-8 flex items-center justify-center bg-amber-50 border border-amber-200 text-amber-500 rounded-xl">
                            <ArchiveRestore className="w-3.5 h-3.5" />
                          </button>
                          {canPurge && (
                            <button onClick={() => setPurgeTarget(loc)} className="w-8 h-8 flex items-center justify-center bg-red-50 border border-red-200 text-red-400 rounded-xl">
                              <Flame className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </>
                      ) : (
                        <button
                          onClick={() => !isAssigned && onDelete(loc.id)}
                          disabled={isAssigned}
                          className={`w-8 h-8 flex items-center justify-center border rounded-xl transition-all ${isAssigned ? 'bg-slate-50 border-slate-100 text-slate-200 cursor-not-allowed' : 'bg-white border-slate-200 text-slate-400 hover:text-amber-600'}`}
                          title={isAssigned ? 'Cannot archive: active assignments' : 'Archive'}
                        >
                          <Archive className="w-3.5 h-3.5" />
                        </button>
                      )
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
        {filteredLocations.length === 0 && (
          <div className="py-12 text-center">
            <div className="w-14 h-14 bg-slate-50 rounded-2xl flex items-center justify-center mx-auto mb-3"><MapPinned className="w-7 h-7 text-slate-200" /></div>
            <p className="text-sm font-bold text-slate-400">No locations found</p>
          </div>
        )}
      </div>

      {/* ── Desktop table (lg+) ── */}
      <div className="bg-white rounded-[32px] border border-slate-200 shadow-sm overflow-hidden hidden lg:block">
        <div className="overflow-x-auto scrollbar-thin scrollbar-thumb-slate-200">
          <table className="w-full text-left min-w-200">
            <thead className="bg-slate-50/50 border-b border-slate-100">
              <tr>
                <th className="px-6 py-5 text-[10px] font-black uppercase text-slate-400 tracking-widest text-left">Location Details</th>
                <th className="px-6 py-5 text-[10px] font-black uppercase text-slate-400 tracking-widest text-left w-55">Supervisor Name / Contact</th>
                <th className="px-6 py-5 text-[10px] font-black uppercase text-slate-400 tracking-widest text-center w-30">Total Assets</th>
                <th className="px-6 py-5 text-[10px] font-black uppercase text-slate-400 tracking-widest text-center w-30">Uninspected</th>
                <th className="px-6 py-5 text-[10px] font-black uppercase text-slate-400 tracking-widest text-left w-25">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filteredLocations.map(loc => {
                 const dept = departments.find(d => d.id === loc.departmentId);
                 const colorClass = AVATAR_COLORS[getColorIndex(dept?.name || loc.departmentId) % AVATAR_COLORS.length];
                 const isArchivedLoc = loc.status === 'Archived';
                 return (
                  <tr key={loc.id} className={`transition-colors group ${isArchivedLoc ? 'opacity-50 bg-slate-50/80' : 'hover:bg-slate-50/50'}`}>
                    <td className="px-6 py-4">
                      <div className="flex items-start gap-4">
                        <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-xs font-black shadow-sm border ${colorClass} shrink-0`}>
                          {loc.abbr}
                        </div>
                        <div>
                          <div className="font-bold text-slate-900 text-sm flex items-center gap-2">
                            {loc.name}
                            {isArchivedLoc && <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-400 text-[9px] font-black border border-slate-200 uppercase tracking-widest">Archived</span>}
                            {(loc.buildingId && buildings.find(b => b.id === loc.buildingId)?.abbr) && (
                              <span className="text-[10px] text-slate-400 font-normal italic border-l border-slate-200 pl-2">
                                {buildings.find(b => b.id === loc.buildingId)?.abbr}
                              </span>
                            )}
                            {loc.level && (
                              <span className="text-[10px] text-slate-400 font-normal italic border-l border-slate-200 pl-2">
                                {getBuildingAbbr(loc.buildingId, loc.building) || loc.abbr} | {loc.level}
                              </span>
                            )}
                          </div>
                          {isArchivedLoc && (loc.archivedBy || loc.archivedAt) && (
                            <div className="text-[10px] text-slate-400 mt-0.5">
                              {loc.archivedBy && <span>by {loc.archivedBy}</span>}
                              {loc.archivedAt && <span className="ml-1">&middot; {new Date(loc.archivedAt).toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric' })}</span>}
                            </div>
                          )}
                          
                          {/* Original / Merged Names Display */}
                          {loc.description && (
                            <div className="flex flex-wrap gap-1 mt-0.5">
                              {loc.description.split('\n').filter(line => line.startsWith('Original') || line.startsWith('Merged')).map((line, idx) => (
                                <span key={idx} className="text-[9px] font-bold text-indigo-500 bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-100/50">
                                  {line.replace('Original Alias: ', '').replace('Original: ', '').replace('Merged from: ', 'Merged: ')}
                                </span>
                              ))}
                            </div>
                          )}

                          <div className="mt-1 text-[10px] font-bold text-slate-400 flex items-center gap-1.5">
                            <Landmark className="w-3.5 h-3.5" />
                            {dept?.name || loc.departmentId}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 align-middle">
                      <div className="flex flex-col gap-2">
                        {(() => {
                          const supervisorIds = loc.supervisorId ? loc.supervisorId.split(',').map(id => id.trim()).filter(Boolean) : [];
                          if (supervisorIds.length === 0) {
                            return <span className="text-[10px] text-slate-400 italic">Unassigned</span>;
                          }
                          return supervisorIds.map(supId => {
                            const supervisor = users.find(u => u.id === supId);
                            const contact = supervisor?.contactNumber || loc.contact || '';
                            return (
                              <div key={supId} className="flex flex-col gap-0.5 border-l-2 border-slate-200 pl-2">
                                <div className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                                  <div className="w-5 h-5 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 border border-slate-200 shrink-0">
                                    <UserIcon className="w-2.5 h-2.5" />
                                  </div>
                                  <span className="truncate max-w-37.5">{supervisor?.name || supId}</span>
                                </div>
                                {contact && (
                                  <div className="text-[9px] text-slate-500 font-medium pl-6 flex items-center gap-1">
                                    <Phone className="w-2.5 h-2.5 opacity-70" />
                                    {contact}
                                  </div>
                                )}
                              </div>
                            );
                          });
                        })()}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-center align-middle">
                      <span className="inline-flex items-center justify-center px-3 py-1 rounded-full bg-slate-100 text-slate-700 text-xs font-bold border border-slate-200">
                        {loc.totalAssets || 0}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-center align-middle">
                      {(loc.uninspectedAssetCount || 0) > 0 ? (
                        <span className="inline-flex items-center justify-center px-3 py-1 rounded-full bg-rose-100 text-rose-600 text-xs font-bold border border-rose-200">
                          {(loc.uninspectedAssetCount || 0).toLocaleString()}
                        </span>
                      ) : (
                        <span className="text-slate-300 text-xs">—</span>
                      )}
                    </td>
                    <td className="px-6 py-4 align-middle">
                      {canManage && (
                        <div className="flex gap-1">
                          <button onClick={() => startEdit(loc)} className="w-9 h-9 flex items-center justify-center bg-white border border-slate-200 text-slate-400 hover:text-blue-600 hover:border-blue-200 rounded-xl transition-colors" title={isSupervisor ? 'Edit Level / Total Assets' : 'Edit Location'}>
                            <Pencil className="w-4 h-4" />
                          </button>
                          {!isSupervisor && (
                            (() => {
                              const isAssigned = schedules.some(s => s.locationId === loc.id && s.status !== 'Completed' && (s.date || s.auditor1Id || s.auditor2Id));
                              const isArchived = loc.status === 'Archived';
                              
                              if (isArchived) {
                                return (
                                  <>
                                    <button
                                      onClick={() => onUpdate(loc.id, { status: 'Active' })}
                                      className="w-9 h-9 flex items-center justify-center bg-amber-50 border border-amber-200 text-amber-500 hover:text-amber-700 hover:border-amber-300 rounded-xl transition-all"
                                      title="Restore location"
                                    >
                                      <ArchiveRestore className="w-4 h-4" />
                                    </button>
                                    {(canPurge) && (
                                      <button
                                        onClick={() => setPurgeTarget(loc)}
                                        className="w-9 h-9 flex items-center justify-center bg-red-50 border border-red-200 text-red-400 hover:text-red-600 hover:border-red-300 rounded-xl transition-all"
                                        title="Purge permanently"
                                      >
                                        <Flame className="w-4 h-4" />
                                      </button>
                                    )}
                                  </>
                                );
                              }
                              return (
                                <button 
                                  onClick={() => !isAssigned && onDelete(loc.id)} 
                                  disabled={isAssigned}
                                  className={`w-9 h-9 flex items-center justify-center border rounded-xl transition-all ${
                                    isAssigned 
                                      ? 'bg-slate-50 border-slate-100 text-slate-200 cursor-not-allowed' 
                                      : 'bg-white border-slate-200 text-slate-400 hover:text-amber-600 hover:border-amber-200'
                                  }`}
                                  title={isAssigned ? "Cannot archive: Location has active assignments" : "Archive location"}
                                >
                                  <Archive className="w-4 h-4" />
                                </button>
                              );
                            })()
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
              {filteredLocations.length === 0 && (
                <tr>
                   <td colSpan={4} className="px-6 py-20 text-center">
                    <div className="flex flex-col items-center justify-center max-w-xs mx-auto">
                      <div className="w-16 h-16 bg-slate-100 rounded-3xl flex items-center justify-center text-slate-300 mb-4">
                        <MapPinned className="w-8 h-8" />
                      </div>
                      <h4 className="text-slate-900 font-bold mb-1">No Locations Found</h4>
                      <p className="text-xs text-slate-500">No records match your current criteria.</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <LocationModal 
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSave={handleSave}
        initialData={editingLocation}
        departments={departments}
        users={users}
        isAdmin={isAdmin}
        isCoordinator={isCoordinator && canManage}
        isSupervisor={isSupervisor && !isAdmin && !isCoordinator && canManage}
        userDeptId={userDeptId}
        currentUser={currentUser}
        buildings={buildings}
      />

      <PurgeConfirmModal
        isOpen={purgeTarget !== null}
        onClose={() => setPurgeTarget(null)}
        onConfirm={() => { if (purgeTarget) onPurge(purgeTarget.id); }}
        itemType="location"
        itemName={purgeTarget?.name ?? ''}
        archivedBy={purgeTarget?.archivedBy}
        archivedAt={purgeTarget?.archivedAt}
      />
    </div>
  );
};
