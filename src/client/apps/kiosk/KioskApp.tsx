import React, { useState, useEffect, useMemo } from 'react';
import { ShieldCheck, RefreshCw, Download, Smartphone, X } from 'lucide-react';

import { KioskSchedule, KioskUser, KioskPhase, AssignRole } from './components/types';
import { KioskStatsBar } from './components/KioskStatsBar';
import { KioskSidebar } from './components/KioskSidebar';
import { KioskGrid } from './components/KioskGrid';
import { KioskTabs, KioskTab } from './components/KioskTabs';
import { KioskAuditorStats } from './components/KioskAuditorStats';

export const KioskApp: React.FC = () => {
  // ── PWA Installation state ──────────────────────────────────────────────
  const [installPrompt, setInstallPrompt] = useState<any>(null);
  const [isIOS, setIsIOS] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [showIOSBanner, setShowIOSBanner] = useState(true);

  // ── Data state ────────────────────────────────────────────────────────────
  const [schedules, setSchedules] = useState<KioskSchedule[]>([]);
  const [users, setUsers] = useState<KioskUser[]>([]);
  const [phases, setPhases] = useState<KioskPhase[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState(new Date());
  const [maxAssets, setMaxAssets] = useState(500);

  // ── UI state ────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<KioskTab>('schedule');
  const [search, setSearch] = useState('');
  const [phaseFilter, setPhaseFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('');
  const [locationFilter, setLocationFilter] = useState('');

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

  useEffect(() => { 
    load(); 

    // Detect if iOS device
    const userAgent = window.navigator.userAgent.toLowerCase();
    setIsIOS(/iphone|ipad|ipod/.test(userAgent));

    // Detect if running in standalone mode (installed PWA)
    const isStandaloneMode = window.matchMedia('(display-mode: standalone)').matches 
      || (window.navigator as any).standalone === true;
    setIsStandalone(isStandaloneMode);

    // Listen for browser beforeinstallprompt
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setInstallPrompt(e);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstallApp = async () => {
    if (!installPrompt) return;
    installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice;
    if (outcome === 'accepted') {
      setInstallPrompt(null);
    }
  };

  // ── Mutations ─────────────────────────────────────────────────────────────
  const handleAssign = async (scheduleId: string, userId: string, role: AssignRole) => {
    setSaving(scheduleId);
    try {
      const res = await fetch(`/api/public/kiosk/schedules/${scheduleId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, role, action: 'assign' }),
      });
      if (!res.ok) {
        const err = await res.json() as { error?: string };
        if (res.status === 403) {
          alert("ACCESS DENIED: This audit is locked on the public kiosk. Only the assigned Supervisor for this location or the Department Coordinator is allowed to modify or unlock it from the main site.");
        } else {
          alert(err.error || 'Failed to assign.');
        }
        return;
      }
      setSchedules(prev => prev.map(s => {
        if (s.id !== scheduleId) return s;
        const user = users.find(u => u.id === userId);
        const updated = { ...s, [`${role}Id`]: userId, [`${role}Name`]: user?.name ?? '' };
        const hasAll = updated.date && updated.supervisorId && updated.auditor1Id && updated.auditor2Id;
        if (hasAll && updated.status === 'Pending') {
          updated.status = 'In Progress';
        }
        return updated;
      }));
    } catch (err) {
      alert('A connection error occurred. Please try again.');
    } finally { setSaving(null); }
  };

  const handleUnassign = async (scheduleId: string, role: AssignRole) => {
    setSaving(scheduleId);
    try {
      const res = await fetch(`/api/public/kiosk/schedules/${scheduleId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role, action: 'unassign' }),
      });
      if (!res.ok) {
        const err = await res.json() as { error?: string };
        if (res.status === 403) {
          alert("ACCESS DENIED: This audit is locked on the public kiosk. Only the assigned Supervisor for this location or the Department Coordinator is allowed to modify or unlock it from the main site.");
        } else {
          alert(err.error || 'Failed to unassign.');
        }
        return;
      }
      setSchedules(prev => prev.map(s =>
        s.id !== scheduleId ? s : { ...s, [`${role}Id`]: null, [`${role}Name`]: null },
      ));
    } catch (err) {
      alert('A connection error occurred. Please try again.');
    } finally { setSaving(null); }
  };

  const handleDateChange = async (scheduleId: string, date: string) => {
    setSaving(scheduleId);
    try {
      const res = await fetch(`/api/public/kiosk/schedules/${scheduleId}/date`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date }),
      });
      if (!res.ok) {
        const err = await res.json() as { error?: string };
        if (res.status === 403) {
          alert("ACCESS DENIED: This audit is locked on the public kiosk. Only the assigned Supervisor for this location or the Department Coordinator is allowed to modify or unlock it from the main site.");
        } else {
          alert(err.error || 'Failed to update date.');
        }
        return;
      }
      const matchingPhase = phases.find(p => p.startDate <= date && date <= p.endDate);
      setSchedules(prev => prev.map(s => {
        if (s.id !== scheduleId) return s;
        const updated = matchingPhase
          ? {
              ...s,
              date,
              phaseId: matchingPhase.id,
              phaseName: matchingPhase.name,
              phaseStart: matchingPhase.startDate,
              phaseEnd: matchingPhase.endDate
            }
          : { ...s, date };
        const hasAll = updated.date && updated.supervisorId && updated.auditor1Id && updated.auditor2Id;
        if (hasAll && updated.status === 'Pending') {
          updated.status = 'In Progress';
        }
        return updated;
      }));
    } catch (err) {
      alert('A connection error occurred. Please try again.');
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

  const activeFiltersCount = useMemo(() => {
    let count = 0;
    if (search) count++;
    if (phaseFilter) count++;
    if (statusFilter) count++;
    if (departmentFilter) count++;
    if (locationFilter) count++;
    return count;
  }, [search, phaseFilter, statusFilter, departmentFilter, locationFilter]);

  const uniqueDepartments = useMemo(() => {
    const map = new Map<string, string>();
    schedules.forEach(s => map.set(s.departmentId, s.departmentName));
    return Array.from(map.entries()).map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [schedules]);

  const uniqueLocations = useMemo(() => {
    const map = new Map<string, string>();
    schedules.forEach(s => {
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
    return Array.from(map.values()).sort((a, b) => b.assets - a.assets).slice(0, 10);
  }, [schedules]);

  const stats = useMemo(() => {
    const today = new Date().toISOString().split('T')[0];
    const certifiedAuditors = users.filter(u => u.certificationExpiry && u.certificationExpiry >= today);
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
    <div className="min-h-[100dvh] bg-slate-50 pb-20 lg:pb-0">

      {/* Nav */}
      <nav className="sticky top-0 z-[60] bg-white/90 backdrop-blur-md border-b border-slate-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 py-2 sm:py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-2 sm:gap-4">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-xl bg-indigo-600 flex items-center justify-center shrink-0">
                <ShieldCheck className="w-4 h-4 text-white" />
              </div>
              <div className="flex flex-col min-w-0">
                <span className="text-xs sm:text-sm font-black text-slate-900 truncate">
                  Audit <span className="text-indigo-600">Kiosk</span>
                </span>
                <span className="text-[7px] font-bold text-slate-400 tracking-wider uppercase">v{import.meta.env.VITE_APP_VERSION}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {installPrompt && (
              <button
                onClick={handleInstallApp}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-[10px] font-black transition-colors shadow-sm animate-pulse"
              >
                <Download className="w-3.5 h-3.5" />
                Install App
              </button>
            )}

            <button
              onClick={load}
              disabled={loading}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 rounded-xl text-[10px] font-black text-indigo-700 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </div>
      </nav>

      {/* iOS Installation Banner */}
      {isIOS && !isStandalone && showIOSBanner && (
        <div className="bg-indigo-600 text-white px-4 py-3 shadow-md relative animate-in fade-in slide-in-from-top-4 duration-300">
          <div className="max-w-7xl mx-auto flex items-center justify-between gap-3 text-[11px] sm:text-xs font-bold pr-8">
            <div className="flex items-center gap-2">
              <Smartphone className="w-4 h-4 shrink-0 text-indigo-200" />
              <span>
                Install Standalone Kiosk: Tap the <span className="bg-indigo-700 px-1.5 py-0.5 rounded text-white font-extrabold">Share button</span> ↗️ in Safari, then scroll down and select <span className="bg-indigo-700 px-1.5 py-0.5 rounded text-white font-extrabold">Add to Home Screen</span>.
              </span>
            </div>
            <button 
              onClick={() => setShowIOSBanner(false)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-indigo-200 hover:text-white transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      <KioskTabs activeTab={activeTab} onTabChange={setActiveTab} badgeCount={activeFiltersCount} />

      {/* Body */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 sm:py-6">
        
        {/* Stats Tab / Desktop Stats Bar */}
        <div className={`${activeTab === 'stats' ? 'block animate-in fade-in slide-in-from-bottom-4 duration-300' : 'hidden'} lg:block mb-6`}>
          <KioskStatsBar {...stats} />
          <KioskAuditorStats stats={auditorStats} />
        </div>

        <div className="flex flex-col lg:grid lg:grid-cols-4 gap-6">
          {/* Filters Tab / Desktop Sidebar */}
          <div className={`${activeTab === 'filters' ? 'block animate-in fade-in slide-in-from-bottom-4 duration-300' : 'hidden'} lg:block`}>
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
            {activeTab === 'filters' && (
              <button 
                onClick={() => setActiveTab('schedule')}
                className="w-full mt-4 py-4 bg-indigo-600 text-white font-black text-sm rounded-2xl shadow-lg shadow-indigo-200 active:scale-95 transition-all"
              >
                Apply Filters
              </button>
            )}
          </div>

          {/* Schedule Tab / Desktop Grid */}
          <div className={`${activeTab === 'schedule' ? 'block animate-in fade-in slide-in-from-bottom-4 duration-300' : 'hidden'} lg:block lg:col-span-3`}>
            <KioskGrid
              schedules={filtered}
              users={users}
              phases={phases}
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
