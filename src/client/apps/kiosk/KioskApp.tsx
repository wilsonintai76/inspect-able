import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { ShieldCheck, RefreshCw, Download, Smartphone, X, AlertTriangle, CheckCircle, Info, XCircle, LogOut, UserCircle, Phone, Save, Calendar, CheckCircle2, Clock, TrendingUp, GraduationCap, Building2, MapPin, Trophy, ShieldAlert } from 'lucide-react';

import { KioskSchedule, KioskUser, KioskPhase, AssignRole } from './components/types';
import { KioskStatsBar } from './components/KioskStatsBar';
import { KioskSidebar } from './components/KioskSidebar';
import { KioskGrid } from './components/KioskGrid';
import { KioskTabs, KioskTab } from './components/KioskTabs';
import { KioskAuditorStats } from './components/KioskAuditorStats';
import { KioskLoginScreen } from './components/KioskLoginScreen';
import { AutoUpdater } from '../../components/AutoUpdater';
import { authService } from '../../services/auth';
import { getAuthToken } from '../../services/honoClient';
import { User } from '@shared/types';

export const KioskApp: React.FC = () => {
  // ── Auth state ────────────────────────────────────────────────────────────
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [authChecked, setAuthChecked] = useState(false);

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

  // ── Profile panel state ─────────────────────────────────────────────────
  const [showProfile, setShowProfile] = useState(false);
  const [profilePhone, setProfilePhone] = useState('');
  const [profileSaving, setProfileSaving] = useState(false);

  // ── UI state ────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<KioskTab>('schedule');
  const [viewMode, setViewMode] = useState<'kiosk' | 'hub'>('kiosk');
  const [search, setSearch] = useState('');
  const [phaseFilter, setPhaseFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('');
  const [locationFilter, setLocationFilter] = useState('');
  const [toasts, setToasts] = useState<{ id: string; message: string; type: 'success' | 'warning' | 'error' | 'info' }[]>([]);

  const showToast = (message: string, type: 'success' | 'warning' | 'error' | 'info' = 'success') => {
    const id = Math.random().toString(36).substr(2, 9);
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 4500);
  };

  // ── Data loading ──────────────────────────────────────────────────────────
  const load = useCallback(async (silent = false) => {
    const token = getAuthToken();
    // If auth hasn't resolved yet and there's no JWT, skip silently.
    // The authChecked effect will re-trigger once exchange completes.
    if (!authChecked && !token) return;
    if (!silent) setLoading(true);
    try {
      const headers: HeadersInit = token ? { Authorization: `Bearer ${token}` } : {};
      const res = await fetch('/api/public/kiosk', { credentials: 'include', headers });
      if (res.status === 401) { if (!silent) setLoading(false); return; }
      const data = await res.json() as { schedules: KioskSchedule[]; users: KioskUser[]; phases: KioskPhase[]; maxAssets: number };
      setSchedules(data.schedules ?? []);
      setUsers(data.users ?? []);
      setPhases(data.phases ?? []);
      if (data.maxAssets) setMaxAssets(data.maxAssets);
      setLastRefresh(new Date());
    } catch { /* graceful – keep previous data */ } finally {
      if (!silent) setLoading(false);
    }
  }, [authChecked]);

  // ── Auth init: handle ?google_callback= then check existing session ────────
  useEffect(() => {
    const init = async () => {
      const params = new URLSearchParams(window.location.search);
      const exchangeToken = params.get('google_callback');
      if (exchangeToken) {
        params.delete('google_callback');
        const qs = params.toString();
        window.history.replaceState({}, '', qs ? `?${qs}` : window.location.pathname);
        try {
          const user = await authService.exchangeGoogleToken(exchangeToken);
          setCurrentUser(user);
        } catch { /* invalid / expired token — fall through to login screen */ }
      } else {
        const user = await authService.getCurrentUser();
        if (user) setCurrentUser(user);
      }
      setAuthChecked(true);
    };
    init();
  }, []);

  // ── Load data once auth is confirmed (handles post-SSO-redirect case) ──────
  // The [] effect below starts load() immediately on mount, but if this is a
  // fresh Google OAuth redirect the session cookie isn't set yet → 401.
  // This effect fires once authChecked flips to true (after exchange completes)
  // so the cookie is guaranteed to exist by then.
  useEffect(() => {
    if (authChecked && currentUser) load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authChecked]);

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
  }, [load]);

  // Real-time visibility-aware background sync and tab-focus refetching for the kiosk
  useEffect(() => {
    if (!authChecked || !currentUser) return;

    let pollInterval: NodeJS.Timeout | null = null;

    const performSync = () => {
      if (document.visibilityState === 'visible') {
        load(true);
      }
    };

    const startPolling = () => {
      stopPolling();
      pollInterval = setInterval(performSync, 10000);
    };

    const stopPolling = () => {
      if (pollInterval) {
        clearInterval(pollInterval);
        pollInterval = null;
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        performSync();
        startPolling();
      } else {
        stopPolling();
      }
    };

    const handleWindowFocus = () => {
      performSync();
    };

    // Initialize visibility-aware polling
    if (document.visibilityState === 'visible') {
      startPolling();
    }

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleWindowFocus);

    return () => {
      stopPolling();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleWindowFocus);
    };
  }, [authChecked, currentUser, load]);

  const handleInstallApp = async () => {
    if (!installPrompt) return;
    installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice;
    if (outcome === 'accepted') {
      setInstallPrompt(null);
    }
  };

  const handleSignOut = async () => {
    await authService.logout();
    setCurrentUser(null);
  };

  // Inactivity Auto-Logout (5 minutes)
  useEffect(() => {
    if (!currentUser) return;

    const LOGOUT_TIMEOUT = 5 * 60 * 1000; // 5 minutes
    let timeoutId: NodeJS.Timeout;

    const performLogout = async () => {
      // Clear filters so it's clean for the next user session
      setSearch('');
      setPhaseFilter('');
      setStatusFilter('');
      setDepartmentFilter('');
      setLocationFilter('');
      setActiveTab('schedule');
      setViewMode('kiosk');
      
      await handleSignOut();
      alert("You have been logged out due to inactivity to secure your session.");
    };

    const resetTimer = () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(performLogout, LOGOUT_TIMEOUT);
    };

    // Events to monitor
    const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart'];
    events.forEach(event => {
      window.addEventListener(event, resetTimer);
    });

    // Start timer on mount
    resetTimer();

    return () => {
      clearTimeout(timeoutId);
      events.forEach(event => {
        window.removeEventListener(event, resetTimer);
      });
    };
  }, [currentUser]);

  const handleToggleProfile = () => {
    if (!showProfile) setProfilePhone(currentUser?.contactNumber || '');
    setShowProfile(p => !p);
  };

  const handleUpdatePhone = async () => {
    setProfileSaving(true);
    try {
      const res = await fetch('/api/auth/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ contactNumber: profilePhone }),
      });
      if (!res.ok) throw new Error('Update failed');
      setCurrentUser(prev => prev ? { ...prev, contactNumber: profilePhone } : prev);
      showToast('Contact number updated', 'success');
      setShowProfile(false);
    } catch {
      showToast('Failed to update profile', 'error');
    } finally {
      setProfileSaving(false);
    }
  };

  // ── Mutations ─────────────────────────────────────────────────────────────
  const handleAssign = async (scheduleId: string, userId: string, role: AssignRole) => {
    const roleLabels: Record<AssignRole, string> = {
      supervisor: 'Supervisor',
      auditor1: 'Auditor 1',
      auditor2: 'Auditor 2',
    };

    if (role === 'supervisor') {
      const userObj = users.find(u => u.id === userId);
      const userName = userObj?.name || 'Officer';
      const confirmed = window.confirm(
        `Are you sure you want to assign ${userName} as the Supervisor for this location?\n\nOnce confirmed, the supervisor assignment will be permanently saved and locked in the schedule card.`
      );
      if (!confirmed) return;
    }

    setSaving(scheduleId);
    try {
      const token = getAuthToken();
      const authHeaders: HeadersInit = {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      };
      const res = await fetch(`/api/public/kiosk/schedules/${scheduleId}`, {
        method: 'PATCH',
        headers: authHeaders,
        credentials: 'include',
        body: JSON.stringify({ userId, role, action: 'assign' }),
      });
      if (!res.ok) {
        const err = await res.json() as { error?: string };
        if (res.status === 403) {
          alert("ACCESS DENIED: This audit is locked on the public kiosk. Only the assigned Supervisor for this location or the Department Coordinator is allowed to modify or unlock it from the main site.");
        } else {
          showToast(err.error || 'Failed to assign.', 'error');
        }
        return;
      }
      const user = users.find(u => u.id === userId);
      showToast(`Assigned ${user?.name || 'Officer'} as ${roleLabels[role]} successfully!`, 'success');

      setSchedules(prev => prev.map(s => {
        if (s.id !== scheduleId) return s;
        const updated = { 
          ...s, 
          [`${role}Id`]: userId, 
          [`${role}Name`]: user?.name ?? '',
          [`${role}Contact`]: role === 'supervisor' 
            ? (user?.contactNumber || s.supervisorContact || '')
            : (user?.contactNumber ?? '')
        };
        const hasAll = updated.date && updated.supervisorId && updated.auditor1Id && updated.auditor2Id;
        if (hasAll && updated.status === 'Pending') {
          updated.status = 'In Progress';
        }
        return updated;
      }));
    } catch (err) {
      showToast('A connection error occurred. Please try again.', 'error');
    } finally { setSaving(null); }
  };

  const handleUnassign = async (scheduleId: string, role: AssignRole) => {
    const roleLabels: Record<AssignRole, string> = {
      supervisor: 'Supervisor',
      auditor1: 'Auditor 1',
      auditor2: 'Auditor 2',
    };
    setSaving(scheduleId);
    try {
      const token2 = getAuthToken();
      const unassignHeaders: HeadersInit = {
        'Content-Type': 'application/json',
        ...(token2 ? { Authorization: `Bearer ${token2}` } : {}),
      };
      const res = await fetch(`/api/public/kiosk/schedules/${scheduleId}`, {
        method: 'PATCH',
        headers: unassignHeaders,
        credentials: 'include',
        body: JSON.stringify({ role, action: 'unassign' }),
      });
      if (!res.ok) {
        const err = await res.json() as { error?: string };
        if (res.status === 403) {
          alert("ACCESS DENIED: This audit is locked on the public kiosk. Only the assigned Supervisor for this location or the Department Coordinator is allowed to modify or unlock it from the main site.");
        } else {
          showToast(err.error || 'Failed to unassign.', 'error');
        }
        return;
      }
      const unassignData = await res.json() as { success?: boolean; revertedToPending?: boolean };
      showToast(`Removed assignment for ${roleLabels[role]}.`, 'info');

      setSchedules(prev => prev.map(s => {
        if (s.id !== scheduleId) return s;
        const updated = { 
          ...s, 
          [`${role}Id`]: null, 
          [`${role}Name`]: null,
          [`${role}Contact`]: role === 'supervisor' ? s.supervisorContact : null
        };
        // If server reverted status, reflect it optimistically
        if (unassignData.revertedToPending) updated.status = 'Pending';
        // Also check client-side: if any required field is missing, revert
        else if (updated.status === 'In Progress' && (!updated.date || !updated.supervisorId || !updated.auditor1Id || !updated.auditor2Id)) {
          updated.status = 'Pending';
        }
        return updated;
      }));
    } catch (err) {
      showToast('A connection error occurred. Please try again.', 'error');
    } finally { setSaving(null); }
  };

  const handleDateChange = async (scheduleId: string, date: string) => {
    const targetSchedule = schedules.find(s => s.id === scheduleId);
    if (!targetSchedule) return;

    setSaving(scheduleId);
    try {
      const dateToken = getAuthToken();
      const res = await fetch(`/api/public/kiosk/schedules/${scheduleId}/date`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(dateToken ? { Authorization: `Bearer ${dateToken}` } : {}),
        },
        credentials: 'include',
        body: JSON.stringify({ date }),
      });
      if (!res.ok) {
        const err = await res.json() as { error?: string };
        if (res.status === 403) {
          alert("ACCESS DENIED: This audit is locked on the public kiosk. Only the assigned Supervisor for this location or the Department Coordinator is allowed to modify or unlock it from the main site.");
        } else {
          showToast(err.error || 'Failed to update date.', 'error');
        }
        return;
      }
      
      const matchingPhase = phases.find(p => p.startDate <= date && date <= p.endDate);
      
      if (!matchingPhase) {
        showToast("Warning: Selected date falls outside of all configured audit phases!", "warning");
      } else if (targetSchedule.phaseId && targetSchedule.phaseId !== matchingPhase.id) {
        showToast(`Plan Overwritten: Audit reassigned from ${targetSchedule.phaseName} to ${matchingPhase.name}!`, "warning");
      } else {
        showToast(`Date assigned to ${date} successfully!`, "success");
      }

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
        } else if (!hasAll && updated.status === 'In Progress') {
          updated.status = 'Pending';
        }
        return updated;
      }));
    } catch (err) {
      showToast('A connection error occurred. Please try again.', 'error');
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
      totalAssets: (() => {
        const uniqueLocationAssets = new Map<string, number>();
        schedules.forEach(s => {
          uniqueLocationAssets.set(s.locationId, s.totalAssets);
        });
        return Array.from(uniqueLocationAssets.values()).reduce((sum, val) => sum + val, 0);
      })(),
      totalSlots: schedules.length,
      assigned: assignedAuditorsSet.size,
      totalAuditors: certifiedAuditors.length,
      completed: schedules.filter(s => s.status === 'Completed').length,
    };
  }, [schedules, users]);

  // ── Personal Hub computations (Officer Hub in Kiosk) ──────────────────────
  const mySchedules = useMemo(() => {
    if (!currentUser) return [];
    return schedules.filter(s => s.auditor1Id === currentUser.id || s.auditor2Id === currentUser.id);
  }, [schedules, currentUser]);

  const myStats = useMemo(() => {
    const total = mySchedules.length;
    const completed = mySchedules.filter(s => s.status === 'Completed').length;
    const inProgress = mySchedules.filter(s => s.status === 'In Progress').length;
    const pending = mySchedules.filter(s => s.status === 'Pending').length;
    const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;
    return { total, completed, inProgress, pending, completionRate };
  }, [mySchedules]);

  const certInfo = useMemo(() => {
    if (!currentUser?.certificationExpiry) return null;
    const expiry = new Date(currentUser.certificationExpiry);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const diffTime = expiry.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    let status: 'safe' | 'warning' | 'expired' = 'safe';
    if (diffDays <= 0) status = 'expired';
    else if (diffDays <= 30) status = 'warning';
    
    return { days: diffDays, status, expiryDate: currentUser.certificationExpiry };
  }, [currentUser]);

  // ── Auth gate (after all hooks) ────────────────────────────────────────────
  if (!authChecked) {
    return (
      <div className="min-h-dvh bg-slate-50 flex items-center justify-center">
        <span className="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
      </div>
    );
  }
  if (!currentUser) {
    return <KioskLoginScreen onLogin={setCurrentUser} />;
  }

  // ── Certified-officer gate ─────────────────────────────────────────────────
  const todayStr = new Date().toISOString().split('T')[0];
  const isAuditor = currentUser.roles.includes('Auditor');
  const hasCert = !!(currentUser.certificationExpiry && currentUser.certificationExpiry >= todayStr);

  if (!isAuditor || !hasCert) {
    return (
      <div className="min-h-dvh bg-slate-50 flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-xs bg-white rounded-3xl border border-slate-200 shadow-xl overflow-hidden">
          <div className={`px-8 pt-8 pb-6 text-center ${isAuditor ? 'bg-amber-500' : 'bg-rose-600'}`}>
            <div className="w-14 h-14 bg-white/20 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <ShieldCheck className="w-7 h-7 text-white" />
            </div>
            <h1 className="text-xl font-black text-white mb-1">Access Restricted</h1>
            <p className="text-white/80 text-xs font-medium">Audit Kiosk · Certified Officers Only</p>
          </div>
          <div className="p-6 space-y-4">
            <div className="flex flex-col items-center gap-1">
              {currentUser.picture ? (
                <img src={currentUser.picture} className="w-12 h-12 rounded-full object-cover" alt="" />
              ) : (
                <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center">
                  <UserCircle className="w-6 h-6 text-slate-400" />
                </div>
              )}
              <p className="font-black text-sm text-slate-800">{currentUser.name}</p>
              <p className="text-[11px] text-slate-400">{currentUser.email}</p>
            </div>
            <div className={`rounded-2xl px-4 py-3 text-xs text-center font-medium leading-relaxed ${isAuditor ? 'bg-amber-50 text-amber-700 border border-amber-200' : 'bg-rose-50 text-rose-700 border border-rose-200'}`}>
              {!isAuditor
                ? 'This kiosk is for certified officers only. Your account does not have the Auditor role. Please contact your administrator.'
                : 'Your auditor certification has expired or has not been issued. Please renew your certification via the main site.'}
            </div>
            <button
              onClick={handleSignOut}
              className="w-full flex items-center justify-center gap-2 py-2.5 bg-slate-100 hover:bg-slate-200 rounded-2xl text-xs font-black text-slate-700 transition-colors active:scale-95"
            >
              <LogOut className="w-3.5 h-3.5" />
              Sign Out
            </button>
          </div>
        </div>
        <p className="mt-6 text-[10px] text-slate-400 font-medium text-center">
          Politeknik Kuching Sarawak · Asset Audit System
        </p>
      </div>
    );
  }

  const primaryRole = currentUser.roles[0] || 'Staff';
  const roleBadgeClass: Record<string, string> = {
    Admin: 'bg-rose-100 text-rose-700',
    Coordinator: 'bg-purple-100 text-purple-700',
    Supervisor: 'bg-blue-100 text-blue-700',
    Auditor: 'bg-emerald-100 text-emerald-700',
    Staff: 'bg-slate-100 text-slate-600',
  };
  const roleClass = roleBadgeClass[primaryRole] ?? roleBadgeClass.Staff;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-dvh bg-slate-50 pb-20 lg:pb-0">

      {/* Nav */}
      <nav className="sticky top-0 z-60 bg-white/90 backdrop-blur-md border-b border-slate-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 py-2 sm:py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-3 sm:gap-5 min-w-0">
            <div className="flex items-center gap-2 shrink-0">
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

            {/* View Switcher */}
            <div className="flex bg-slate-100 p-0.5 rounded-xl border border-slate-200/50 shrink-0">
              <button
                onClick={() => setViewMode('kiosk')}
                className={`px-2.5 sm:px-3.5 py-1 text-[9px] sm:text-[10px] font-black uppercase tracking-wider rounded-lg transition-all ${
                  viewMode === 'kiosk'
                    ? 'bg-white text-indigo-600 shadow-xs'
                    : 'text-slate-500 hover:text-slate-900'
                }`}
              >
                Board
              </button>
              <button
                onClick={() => setViewMode('hub')}
                className={`px-2.5 sm:px-3.5 py-1 text-[9px] sm:text-[10px] font-black uppercase tracking-wider rounded-lg transition-all ${
                  viewMode === 'hub'
                    ? 'bg-white text-indigo-600 shadow-xs'
                    : 'text-slate-500 hover:text-slate-900'
                }`}
              >
                My Hub
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
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
              <span className="hidden sm:inline">Refresh</span>
            </button>

            {/* Signed-in user chip — click to open profile panel */}
            <div className="relative flex items-center gap-1.5 pl-2 border-l border-slate-200">
              <button
                onClick={handleToggleProfile}
                className="flex items-center gap-1.5 hover:bg-slate-50 rounded-xl px-1.5 py-1 transition-colors"
                title="My Profile"
              >
                {currentUser.picture ? (
                  <img src={currentUser.picture} className="w-7 h-7 rounded-full object-cover shrink-0" alt="" />
                ) : (
                  <div className="w-7 h-7 rounded-full bg-indigo-100 flex items-center justify-center shrink-0">
                    <UserCircle className="w-4 h-4 text-indigo-600" />
                  </div>
                )}
                <div className="hidden sm:flex flex-col items-start gap-0.5">
                  <span className="text-[10px] font-black text-slate-700 max-w-20 truncate leading-none">
                    {currentUser.name.split(' ')[0]}
                  </span>
                  <span className={`text-[8px] font-black px-1.5 py-0.5 rounded-md ${roleClass}`}>
                    {primaryRole.toUpperCase()}
                  </span>
                </div>
              </button>

              <button
                title="Sign out"
                onClick={handleSignOut}
                className="p-1.5 hover:bg-rose-50 rounded-lg text-slate-400 hover:text-rose-500 transition-colors"
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>

              {/* Profile dropdown panel */}
              {showProfile && (
                <div className="absolute right-0 top-full mt-2 w-72 bg-white rounded-2xl border border-slate-200 shadow-xl z-50 overflow-hidden">
                  <div className="bg-indigo-600 px-4 py-3 flex items-center gap-3">
                    {currentUser.picture ? (
                      <img src={currentUser.picture} className="w-10 h-10 rounded-full object-cover shrink-0 border-2 border-white/30" alt="" />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center shrink-0">
                        <UserCircle className="w-5 h-5 text-white" />
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="text-sm font-black text-white truncate">{currentUser.name}</p>
                      <p className="text-[10px] text-indigo-200 truncate">{currentUser.email}</p>
                    </div>
                    <span className={`ml-auto shrink-0 text-[9px] font-black px-2 py-1 rounded-lg ${roleClass}`}>
                      {primaryRole}
                    </span>
                  </div>
                  <div className="p-4 space-y-3">
                    <div>
                      <label className="block text-[10px] font-black uppercase text-slate-400 tracking-widest mb-1.5">
                        Contact Number
                      </label>
                      <div className="relative">
                        <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                        <input
                          type="tel"
                          value={profilePhone}
                          onChange={e => setProfilePhone(e.target.value)}
                          placeholder="e.g. 012-3456789"
                          className="w-full pl-9 pr-3 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent"
                          maxLength={20}
                        />
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={handleUpdatePhone}
                        disabled={profileSaving}
                        className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl text-xs font-black transition-colors"
                      >
                        {profileSaving ? (
                          <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        ) : (
                          <Save className="w-3.5 h-3.5" />
                        )}
                        Save
                      </button>
                      <button
                        onClick={handleSignOut}
                        className="flex items-center justify-center gap-1.5 px-3 py-2.5 border border-rose-200 hover:bg-rose-50 text-rose-600 rounded-xl text-xs font-black transition-colors"
                      >
                        <LogOut className="w-3.5 h-3.5" />
                        Sign Out
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
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
              title="Close banner"
              onClick={() => setShowIOSBanner(false)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-indigo-200 hover:text-white transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {viewMode === 'kiosk' && (
        <KioskTabs activeTab={activeTab} onTabChange={setActiveTab} badgeCount={activeFiltersCount} />
      )}

      {/* Body */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 sm:py-6 animate-in fade-in duration-300">
        {viewMode === 'kiosk' ? (
          <>
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
                  currentUserId={currentUser.id}
                  currentUserRoles={currentUser.roles as string[]}
                  onAssign={handleAssign}
                  onUnassign={handleUnassign}
                  onDateChange={handleDateChange}
                  onShowToast={showToast}
                />
              </div>
            </div>
          </>
        ) : (
          /* Personal Hub (Officer Hub in Kiosk) */
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
            {/* Greeting Card */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 sm:p-8 rounded-3xl border border-slate-200 shadow-2xs">
              <div>
                <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
                  <ShieldCheck className="w-6 h-6 text-indigo-600 shrink-0" />
                  Personal Officer Hub
                </h2>
                <p className="text-slate-500 text-xs sm:text-sm mt-1">
                  Welcome back, <span className="font-extrabold text-slate-700">{currentUser.name}</span>. Manage your assigned inspections below.
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0 bg-emerald-50 px-3 py-1.5 rounded-full border border-emerald-100 self-start md:self-auto">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                <span className="text-[10px] font-black text-emerald-700 uppercase tracking-wider">Active duty</span>
              </div>
            </div>

            {/* Personal Stats Grid */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                { label: 'Total Assigned', value: myStats.total, icon: Calendar, bg: 'bg-blue-50 text-blue-600', border: 'border-blue-100' },
                { label: 'Completed', value: myStats.completed, icon: CheckCircle2, bg: 'bg-emerald-50 text-emerald-600', border: 'border-emerald-100' },
                { label: 'In Progress', value: myStats.inProgress, icon: Clock, bg: 'bg-amber-50 text-amber-600', border: 'border-amber-100' },
                { label: 'Completion Rate', value: `${myStats.completionRate}%`, icon: TrendingUp, bg: 'bg-indigo-50 text-indigo-600', border: 'border-indigo-100' }
              ].map((c, i) => (
                <div key={i} className={`bg-white p-4 sm:p-5 rounded-2xl border ${c.border} shadow-2xs flex items-center gap-3 sm:gap-4`}>
                  <div className={`w-10 h-10 rounded-xl ${c.bg} flex items-center justify-center shrink-0`}>
                    <c.icon className="w-5 h-5 animate-in zoom-in-50 duration-500" />
                  </div>
                  <div>
                    <p className="text-[9px] sm:text-[10px] font-black text-slate-400 uppercase tracking-wider">{c.label}</p>
                    <p className="text-base sm:text-2xl font-black text-slate-900">{c.value}</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Left Column: My Schedules */}
              <div className="lg:col-span-2 space-y-4">
                <div className="bg-white rounded-3xl border border-slate-200 shadow-2xs overflow-hidden">
                  <div className="p-5 border-b border-slate-100 flex items-center justify-between">
                    <h3 className="font-extrabold text-slate-900 text-sm sm:text-base">My Assigned Tasks</h3>
                    <span className="px-2.5 py-0.5 bg-slate-100 text-slate-600 rounded-full text-[9px] sm:text-[10px] font-black uppercase tracking-wider">
                      {mySchedules.length} {mySchedules.length === 1 ? 'Inspection' : 'Inspections'}
                    </span>
                  </div>
                  <div className="divide-y divide-slate-100">
                    {mySchedules.map(s => {
                      const isSavingDate = saving === s.id;
                      return (
                        <div key={s.id} className="p-4 sm:p-5 hover:bg-slate-50/55 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                          <div className="flex items-center gap-4 min-w-0">
                            {/* Calendar Block */}
                            <div className="w-12 h-12 rounded-xl bg-slate-50 border border-slate-200 flex flex-col items-center justify-center shrink-0">
                              <span className="text-[9px] font-black text-indigo-600 uppercase tracking-tight">
                                {s.date ? new Date(s.date).toLocaleString('default', { month: 'short' }) : 'N/A'}
                              </span>
                              <span className="text-base font-black text-slate-900 leading-none">
                                {s.date ? s.date.split('-')[2] : '-'}
                              </span>
                            </div>
                            
                            <div className="min-w-0">
                              <h4 className="font-black text-slate-900 text-sm sm:text-base truncate">
                                {s.locationName}
                              </h4>
                              <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 mt-1">
                                <span className="text-[10px] sm:text-xs font-semibold text-slate-500">
                                  {s.departmentName}
                                </span>
                                <span className="w-1 h-1 bg-slate-300 rounded-full"></span>
                                <span className="text-[10px] sm:text-xs font-bold text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded-md">
                                  {s.totalAssets} Assets
                                </span>
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0">
                            {/* Date Picker Input */}
                            <div className="flex flex-col gap-0.5 items-start sm:items-end">
                              <label className="text-[8px] text-slate-400 font-black uppercase tracking-wider">Scheduled Date</label>
                              <div className="relative flex items-center">
                                <input
                                  type="date"
                                  title="Inspection Date"
                                  value={s.date || ''}
                                  disabled={isSavingDate}
                                  onChange={(e) => handleDateChange(s.id, e.target.value)}
                                  className="px-2 py-1 bg-slate-50 hover:bg-slate-100 disabled:opacity-50 border border-slate-200 text-[10px] sm:text-xs font-extrabold text-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all cursor-pointer"
                                />
                                {isSavingDate && (
                                  <span className="absolute right-2 w-3.5 h-3.5 border-2 border-indigo-600/30 border-t-indigo-600 rounded-full animate-spin" />
                                )}
                              </div>
                            </div>

                            {/* Status badge */}
                            <div className="flex items-center gap-2">
                              <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider border ${
                                s.status === 'Completed'
                                  ? 'bg-emerald-50 text-emerald-700 border-emerald-100'
                                  : s.status === 'In Progress'
                                  ? 'bg-amber-50 text-amber-700 border-amber-100'
                                  : 'bg-slate-50 text-slate-600 border-slate-200'
                              }`}>
                                {s.status}
                              </span>

                              <button
                                onClick={() => {
                                  setSearch(s.locationName);
                                  setViewMode('kiosk');
                                  setActiveTab('schedule');
                                }}
                                className="px-2.5 py-1 bg-indigo-50 hover:bg-indigo-600 text-indigo-700 hover:text-white rounded-lg text-[10px] font-black transition-all flex items-center gap-1 active:scale-95 shadow-2xs"
                              >
                                Locate
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    {mySchedules.length === 0 && (
                      <div className="p-10 text-center">
                        <div className="w-12 h-12 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-3">
                          <Calendar className="w-6 h-6 text-slate-300" />
                        </div>
                        <p className="text-xs text-slate-500 font-bold">No upcoming inspections assigned to you.</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Right Column: Widgets */}
              <div className="space-y-6">
                {/* Certification Widget */}
                {certInfo && (
                  <div className={`rounded-3xl p-5 text-white shadow-md relative overflow-hidden transition-all duration-300 ${
                    certInfo.status === 'safe' ? 'bg-linear-to-br from-indigo-600 to-blue-700 shadow-indigo-500/10' :
                    certInfo.status === 'warning' ? 'bg-linear-to-br from-amber-500 to-orange-600 shadow-amber-500/10' :
                    'bg-linear-to-br from-rose-600 to-red-700 shadow-rose-500/10'
                  }`}>
                    <GraduationCap className="absolute -right-4 -bottom-4 text-white/10 w-24 h-24" />
                    <div className="relative z-10">
                      <div className="flex items-center justify-between mb-3">
                        <h4 className="text-sm font-black uppercase tracking-wider">Certification</h4>
                        <div className="px-2.5 py-1 rounded-lg border border-white/20 text-[10px] font-black uppercase">
                          {certInfo.status === 'expired' ? 'Expired' : `${certInfo.days} Days Left`}
                        </div>
                      </div>
                      
                      <p className="text-white/90 text-xs leading-relaxed mb-1">
                        {certInfo.status === 'safe' && `Your inspecting officer certificate is valid. It will expire on ${new Date(certInfo.expiryDate).toLocaleDateString()}.`}
                        {certInfo.status === 'warning' && `Your inspecting officer certificate is expiring soon on ${new Date(certInfo.expiryDate).toLocaleDateString()}. Please renew soon.`}
                        {certInfo.status === 'expired' && `Your certificate expired on ${new Date(certInfo.expiryDate).toLocaleDateString()}. Access to inspection forms is suspended.`}
                      </p>
                    </div>
                  </div>
                )}

                {/* Security Widget */}
                <div className="bg-white rounded-3xl border border-slate-200 p-5 shadow-2xs space-y-3">
                  <h4 className="text-xs font-black uppercase text-slate-400 tracking-wider flex items-center gap-1.5">
                    <ShieldAlert className="w-4 h-4 text-indigo-600" />
                    Security Policy
                  </h4>
                  <p className="text-[11px] sm:text-xs text-slate-500 leading-relaxed">
                    To protect your session in shared campus workspaces, this kiosk will automatically log out and reset if no touch or mouse activity is detected for <span className="font-extrabold text-slate-800">5 minutes</span>.
                  </p>
                  <div className="p-3 rounded-xl bg-indigo-50 border border-indigo-100 flex items-start gap-2">
                    <Info className="w-3.5 h-3.5 text-indigo-600 shrink-0 mt-0.5" />
                    <p className="text-[10px] text-indigo-700 font-semibold leading-relaxed">
                      Always sign out manually using the exit button in the top right profile menu when you are done.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Sleek Glassmorphic Toasts Container */}
      <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-3 max-w-sm w-full pointer-events-none">
        {toasts.map(t => {
          let bgClass = 'bg-emerald-600/95 text-white shadow-emerald-500/20';
          let borderClass = 'border-emerald-500/30';
          let Icon = CheckCircle;

          if (t.type === 'warning') {
            bgClass = 'bg-amber-600/95 text-white shadow-amber-500/20';
            borderClass = 'border-amber-500/30';
            Icon = AlertTriangle;
          } else if (t.type === 'error') {
            bgClass = 'bg-rose-600/95 text-white shadow-rose-500/20';
            borderClass = 'border-rose-500/30';
            Icon = XCircle;
          } else if (t.type === 'info') {
            bgClass = 'bg-blue-600/95 text-white shadow-blue-500/20';
            borderClass = 'border-blue-500/30';
            Icon = Info;
          }

          return (
            <div 
              key={t.id}
              className={`p-4 rounded-2xl border backdrop-blur-md flex items-start gap-3 shadow-xl transition-all duration-300 animate-in fade-in slide-in-from-right-4 pointer-events-auto ${bgClass} ${borderClass}`}
            >
              <Icon className="w-5 h-5 shrink-0 text-white" />
              <div className="flex-1 text-xs font-black uppercase tracking-wide leading-relaxed">
                {t.message}
              </div>
              <button 
                title="Dismiss"
                onClick={() => setToasts(prev => prev.filter(x => x.id !== t.id))}
                className="shrink-0 text-white/60 hover:text-white transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          );
        })}
      </div>
      <AutoUpdater isKioskApp={true} />
    </div>
  );
};
