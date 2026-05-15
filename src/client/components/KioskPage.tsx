import React, { useState, useEffect, useMemo } from 'react';
import { ShieldCheck, ArrowLeft, RefreshCw } from 'lucide-react';

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

  // ── Filter state ──────────────────────────────────────────────────────────
  const [search, setSearch] = useState('');
  const [phaseFilter, setPhaseFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  // ── Data loading ──────────────────────────────────────────────────────────
  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/public/kiosk');
      const data = await res.json() as { schedules: KioskSchedule[]; users: KioskUser[]; phases: KioskPhase[] };
      setSchedules(data.schedules ?? []);
      setUsers(data.users ?? []);
      setPhases(data.phases ?? []);
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
  }, [schedules, search, phaseFilter, statusFilter]);

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

  const stats = {
    totalAssets: schedules.reduce((sum, s) => sum + s.totalAssets, 0),
    totalSlots: schedules.length,
    assigned: schedules.filter(s => s.auditor1Id).length,
    completed: schedules.filter(s => s.status === 'Completed').length,
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-50 overflow-y-auto">

      {/* Nav */}
      <nav className="sticky top-0 z-50 bg-white/90 backdrop-blur-md border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={onBack}
              className="flex items-center gap-2 text-slate-500 hover:text-slate-900 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              <span className="text-xs font-bold">Back</span>
            </button>

            <div className="w-px h-5 bg-slate-200" />

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
            <div className="px-3 py-1 bg-emerald-50 border border-emerald-200 rounded-full text-[10px] font-black text-emerald-700 uppercase tracking-wider">
              Public View
            </div>
          </div>
        </div>
      </nav>

      {/* Body */}
      <div className="max-w-7xl mx-auto px-6 py-8">
        <KioskStatsBar {...stats} />

        <div className="grid lg:grid-cols-4 gap-6">
          <KioskSidebar
            phases={phases}
            search={search}
            phaseFilter={phaseFilter}
            statusFilter={statusFilter}
            auditorStats={auditorStats}
            onSearchChange={setSearch}
            onPhaseChange={setPhaseFilter}
            onStatusChange={setStatusFilter}
            onClearFilters={() => { setSearch(''); setPhaseFilter(''); setStatusFilter(''); }}
          />

          <div className="lg:col-span-3">
            <KioskGrid
              schedules={filtered}
              users={users}
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
