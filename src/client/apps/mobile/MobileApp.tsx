import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { ShieldCheck, RefreshCw, Download, AlertTriangle, CheckCircle, Info, XCircle, LogOut, UserCircle, X, ExternalLink } from 'lucide-react';
import {
  Box, Flex, HStack, VStack, Text, Heading, Button, Badge,
  Container, IconButton, Avatar, Spinner, Separator, CardRoot, CardHeader, CardBody,
} from '@chakra-ui/react';

import { MobileSchedule, MobileUser, MobilePhase, AssignRole } from './components/types';
import { MobileStatsBar } from './components/MobileStatsBar';
import { MobileSidebar } from './components/MobileSidebar';
import { MobileGrid } from './components/MobileGrid';
import { MobileTabs, MobileTab } from './components/MobileTabs';
import { MobileAuditorStats } from './components/MobileAuditorStats';
import { MobileLoginScreen } from './components/MobileLoginScreen';
import { MobileIOSBanner } from './components/MobileIOSBanner';
import { MobileProfilePanel } from './components/MobileProfilePanel';
import { MobileOfficerHub } from './components/MobileOfficerHub';
import { AutoUpdater } from '../../components/AutoUpdater';
import { authService } from '../../services/auth';
import { getAuthToken } from '../../services/honoClient';
import { User } from '@shared/types';

export const MobileApp: React.FC = () => {
  // ── Auth state ────────────────────────────────────────────────────────────
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [logoBrand, setLogoBrand] = useState('/brandhorizontal.png');

  // ── PWA Installation state ──────────────────────────────────────────────
  const [installPrompt, setInstallPrompt] = useState<any>(null);
  const [isIOS, setIsIOS] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [showIOSBanner, setShowIOSBanner] = useState(true);

  // ── Data state ────────────────────────────────────────────────────────────
  const [schedules, setSchedules] = useState<MobileSchedule[]>([]);
  const [users, setUsers] = useState<MobileUser[]>([]);
  const [phases, setPhases] = useState<MobilePhase[]>([]);
  const [buildings, setBuildings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState(new Date());
  const [maxAssets, setMaxAssets] = useState(500);

  // ── Profile panel state ─────────────────────────────────────────────────
  const [showProfile, setShowProfile] = useState(false);
  const [profilePhone, setProfilePhone] = useState('');
  const [profileSaving, setProfileSaving] = useState(false);

  // ── Server access error (e.g. NOT_CERTIFIED returned by API) ──────────────
  const [serverAccessError, setServerAccessError] = useState<string | null>(null);

  // ── UI state ────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<MobileTab>('schedule');
  const [search, setSearch] = useState('');
  const [phaseFilter, setPhaseFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('');
  const [buildingFilter, setBuildingFilter] = useState('');
  const [levelFilter, setLevelFilter] = useState('');
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
      if (!res.ok) {
        // Non-401 error — parse the body and surface it to the user
        const err = await res.json().catch(() => ({})) as { error?: string; code?: string };
        if (res.status === 403) {
          setServerAccessError(err.error || 'Access restricted. Please contact your administrator.');
        }
        if (!silent) setLoading(false);
        return;
      }
      // Clear any previous server-side access error on success
      setServerAccessError(null);
      const data = await res.json() as { schedules: MobileSchedule[]; users: MobileUser[]; phases: MobilePhase[]; maxAssets: number; buildings: any[] };
      setSchedules(data.schedules ?? []);
      setUsers(data.users ?? []);
      setPhases(data.phases ?? []);
      setBuildings(data.buildings ?? []);
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

  // Load public branding on startup
  useEffect(() => {
    const loadPublicBranding = async () => {
      try {
        const res = await fetch('/api/public/branding');
        if (res.ok) {
          const { branding } = (await res.json()) as any;
          if (branding) {
            const { BRANDING } = await import('../../constants');
            let brandLogoUrl = BRANDING.logoBrand;
            if (branding.logoBrand) {
              BRANDING.logoBrand = branding.logoBrand;
              brandLogoUrl = branding.logoBrand;
            } else if (branding.logoHorizontal || branding.logoSquare) {
              BRANDING.logoBrand = branding.logoHorizontal || branding.logoSquare;
              brandLogoUrl = branding.logoHorizontal || branding.logoSquare;
            }
            if (branding.logoInstitution) BRANDING.logoInstitution = branding.logoInstitution;
            setLogoBrand(brandLogoUrl);
          }
        }
      } catch (err) {
        console.warn('Failed to fetch public branding settings for Mobile:', err);
      }
    };
    loadPublicBranding();
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

  // Real-time visibility-aware background sync and tab-focus refetching for the mobile app
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
      pollInterval = setInterval(performSync, 30000);
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
    setSearch('');
    setPhaseFilter('');
    setStatusFilter('');
    setDepartmentFilter('');
    setBuildingFilter('');
    setLocationFilter('');
    setActiveTab('schedule');
    setServerAccessError(null);
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
      setBuildingFilter('');
      setLevelFilter('');
      setLocationFilter('');
      setActiveTab('schedule');
      
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

    // Snapshot current state for rollback on 409 or network error
    const snapshot = schedules.find(s => s.id === scheduleId);
    const user = users.find(u => u.id === userId);

    // Optimistic update — reflect the assignment immediately so the UI feels instant
    setSchedules(prev => prev.map(s => {
      if (s.id !== scheduleId) return s;
      const updated = {
        ...s,
        [`${role}Id`]: userId,
        [`${role}Name`]: user?.name ?? '',
        [`${role}Contact`]: role === 'supervisor'
          ? (user?.contactNumber || s.supervisorContact || '')
          : (user?.contactNumber ?? ''),
      };
      const hasAll = updated.date && updated.supervisorId && updated.auditor1Id && updated.auditor2Id;
      if (hasAll && updated.status === 'Pending') updated.status = 'In Progress';
      return updated;
    }));

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
        // Roll back the optimistic update — the server rejected the change
        if (snapshot) setSchedules(prev => prev.map(s => s.id === scheduleId ? snapshot : s));
        const err = await res.json() as { error?: string };
        if (res.status === 403) {
          alert("ACCESS DENIED: This audit is locked on the mobile app. Only the assigned Supervisor for this location or the Department Coordinator is allowed to modify or unlock it from the main site.");
        } else {
          showToast(err.error || 'Failed to assign.', 'error');
        }
        return;
      }
      showToast(`Assigned ${user?.name || 'Inspector'} as ${roleLabels[role]} successfully!`, 'success');
      // Optimistic state already applied — no further setSchedules needed
    } catch (err) {
      // Roll back the optimistic update on network error
      if (snapshot) setSchedules(prev => prev.map(s => s.id === scheduleId ? snapshot : s));
      showToast('A connection error occurred. Please try again.', 'error');
    } finally { setSaving(null); }
  };

  const handleUnassign = async (scheduleId: string, role: AssignRole) => {
    const roleLabels: Record<AssignRole, string> = {
      supervisor: 'Supervisor',
      auditor1: 'Auditor 1',
      auditor2: 'Auditor 2',
    };

    // Snapshot for rollback on error
    const snapshot = schedules.find(s => s.id === scheduleId);

    // Optimistic update — clear the slot immediately
    setSchedules(prev => prev.map(s => {
      if (s.id !== scheduleId) return s;
      const updated = {
        ...s,
        [`${role}Id`]: null,
        [`${role}Name`]: null,
        [`${role}Contact`]: role === 'supervisor' ? s.supervisorContact : null,
      };
      if (updated.status === 'In Progress' && (!updated.date || !updated.supervisorId || !updated.auditor1Id || !updated.auditor2Id)) {
        updated.status = 'Pending';
      }
      return updated;
    }));

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
        // Roll back the optimistic update
        if (snapshot) setSchedules(prev => prev.map(s => s.id === scheduleId ? snapshot : s));
        const err = await res.json() as { error?: string };
        if (res.status === 403) {
          alert("ACCESS DENIED: This audit is locked on the mobile app. Only the assigned Supervisor for this location or the Department Coordinator is allowed to modify or unlock it from the main site.");
        } else {
          showToast(err.error || 'Failed to unassign.', 'error');
        }
        return;
      }
      const unassignData = await res.json() as { success?: boolean; revertedToPending?: boolean };
      showToast(`Removed assignment for ${roleLabels[role]}.`, 'info');
      // Correct status if server confirmed a revert that optimistic calc may have missed
      if (unassignData.revertedToPending) {
        setSchedules(prev => prev.map(s => s.id === scheduleId ? { ...s, status: 'Pending' } : s));
      }
    } catch (err) {
      // Roll back the optimistic update on network error
      if (snapshot) setSchedules(prev => prev.map(s => s.id === scheduleId ? snapshot : s));
      showToast('A connection error occurred. Please try again.', 'error');
    } finally { setSaving(null); }
  };

  const handleDateChange = async (scheduleId: string, date: string) => {
    const targetSchedule = schedules.find(s => s.id === scheduleId);
    if (!targetSchedule) return;

    // ── Immediate phase validation for instant feedback ──────────────────
    const matchingPhase = phases.find(p => p.startDate <= date && date <= p.endDate);

    if (!matchingPhase) {
      showToast("Warning: Selected date falls outside of all configured inspection phases!", "warning");
      // Explicitly reset the date to empty — don't call the API
      setSchedules(prev => prev.map(s => s.id === scheduleId ? { ...s, date: '' } : s));
      return;
    }

    if (targetSchedule.phaseId && targetSchedule.phaseId !== matchingPhase.id) {
      // Cross-phase change — flag for filter update after API succeeds
      const crossPhase = true;
showToast(`Plan Overwritten: Inspection reassigned from ${targetSchedule.phaseName} to ${matchingPhase.name}!`, "warning");

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
            alert("ACCESS DENIED: This audit is locked on the mobile app. Only the assigned Supervisor for this location or the Department Coordinator is allowed to modify or unlock it from the main site.");
          } else {
            showToast(err.error || 'Failed to update date.', 'error');
          }
          return;
        }

        // Auto-update phase filter so the card stays visible in its new phase
        setPhaseFilter(matchingPhase.id);
        setSearch(''); // Clear search to ensure visibility

        setSchedules(prev => prev.map(s => {
          if (s.id !== scheduleId) return s;
          const updated = {
            ...s,
            date,
            phaseId: matchingPhase.id,
            phaseName: matchingPhase.name,
            phaseStart: matchingPhase.startDate,
            phaseEnd: matchingPhase.endDate
          };
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
      return; // Early return — handled cross-phase case above
    }

    // Same-phase or no-phase change — proceed with normal flow
    if (matchingPhase && (!targetSchedule.phaseId || targetSchedule.phaseId === matchingPhase.id)) {
      showToast(`Date assigned to ${date} successfully!`, "success");
    }

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
          alert("ACCESS DENIED: This audit is locked on the mobile app. Only the assigned Supervisor for this location or the Department Coordinator is allowed to modify or unlock it from the main site.");
        } else {
          showToast(err.error || 'Failed to update date.', 'error');
        }
        return;
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
      if (buildingFilter && s.buildingId !== buildingFilter) return false;
      if (levelFilter && s.level !== levelFilter) return false;
      if (locationFilter && s.locationId !== locationFilter) return false;
      if (q) {
        return (
          s.locationName.toLowerCase().includes(q) ||
          s.departmentName.toLowerCase().includes(q) ||
          (s.buildingName ?? '').toLowerCase().includes(q) ||
          (s.buildingAbbr ?? '').toLowerCase().includes(q) ||
          (s.auditor1Name ?? '').toLowerCase().includes(q) ||
          (s.auditor2Name ?? '').toLowerCase().includes(q) ||
          (s.supervisorName ?? '').toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [schedules, search, phaseFilter, statusFilter, departmentFilter, buildingFilter, levelFilter, locationFilter]);

  const activeFiltersCount = useMemo(() => {
    let count = 0;
    if (search) count++;
    if (phaseFilter) count++;
    if (statusFilter) count++;
    if (departmentFilter) count++;
    if (buildingFilter) count++;
    if (levelFilter) count++;
    if (locationFilter) count++;
    return count;
  }, [search, phaseFilter, statusFilter, departmentFilter, buildingFilter, levelFilter, locationFilter]);

  const uniqueDepartments = useMemo(() => {
    const map = new Map<string, string>();
    schedules.forEach(s => map.set(s.departmentId, s.departmentName));
    return Array.from(map.entries()).map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [schedules]);

  const uniqueBuildings = useMemo(() => {
    const map = new Map<string, { id: string; name: string; abbr: string }>();
    schedules.forEach(s => {
      if (s.buildingId && s.buildingName) {
        if (!departmentFilter || s.departmentId === departmentFilter) {
          map.set(s.buildingId, { id: s.buildingId, name: s.buildingName, abbr: s.buildingAbbr || '' });
        }
      }
    });
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [schedules, departmentFilter]);

  const uniqueLevels = useMemo(() => {
    const set = new Set<string>();
    schedules.forEach(s => {
      if (s.level) {
        if (!departmentFilter || s.departmentId === departmentFilter) {
          if (!buildingFilter || s.buildingId === buildingFilter) {
            set.add(s.level);
          }
        }
      }
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  }, [schedules, departmentFilter, buildingFilter]);

  const uniqueLocations = useMemo(() => {
    const map = new Map<string, { id: string; name: string; buildingId?: string | null; buildingName?: string | null; buildingAbbr?: string | null; level?: string | null }>();
    schedules.forEach(s => {
      if (!departmentFilter || s.departmentId === departmentFilter) {
        if (!buildingFilter || s.buildingId === buildingFilter) {
          if (!levelFilter || s.level === levelFilter) {
            map.set(s.locationId, {
              id: s.locationId,
              name: s.locationName,
              buildingId: s.buildingId,
              buildingName: s.buildingName,
              buildingAbbr: s.buildingAbbr,
              level: s.level,
            });
          }
        }
      }
    });
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [schedules, departmentFilter, buildingFilter, levelFilter]);

  const auditorStats = useMemo(() => {
    const map = new Map<string, { name: string; assets: number; slots: number }>();
    schedules.forEach(s => {
      [{ id: s.auditor1Id, name: s.auditor1Name }, { id: s.auditor2Id, name: s.auditor2Name }].forEach(({ id, name }) => {
        if (!id || !name) return;
        const prev = map.get(id) ?? { name, assets: 0, slots: 0 };
        map.set(id, { name, assets: prev.assets + s.totalAssets, slots: prev.slots + 1 });
      });
    });
    return Array.from(map.values()).sort((a, b) => b.assets - a.assets);
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

  // ── Personal Dashboard computations (Officer Dashboard in Mobile) ───────────────────
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
    const workload = mySchedules.reduce((sum, s) => sum + (s.totalAssets || 0), 0);
    return { total, completed, inProgress, pending, completionRate, workload };
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
      <Flex minH="dvh" bg="bg" align="center" justify="center">
        <Spinner size="lg" color="indigo.500" borderWidth={4} />
      </Flex>
    );
  }
  if (!currentUser) {
    return <MobileLoginScreen onLogin={setCurrentUser} logoBrand={logoBrand} />;
  }

  // ── Certified-officer gate (PBAC: any role + valid cert = officer) ────────
  const todayStr = new Date().toISOString().split('T')[0];
  const hasCert = !!(currentUser.certificationExpiry && currentUser.certificationExpiry >= todayStr);

  if (!hasCert) {
    return (
      <Flex minH="dvh" bg="bg" direction="column" align="center" justify="center" p={4}>
        <CardRoot maxW="xs" width="full" variant="elevated" overflow="hidden">
          <Box bg="orange.500" px={8} pt={8} pb={6} textAlign="center">
            <Flex w={14} h={14} bg="white/20" borderRadius="2xl" align="center" justify="center" mx="auto" mb={4}>
              <ShieldCheck size={28} color="white" />
            </Flex>
            <Heading size="xl" color="white" mb={1}>Certification Required</Heading>
            <Text color="white/80" fontSize="xs" fontWeight="medium">Audit Mobile · Valid Certification Needed</Text>
          </Box>
          <CardBody gap={4}>
            <VStack gap={1}>
              {currentUser.picture ? (
                <Avatar.Root size="lg">
                  <Avatar.Image src={currentUser.picture} />
                  <Avatar.Fallback name={currentUser.name} />
                </Avatar.Root>
              ) : (
                <Flex w={12} h={12} borderRadius="full" bg="bg.subtle" align="center" justify="center">
                  <UserCircle size={24} color="var(--chakra-colors-fg-muted)" />
                </Flex>
              )}
              <Text fontWeight="bold" fontSize="sm" color="fg">{currentUser.name}</Text>
              <Text fontSize="xs" color="fg.muted">{currentUser.email}</Text>
            </VStack>
            <Box borderRadius="xl" px={4} py={3} bg="orange.50" color="orange.700" borderWidth="1px" borderColor="orange.200" textAlign="center" fontSize="xs" fontWeight="medium">
              Your certification has expired or has not been issued. Please renew your certification via the main site.
            </Box>
            <Button onClick={handleSignOut} variant="outline" colorPalette="gray" width="full" fontWeight="bold" size="sm">
              <LogOut size={14} />
              Sign Out
            </Button>
          </CardBody>
        </CardRoot>
        <Text mt={6} fontSize="2xs" color="fg.muted" fontWeight="medium" textAlign="center">
          Politeknik Kuching Sarawak · Asset Inspection System
        </Text>
      </Flex>
    );
  }

  // ── Server-side access denied gate ────────────────────────────────────────
  if (serverAccessError) {
    return (
      <Flex minH="dvh" bg="bg" direction="column" align="center" justify="center" p={4}>
        <CardRoot maxW="xs" width="full" variant="elevated" overflow="hidden">
          <Box bg="orange.500" px={8} pt={8} pb={6} textAlign="center">
            <Flex w={14} h={14} bg="white/20" borderRadius="2xl" align="center" justify="center" mx="auto" mb={4}>
              <ShieldCheck size={28} color="white" />
            </Flex>
            <Heading size="xl" color="white" mb={1}>Access Restricted</Heading>
            <Text color="white/80" fontSize="xs" fontWeight="medium">Inspection Mobile · Certified Inspectors Only</Text>
          </Box>
          <CardBody gap={4}>
            <VStack gap={1}>
              {currentUser.picture ? (
                <Avatar.Root size="lg">
                  <Avatar.Image src={currentUser.picture} />
                  <Avatar.Fallback name={currentUser.name} />
                </Avatar.Root>
              ) : (
                <Flex w={12} h={12} borderRadius="full" bg="bg.subtle" align="center" justify="center">
                  <UserCircle size={24} color="var(--chakra-colors-fg-muted)" />
                </Flex>
              )}
              <Text fontWeight="bold" fontSize="sm" color="fg">{currentUser.name}</Text>
              <Text fontSize="xs" color="fg.muted">{currentUser.email}</Text>
            </VStack>
            <Box borderRadius="xl" px={4} py={3} bg="orange.50" color="orange.700" borderWidth="1px" borderColor="orange.200" textAlign="center" fontSize="xs" fontWeight="medium">
              {serverAccessError}
            </Box>
            <Button asChild variant="subtle" colorPalette="indigo" width="full" fontWeight="bold" size="sm">
              <a href="https://www.inspect-able.com" target="_blank" rel="noopener noreferrer">
                <ExternalLink size={14} />
                Go to Main Site
              </a>
            </Button>
            <Button onClick={handleSignOut} variant="outline" colorPalette="gray" width="full" fontWeight="bold" size="sm">
              <LogOut size={14} />
              Sign Out
            </Button>
          </CardBody>
        </CardRoot>
        <Text mt={6} fontSize="2xs" color="fg.muted" fontWeight="medium" textAlign="center">
          Politeknik Kuching Sarawak · Asset Inspection System
        </Text>
      </Flex>
    );
  }

  const primaryRole = currentUser.roles[0] || 'Guest';
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
    <Box minH="dvh" bg="bg" pb={{ base: 20, lg: 0 }}>

      {/* Nav */}
      <Box
        as="nav"
        position="sticky"
        top={0}
        zIndex={60}
        bg="white/90"
        backdropFilter="blur-md"
        borderBottomWidth="1px"
        borderColor="border.subtle"
        shadow="sm"
      >
        <Container maxW="7xl" py={2.5} px={{ base: 3, sm: 6 }}>
          <Flex align="center" justify="space-between">
            <HStack gap={{ base: 3, sm: 5 }} minW={0}>
              <HStack gap={2} flexShrink={0}>
                <Flex
                  w={7} h={7}
                  borderRadius="lg"
                  bg="indigo.600"
                  align="center"
                  justify="center"
                  flexShrink={0}
                >
                  <ShieldCheck size={16} color="white" />
                </Flex>
                <VStack gap={0} align="flex-start" minW={0}>
                  <Text fontSize="sm" fontWeight="bold" color="fg" truncate>
                    Audit{' '}
                    <Text as="span" color="indigo.600">Mobile</Text>
                  </Text>
                  <Text fontSize="3xs" fontWeight="bold" color="fg.muted" textTransform="uppercase">
                    v{import.meta.env.VITE_APP_VERSION}
                  </Text>
                </VStack>
              </HStack>

              {/* View Switcher (Desktop only) */}
              <HStack
                display={{ base: 'none', lg: 'flex' }}
                bg="bg.subtle"
                p={0.5}
                borderRadius="lg"
                borderWidth="1px"
                borderColor="border.subtle"
                flexShrink={0}
                gap={0}
              >
                <Button
                  onClick={() => setActiveTab('schedule')}
                  variant={activeTab !== 'hub' ? 'solid' : 'ghost'}
                  colorPalette="indigo"
                  size="xs"
                  fontWeight="bold"
                  textTransform="uppercase"
                  borderRadius="md"
                >
                  Board
                </Button>
                <Button
                  onClick={() => setActiveTab('hub')}
                  variant={activeTab === 'hub' ? 'solid' : 'ghost'}
                  colorPalette="indigo"
                  size="xs"
                  fontWeight="bold"
                  textTransform="uppercase"
                  borderRadius="md"
                >
                  Dashboard
                </Button>
              </HStack>
            </HStack>

            <HStack gap={{ base: 2, sm: 3 }}>
              {installPrompt && (
                <Button
                  onClick={handleInstallApp}
                  colorPalette="indigo"
                  size="xs"
                  fontWeight="bold"
                  animation="pulse"
                >
                  <Download size={14} />
                  Install App
                </Button>
              )}

              <Button
                onClick={() => load()}
                disabled={loading}
                variant="subtle"
                colorPalette="indigo"
                size="xs"
                fontWeight="bold"
              >
                <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
                <Text as="span" display={{ base: 'none', sm: 'inline' }}>Refresh</Text>
              </Button>

              {/* Signed-in user chip */}
              <HStack gap={1.5} pl={2} borderLeftWidth="1px" borderColor="border.subtle">
                <Button
                  onClick={handleToggleProfile}
                  variant="ghost"
                  size="sm"
                  title="My Profile"
                  gap={1.5}
                  px={1.5}
                >
                  {currentUser.picture ? (
                    <Avatar.Root size="xs">
                      <Avatar.Image src={currentUser.picture} />
                      <Avatar.Fallback name={currentUser.name} />
                    </Avatar.Root>
                  ) : (
                    <Flex w={7} h={7} borderRadius="full" bg="indigo.100" align="center" justify="center" flexShrink={0}>
                      <UserCircle size={16} color="var(--chakra-colors-indigo-600)" />
                    </Flex>
                  )}
                  <VStack gap={0.5} align="flex-start" display={{ base: 'none', sm: 'flex' }}>
                    <Text fontSize="2xs" fontWeight="bold" color="fg" maxW="20" truncate>
                      {currentUser.name.split(' ')[0]}
                    </Text>
                    <Badge colorPalette={primaryRole === 'Admin' ? 'red' : primaryRole === 'Coordinator' ? 'purple' : primaryRole === 'Supervisor' ? 'blue' : primaryRole === 'Auditor' ? 'green' : 'gray'} variant="subtle" size="xs" fontWeight="bold">
                      {primaryRole.toUpperCase()}
                    </Badge>
                  </VStack>
                </Button>

                <IconButton
                  aria-label="Sign out"
                  onClick={handleSignOut}
                  variant="ghost"
                  size="xs"
                  colorPalette="red"
                >
                  <LogOut size={14} />
                </IconButton>

                <MobileProfilePanel
                  currentUser={currentUser}
                  showProfile={showProfile}
                  profilePhone={profilePhone}
                  profileSaving={profileSaving}
                  primaryRole={primaryRole}
                  roleClass={roleClass}
                  onPhoneChange={setProfilePhone}
                  onSavePhone={handleUpdatePhone}
                  onSignOut={handleSignOut}
                />
              </HStack>
            </HStack>
          </Flex>
        </Container>
      </Box>

      {/* iOS Installation Banner */}
      <MobileIOSBanner
        isIOS={isIOS}
        isStandalone={isStandalone}
        showIOSBanner={showIOSBanner}
        onClose={() => setShowIOSBanner(false)}
      />

      <MobileTabs activeTab={activeTab} onTabChange={setActiveTab} badgeCount={activeFiltersCount} />

      {/* Body */}
      <Container maxW="7xl" px={{ base: 4, sm: 6, lg: 8 }} py={{ base: 4, sm: 6 }}>
        {activeTab !== 'hub' ? (
          <>
            {/* Stats Tab / Desktop Stats Bar */}
            <div className={`${activeTab === 'stats' ? 'block animate-in fade-in slide-in-from-bottom-4 duration-300' : 'hidden'} lg:block mb-6`}>
              <MobileStatsBar {...stats} />
              <MobileAuditorStats stats={auditorStats} threshold={maxAssets} />
            </div>

            <div className="flex flex-col lg:grid lg:grid-cols-4 gap-6">
              {/* Filters Tab / Desktop Sidebar */}
              <div className={`${activeTab === 'filters' ? 'block animate-in fade-in slide-in-from-bottom-4 duration-300' : 'hidden'} lg:block`}>
                <MobileSidebar
                  phases={phases}
                  uniqueDepartments={uniqueDepartments}
                  uniqueLocations={uniqueLocations}
                  search={search}
                  phaseFilter={phaseFilter}
                  statusFilter={statusFilter}
                  departmentFilter={departmentFilter}
                  buildingFilter={buildingFilter}
                  levelFilter={levelFilter}
                  locationFilter={locationFilter}
                  uniqueBuildings={uniqueBuildings}
                  uniqueLevels={uniqueLevels}
                  onSearchChange={setSearch}
                  onPhaseChange={setPhaseFilter}
                  onStatusChange={setStatusFilter}
                  onDepartmentChange={setDepartmentFilter}
                  onBuildingChange={setBuildingFilter}
                  onLevelChange={setLevelFilter}
                  onLocationChange={setLocationFilter}
                  onClearFilters={() => { 
                    setSearch(''); 
                    setPhaseFilter(''); 
                    setStatusFilter(''); 
                    setDepartmentFilter(''); 
                    setBuildingFilter('');
                    setLevelFilter('');
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
                <MobileGrid
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
          <MobileOfficerHub
            currentUser={currentUser}
            mySchedules={mySchedules}
            myStats={myStats}
            certInfo={certInfo}
            saving={saving}
            threshold={maxAssets}
            onDateChange={handleDateChange}
            onLocate={(locationName) => {
              setSearch(locationName);
              setActiveTab('schedule');
            }}
          />
        )}
      </Container>

      {/* Sleek Glassmorphic Toasts Container */}
      <div className="fixed bottom-20 right-6 z-110 flex flex-col gap-3 max-w-sm w-full pointer-events-none">
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
    </Box>
  );
};
