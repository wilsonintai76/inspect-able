import React, { useState, useEffect, useMemo } from 'react';
import { ShieldCheck, ArrowLeft, RefreshCw, Filter } from 'lucide-react';

import { KioskSchedule, KioskUser, KioskPhase, AssignRole } from './kiosk/types';
import { KioskStatsBar } from './kiosk/KioskStatsBar';
import { KioskSidebar } from './kiosk/KioskSidebar';
import { KioskGrid } from './kiosk/KioskGrid';

interface Props {
  onBack: () => void;
}

export const KioskPage: React.FC<Props> = ({ onBack }) => {
  // ── Data state ────────────────────────────────────────────────────────────
  const [schedules, setSchedules] = useState<KioskSchedule[]>([]);
  const [users, setUsers] = useState<KioskUser[]>([]);
  const [phases, setPhases] = useState<KioskPhase[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState(new Date());
  const [maxAssets, setMaxAssets] = useState(500);

  // ── Filter state ──────────────────────────────────────────────────────────
  const [search, setSearch] = useState('');
  const [phaseFilter, setPhaseFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('');
  const [locationFilter, setLocationFilter] = useState('');

  // ── UI state ────────────────────────────────────────────────────────────
  const [showFilters, setShowFilters] = useState(false);

  // ── Data loading ──────────────────────────────────────────────────────────
  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/public/kiosk');
      const data = await res.json() as { schedules: KioskSchedule[]; users: KioskUser[]; phases: KioskPhase[]; maxAssets: number };
      setSchedules(data.schedules ?? []);
      setUsers(data.users ?? []);
      setPhases(data.phases ?? []);
      if (data.maxAssets) setMaxAssets(data.maxAssets);
      setLastRefresh(new Date());
    } catch { /* graceful – keep previous data */ } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  // ── Mutations ─────────────────────────────────────────────────────────────
  const handleAssign = async (scheduleId: string, userId: string, role: AssignRole) => {
    setSaving(scheduleId);
    try {
      await fetch(`/api/public/kiosk/schedules/${scheduleId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, role, action: 'assign' }),
      });
      setSchedules(prev => prev.map(s => {
        if (s.id !== scheduleId) return s;
        const user = users.find(u => u.id === userId);
        return { ...s, [`${role}Id`]: userId, [`${role}Name`]: user?.name ?? '' };
      }));
    } finally { setSaving(null); }
  };

  const handleUnassign = async (scheduleId: string, role: AssignRole) => {
    setSaving(scheduleId);
    try {
      await fetch(`/api/public/kiosk/schedules/${scheduleId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role, action: 'unassign' }),
      });
      setSchedules(prev => prev.map(s =>
        s.id !== scheduleId ? s : { ...s, [`${role}Id`]: null, [`${role}Name`]: null },
      ));
    } finally { setSaving(null); }
  };

  const handleDateChange = async (scheduleId: string, date: string) => {
    setSaving(scheduleId);
    try {
      await fetch(`/api/public/kiosk/schedules/${scheduleId}/date`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date }),
      });
      setSchedules(prev => prev.map(s => s.id !== scheduleId ? s : { ...s, date }));
    } finally { setSaving(null); }
  };

  // ── Derived data ──────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return schedules.filter(s => {
      if (phaseFilter && s.phaseId !== phaseFilter) return false;
      if (statusFilter && s.status !== statusFilter) return false;
      if (departmentFilter && s.departmentId !== departmentFilter) return false;
      if (locationFilter && s.locationId !== locationFilter) return false;
      if (q) {
        return (
          s.locationName.toLowerCase().includes(q) ||
          s.departmentName.toLowerCase().includes(q) ||
          (s.auditor1Name ?? '').toLowerCase().includes(q) ||
          (s.auditor2Name ?? '').toLowerCase().includes(q) ||
          (s.supervisorName ?? '').toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [schedules, search, phaseFilter, statusFilter, departmentFilter, locationFilter]);

  const uniqueDepartments = useMemo(() => {
    const map = new Map<string, string>();
    schedules.forEach(s => map.set(s.departmentId, s.departmentName));
    return Array.from(map.entries()).map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [schedules]);

  const uniqueLocations = useMemo(() => {
    const map = new Map<string, string>();
    schedules.forEach(s => {
      // If a department is selected, only show locations from that department
      if (!departmentFilter || s.departmentId === departmentFilter) {
        map.set(s.locationId, s.locationName);
      }
    });
    return Array.from(map.entries()).map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [schedules, departmentFilter]);

  const auditorStats = useMemo(() => {
    const map = new Map<string, { name: string; assets: number; slots: number }>();
    schedules.forEach(s => {
      [{ id: s.auditor1Id, name: s.auditor1Name }, { id: s.auditor2Id, name: s.auditor2Name }].forEach(({ id, name }) => {
        if (!id || !name) return;
        const prev = map.get(id) ?? { name, assets: 0, slots: 0 };
        map.set(id, { name, assets: prev.assets + s.totalAssets, slots: prev.slots + 1 });
      });
    });
    return Array.from(map.values()).sort((a, b) => b.assets - a.assets).slice(0, 5);
  }, [schedules]);

  const stats = useMemo(() => {
    const today = new Date().toISOString().split('T')[0];
    const certifiedAuditors = users.filter(u => u.certificationExpiry && u.certificationExpiry >= today);
    
    // Unique auditors assigned to at least one slot
    const assignedAuditorsSet = new Set<string>();
    schedules.forEach(s => {
      if (s.auditor1Id) assignedAuditorsSet.add(s.auditor1Id);
      if (s.auditor2Id) assignedAuditorsSet.add(s.auditor2Id);
    });

    return {
      totalAssets: schedules.reduce((sum, s) => sum + s.totalAssets, 0),
      totalSlots: schedules.length,
      assigned: assignedAuditorsSet.size,
      totalAuditors: certifiedAuditors.length,
      completed: schedules.filter(s => s.status === 'Completed').length,
    };
  }, [schedules, users]);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-[100dvh] bg-slate-50">

      {/* Nav */}
      <nav className="sticky top-0 z-50 bg-white/90 backdrop-blur-md border-b border-slate-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 py-2 sm:py-4 flex items-center justify-between">
          <div className="flex items-center gap-2 sm:gap-4">
            <button
              onClick={onBack}
              className="flex items-center gap-1.5 text-slate-500 hover:text-slate-900 transition-colors bg-slate-100/50 hover:bg-slate-100 px-2 py-1.5 rounded-lg"
            >
              <ArrowLeft className="w-4 h-4" />
              <span className="text-[11px] font-bold hidden sm:inline">Back</span>
            </button>

            <div className="w-px h-5 bg-slate-200 hidden sm:block" />

            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-xl bg-indigo-600 flex items-center justify-center">
                <ShieldCheck className="w-4 h-4 text-white" />
              </div>
              <span className="text-sm font-black text-slate-900">
                Audit <span className="text-indigo-600">Kiosk</span>
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-[10px] text-slate-400 font-bold hidden md:block">
              Updated {lastRefresh.toLocaleTimeString()}
            </span>
            <button
              onClick={load}
              disabled={loading}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 rounded-xl text-xs font-bold text-slate-600 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
            <div className="px-3 py-1 bg-emerald-50 border border-emerald-200 rounded-full text-[10px] font-black text-emerald-700 uppercase tracking-wider hidden xs:block">
              Public View
            </div>
          </div>
        </div>
      </nav>

      {/* Body */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 sm:py-8 space-y-4 sm:space-y-6">
        <div className="flex items-center justify-between gap-4">
          <div className="flex-1">
            <KioskStatsBar {...stats} />
          </div>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="lg:hidden flex items-center gap-2 px-4 py-3 bg-white border border-slate-200 rounded-2xl text-slate-600 font-bold text-sm shadow-sm hover:bg-slate-50 transition-colors shrink-0"
          >
            <Filter className={`w-4 h-4 ${showFilters ? 'text-indigo-600' : ''}`} />
            {showFilters ? 'Hide' : 'Filters'}
          </button>
        </div>

        <div className="flex flex-col lg:grid lg:grid-cols-4 gap-4 sm:gap-6">
          <div className={`${showFilters ? 'block' : 'hidden'} lg:block`}>
            <KioskSidebar
              phases={phases}
              uniqueDepartments={uniqueDepartments}
              uniqueLocations={uniqueLocations}
              search={search}
              phaseFilter={phaseFilter}
              statusFilter={statusFilter}
              departmentFilter={departmentFilter}
              locationFilter={locationFilter}
              auditorStats={auditorStats}
              onSearchChange={setSearch}
              onPhaseChange={setPhaseFilter}
              onStatusChange={setStatusFilter}
              onDepartmentChange={setDepartmentFilter}
              onLocationChange={setLocationFilter}
              onClearFilters={() => { 
                setSearch(''); 
                setPhaseFilter(''); 
                setStatusFilter(''); 
                setDepartmentFilter(''); 
                setLocationFilter(''); 
              }}
            />
          </div>

          <div className="lg:col-span-3">
            <KioskGrid
              schedules={filtered}
              users={users}
              maxAssets={maxAssets}
              loading={loading}
              saving={saving}
              onAssign={handleAssign}
              onUnassign={handleUnassign}
              onDateChange={handleDateChange}
            />
          </div>
        </div>
      </div>
    </div>
  );
};
