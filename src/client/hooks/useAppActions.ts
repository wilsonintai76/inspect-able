import React, { useCallback } from 'react';
import { 
  AuditSchedule, 
  User, 
  Department, 
  Location, 
  AuditPhase, 
  KPITier, 
  KPITierTarget, 
  InstitutionKPITarget, 
  DepartmentMapping, 
  AuditGroup, 
  Building,
  UserRole,
  AppView,
  DashboardConfig,
  SystemActivity,
  AppNotification,
  CrossAuditPermission,
  AssignmentMode,
  LocationMapping
} from '@shared/types';
import { gateway } from '../services/dataGateway';
import { authService } from '../services/auth';
import { bulkManagement } from '../services/bulkManagement';
import { ToastMessage, ToastType } from '../components/Toast';

interface AppActionsProps {
  currentUser: User | null;
  setCurrentUser: React.Dispatch<React.SetStateAction<User | null>>;
  viewState: 'landing' | 'app' | 'docs' | 'kiosk';
  setViewState: React.Dispatch<React.SetStateAction<'landing' | 'app' | 'docs' | 'kiosk'>>;
  activeView: AppView;
  setActiveView: React.Dispatch<React.SetStateAction<AppView>>;
  schedules: AuditSchedule[];
  setSchedules: React.Dispatch<React.SetStateAction<AuditSchedule[]>>;
  users: User[];
  setUsers: React.Dispatch<React.SetStateAction<User[]>>;
  departments: Department[];
  setDepartments: React.Dispatch<React.SetStateAction<Department[]>>;
  locations: Location[];
  setLocations: React.Dispatch<React.SetStateAction<Location[]>>;
  setAuditPhases: React.Dispatch<React.SetStateAction<AuditPhase[]>>;
  setKpiTiers: React.Dispatch<React.SetStateAction<KPITier[]>>;
  setKpiTierTargets: React.Dispatch<React.SetStateAction<KPITierTarget[]>>;
  setInstitutionKPIs: React.Dispatch<React.SetStateAction<InstitutionKPITarget[]>>;
  setDepartmentMappings: React.Dispatch<React.SetStateAction<DepartmentMapping[]>>;
  setAuditGroups: React.Dispatch<React.SetStateAction<AuditGroup[]>>;
  setBuildings: React.Dispatch<React.SetStateAction<Building[]>>;
  setActivities: React.Dispatch<React.SetStateAction<SystemActivity[]>>;
  setNotifications: React.Dispatch<React.SetStateAction<AppNotification[]>>;
  setToasts: React.Dispatch<React.SetStateAction<ToastMessage[]>>;
  setPairingLocked: React.Dispatch<React.SetStateAction<boolean>>;
  setPairingLockInfo: React.Dispatch<React.SetStateAction<any>>;
  setIsSidebarOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setConfirmState: React.Dispatch<React.SetStateAction<any>>;
  setFeasibilityReport: React.Dispatch<React.SetStateAction<any>>;
  setCrossAuditPermissions: React.Dispatch<React.SetStateAction<CrossAuditPermission[]>>;
  setLocationMappings: React.Dispatch<React.SetStateAction<LocationMapping[]>>;
  isGroupSimulatorActive: boolean;
  setIsGroupSimulatorActive: React.Dispatch<React.SetStateAction<boolean>>;
  simulatedGroups: any[];
  setSimulatedGroups: React.Dispatch<React.SetStateAction<any[]>>;
  isProcessing: boolean;
  setIsProcessing: React.Dispatch<React.SetStateAction<boolean>>;
  certRenewalModalUser: User | null;
  setCertRenewalModalUser: React.Dispatch<React.SetStateAction<User | null>>;
  setShowForcePasswordModal: React.Dispatch<React.SetStateAction<boolean>>;
  setShowProfileCompleteModal: React.Dispatch<React.SetStateAction<boolean>>;
  loadAllData: () => Promise<void>;
  loadPublicStats?: () => Promise<void>;
  setConnectionErrorMessage: (msg: string | null) => void;
  departmentsWithAssets: any[];
  auditPhases: AuditPhase[];
  kpiTiers: KPITier[];
  kpiTierTargets: KPITierTarget[];
  institutionKPIs: InstitutionKPITarget[];

  rbacMatrix: any;
  maxAssetsPerDay: number;
  maxLocationsPerDay: number;
  standaloneThresholdAssets: number;
  groupingMargin: number;
  setMaxAssetsPerDay: React.Dispatch<React.SetStateAction<number>>;
  setMaxLocationsPerDay: React.Dispatch<React.SetStateAction<number>>;
  setMinAuditorsPerLocation: React.Dispatch<React.SetStateAction<number>>;
  setDailyInspectionCapacity: React.Dispatch<React.SetStateAction<number>>;
  setStandaloneThresholdAssets: React.Dispatch<React.SetStateAction<number>>;
  setGroupingMargin: React.Dispatch<React.SetStateAction<number>>;
  groupingAuditorMargin: number;
  setGroupingAuditorMargin: React.Dispatch<React.SetStateAction<number>>;
  setAssignmentMode: React.Dispatch<React.SetStateAction<AssignmentMode>>;
  setOpenAuditThreshold: React.Dispatch<React.SetStateAction<number>>;
  locationMappings: LocationMapping[];
  buildings: Building[];
}

export const useAppActions = (props: AppActionsProps) => {
  const { 
    currentUser, setCurrentUser, setViewState, setActiveView, 
    schedules, setSchedules, users, setUsers, departments, setDepartments, 
    locations, setLocations, setAuditPhases, setKpiTiers, 
    setKpiTierTargets, setInstitutionKPIs, setDepartmentMappings, 
    setAuditGroups, setBuildings, setActivities, setNotifications, setToasts,
    setPairingLocked, setPairingLockInfo, setIsSidebarOpen, setConfirmState, setFeasibilityReport, setCrossAuditPermissions,
    setLocationMappings,
    setIsGroupSimulatorActive, setSimulatedGroups,
    isProcessing, setIsProcessing,
    certRenewalModalUser, setCertRenewalModalUser, setShowForcePasswordModal, setShowProfileCompleteModal,
    loadAllData, loadPublicStats, setConnectionErrorMessage, rbacMatrix, departmentsWithAssets, auditPhases, kpiTiers, kpiTierTargets, maxAssetsPerDay,
    setAssignmentMode, setOpenAuditThreshold,
    locationMappings, buildings
  } = props;

  const showToast = useCallback((message: string, type: ToastType = 'success', duration?: number) => {
    const id = crypto.randomUUID ? crypto.randomUUID() : `toast-${Date.now()}`;
    setToasts(prev => [...prev, { id, type, message, duration }]);
  }, [setToasts]);

  const closeToast = useCallback((id: string) => setToasts(prev => prev.filter(t => t.id !== id)), [setToasts]);

  const showError = useCallback((error: any, title: string = 'Operation Failed') => {
    setNotifications(prev => [{
      id: `err-${Date.now()}`, title, message: error?.message || 'Error occurred',
      timestamp: new Date().toISOString(), type: 'urgent', read: false
    }, ...prev]);
  }, [setNotifications]);

  const customConfirm = useCallback((title: string, message: string, onConfirm: () => void, isDestructive = true) => {
    setConfirmState({ title, message, onConfirm, isDestructive });
  }, [setConfirmState]);

  const customAlert = useCallback((message: string) => {
    setConfirmState({ title: 'Notice', message, onConfirm: () => { }, isDestructive: false });
  }, [setConfirmState]);

  const logActivity = useCallback(async (type: SystemActivity['type'], message: string, auditId?: string) => {
    if (!currentUser) return;
    try {
      await gateway.addSystemActivity({ type, message, userId: currentUser.id, auditId });
      setActivities(await gateway.getSystemActivity());
    } catch (e) { console.error(e); }
  }, [currentUser, setActivities]);

  const handleLogout = async () => {
    try { 
      await authService.logout(); 
    } finally { 
      setCurrentUser(null); 
      setViewState('landing'); 
      setIsSidebarOpen(false); 
      if (loadPublicStats) {
        loadPublicStats();
      }
    }
  };

  const handleLoginSuccess = useCallback(async (userProfile: User) => {
    setCurrentUser(userProfile);
    setViewState('app'); 
    const isAdminUser = (userProfile.roles || []).includes('Admin');
    setActiveView(isAdminUser ? 'overview' : 'auditor-dashboard');
    localStorage.setItem('audit_pro_session', JSON.stringify(userProfile));
    if (isAdminUser) await gateway.initializeDefaults();
    loadAllData();
  }, [setCurrentUser, setViewState, setActiveView, loadAllData]);

  const refreshDepartmentTotals = useCallback(async () => {
    try {
      const [allLocs, allDepts, allUsers] = await Promise.all([gateway.getLocations(), gateway.getDepartments(), gateway.getUsers()]);
      const deptTotals: Record<string, number> = {};
      allLocs.forEach(l => { if (l.departmentId && l.status !== 'Archived') deptTotals[l.departmentId] = (deptTotals[l.departmentId] || 0) + (l.totalAssets || 0); });
      const updates = allDepts.map(d => ({
        id: d.id, data: { totalAssets: Math.max(deptTotals[d.id] || 0, d.totalAssets || 0), isExempted: d.isExempted || (deptTotals[d.id] === 0 && !allUsers.some(u => u.departmentId === d.id)) }
      })).filter(u => { const d = allDepts.find(dept => dept.id === u.id); return d && (d.totalAssets !== u.data.totalAssets || d.isExempted !== u.data.isExempted); });
      if (updates.length > 0) { await Promise.all(updates.map(u => gateway.updateDepartment(u.id, u.data))); setDepartments(await gateway.getDepartments()); }
    } catch (e) { console.error(e); }
  }, [setDepartments]);

  const isAuditLocked = (audit: AuditSchedule) => {
    return audit.isLocked === true;
  };

  const handleToggleLock = async (id: string) => {
    const audit = schedules.find(a => a.id === id);
    if (!audit) return;
    try {
      const currentlyLocked = isAuditLocked(audit);
      const newLocked = !currentlyLocked;
      await gateway.updateAudit(id, { isLocked: newLocked });
      setSchedules(prev => prev.map(s => s.id === id ? { ...s, isLocked: newLocked } : s));
      showToast(newLocked ? 'Locked' : 'Unlocked');
    } catch (e) { showError(e); }
  };

  const handleAssign = async (id: string, slot: 1 | 2, userId: string) => {
    try {
      const audit = schedules.find(s => s.id === id);
      if (!audit) return;

      const u = users.find(user => user.id === userId);
      if (!(u?.certificationExpiry && new Date(u.certificationExpiry) > new Date())) throw new Error("Cert required.");
      
      let updates: Partial<AuditSchedule> = slot === 1 ? { auditor1Id: userId } : { auditor2Id: userId };
      
      // Auto-activation check (requires BOTH auditor1 and auditor2)
      if ((updates.status || audit.status) === 'Pending') {
        const finalDate = updates.date !== undefined ? updates.date : audit.date;
        const finalSupervisor = updates.supervisorId !== undefined ? updates.supervisorId : audit.supervisorId;
        const finalAuditor1 = updates.auditor1Id !== undefined ? updates.auditor1Id : (slot === 1 ? userId : audit.auditor1Id);
        const finalAuditor2 = updates.auditor2Id !== undefined ? updates.auditor2Id : (slot === 2 ? userId : audit.auditor2Id);

        if (finalDate && finalSupervisor && finalAuditor1 && finalAuditor2) {
          updates.status = 'In Progress';
        }
      }

      await gateway.updateAudit(id, updates);
      setSchedules(prev => prev.map(s => s.id === id ? { ...s, ...updates } : s));
      showToast(updates.status === 'In Progress' ? 'Assigned & Started Inspection!' : 'Assigned');
    } catch (e) { showError(e); }
  };

  const handleUnassign = async (id: string, slot: 1 | 2) => {
    try {
      const updates = slot === 1 ? { auditor1Id: null } : { auditor2Id: null };
      await gateway.updateAudit(id, updates);
      setSchedules(prev => prev.map(s => s.id === id ? { ...s, ...updates } : s));
    } catch (e) { showError(e); }
  };

  const handleDeleteAudit = async (id: string) => {
    customConfirm("Delete Audit", "Are you sure?", async () => {
      try { await gateway.deleteAudit(id); setSchedules(prev => prev.filter(s => s.id !== id)); showToast('Deleted'); }
      catch (e) { showError(e); }
    });
  };

  const handleUpdateAudit = async (id: string, updates: Partial<AuditSchedule>) => {
    try {
      const audit = schedules.find(s => s.id === id);
      if (audit) {
        if (updates.date !== undefined) {
          const resolvedPhaseId = updates.date
            ? (auditPhases.find(p => p.startDate <= updates.date! && updates.date! <= p.endDate)?.id ?? null)
            : null;
          if (resolvedPhaseId) {
            updates.phaseId = resolvedPhaseId;
          }
        }

        // Auto-activation check
        if ((updates.status || audit.status) === 'Pending') {
          const finalDate = updates.date !== undefined ? updates.date : audit.date;
          const finalSupervisor = updates.supervisorId !== undefined ? updates.supervisorId : audit.supervisorId;
          const finalAuditor = updates.auditor1Id !== undefined ? updates.auditor1Id : audit.auditor1Id;

          if (finalDate && finalSupervisor && finalAuditor) {
            updates.status = 'In Progress';
          }
        }
      }
      await gateway.updateAudit(id, updates);
      setSchedules(prev => prev.map(s => s.id === id ? { ...s, ...updates } : s));
    } catch (e) { showError(e); }
  };

  const handleUpdateAuditDate = async (id: string, date: string) => {
    try {
      const audit = schedules.find(s => s.id === id);
      const resolvedPhaseId = date
        ? (auditPhases.find(p => p.startDate <= date && date <= p.endDate)?.id ?? null)
        : null;
      let updates: Partial<AuditSchedule> = resolvedPhaseId ? { date, phaseId: resolvedPhaseId } : { date };
      
      // Auto-activation check
      if (audit && (updates.status || audit.status) === 'Pending') {
        const finalDate = date;
        const finalSupervisor = audit.supervisorId;
        const finalAuditor = audit.auditor1Id;

        if (finalDate && finalSupervisor && finalAuditor) {
          updates.status = 'In Progress';
        }
      }

      await gateway.updateAudit(id, updates);
      setSchedules(prev => prev.map(s => s.id === id ? { ...s, ...updates } : s));
    } catch (e) { showError(e); }
  };

  const handleToggleStatus = async (id: string) => {
    try {
      const s = schedules.find(x => x.id === id); if (!s) return;
      const status = s.status === 'In Progress' ? 'Completed' : 'In Progress';
      const updates: Partial<AuditSchedule> = { status };
      if (status === 'Completed') updates.isLocked = true;
      await gateway.updateAudit(id, updates);
      setSchedules(prev => prev.map(x => x.id === id ? { ...x, ...updates } : x));
    } catch (e) { showError(e); }
  };

  const handleAddLoc = async (loc: Omit<Location, 'id'>) => {
    try { const nl = await gateway.addLocation(loc); setLocations(await gateway.getLocations()); showToast('Added'); await refreshDepartmentTotals(); }
    catch (e) { showError(e); }
  };



  const handleSyncLocationNotes = async () => {
    try {
      await gateway.syncLocationNotes();
      setLocations(await gateway.getLocations());
      showToast('Existing names synced to Site Notes');
    } catch (e) { showError(e); }
  };

  const handleMergeLocations = async (sourceIds: string[], targetId: string) => {
    try {
      await gateway.mergeLocations(sourceIds, targetId);
      setLocations(await gateway.getLocations());
      showToast('Locations merged successfully');
      await refreshDepartmentTotals();
    } catch (e) { showError(e); }
  };

  const handleUpdateLoc = async (id: string, updates: Partial<Location>) => {
    try { await gateway.updateLocation(id, updates); setLocations(await gateway.getLocations()); await refreshDepartmentTotals(); }
    catch (e) { showError(e); }
  };

  const handleUpdateUninspectedAssetCounts = async (updates: { id: string, uninspectedCount: number }[]) => {
    try {
      await Promise.all(updates.map(u => gateway.updateLocation(u.id, { uninspectedAssetCount: u.uninspectedCount })));
      setLocations(await gateway.getLocations()); showToast('Counts updated');
    } catch (e) { showError(e); }
  };

  const handleArchiveLoc = async (id: string) => {
    const loc = locations.find(l => l.id === id); if (!loc) return;
    customConfirm('Archive Location?', `Archive "${loc.name}"? It will be hidden and its assets will no longer count toward department totals.`, async () => {
      try {
        await gateway.updateLocation(id, { status: 'Archived' });
        setLocations(await gateway.getLocations());
        await refreshDepartmentTotals();
      } catch (e) { showError(e); }
    });
  };

  const handleApproveArchive = async (locationId: string) => {
    try { await gateway.forceDeleteLocation(locationId); setLocations(prev => prev.filter(l => l.id !== locationId)); await refreshDepartmentTotals(); }
    catch (e) { showError(e); }
  };

  const handleRejectArchive = async (locationId: string) => {
    try { const updated = await gateway.updateLocation(locationId, { status: 'Active' }); setLocations(prev => prev.map(l => l.id === locationId ? updated : l)); }
    catch (e) { showError(e); }
  };

  const handleAddDept = async (dept: Omit<Department, 'id'>) => {
    try { await gateway.addDepartment(dept); setDepartments(await gateway.getDepartments()); showToast('Added'); }
    catch (e) { showError(e); }
  };

  const handleBulkAddDepts = async (newDepts: Omit<Department, 'id'>[]) => {
    try { await bulkManagement.addDepartments(newDepts, departments, users); setDepartments(await gateway.getDepartments()); setUsers(await gateway.getUsers()); showToast('Imported'); }
    catch (e) { showError(e); }
  };

  const handleUpdateDept = async (id: string, updates: Partial<Department>) => {
    try { await gateway.updateDepartment(id, updates); setDepartments(await gateway.getDepartments()); showToast('Updated'); }
    catch (e) { showError(e); }
  };

  const handleBulkUpdateDepts = async (updates: { id: string, data: Partial<Department> }[]) => {
    try { await Promise.all(updates.map(u => gateway.updateDepartment(u.id, u.data))); setDepartments(await gateway.getDepartments()); }
    catch (e) { showError(e); }
  };

  const handleArchiveDept = async (id: string) => {
    customConfirm('Archive Department?', 'Archive this department? It will be hidden and excluded from audit grouping.', async () => {
      try { await gateway.updateDepartment(id, { isArchived: true }); setDepartments(await gateway.getDepartments()); }
      catch (e) { showError(e); }
    });
  };

  const handlePurgeDept = async (id: string) => {
    try {
      await gateway.purgeDepartment(id);
      setDepartments(await gateway.getDepartments());
      showToast('Department permanently deleted');
    } catch (e) { showError(e); }
  };

  const handlePurgeLoc = async (id: string) => {
    try {
      await gateway.purgeLocation(id);
      setLocations(await gateway.getLocations());
      await refreshDepartmentTotals();
      showToast('Location permanently deleted');
    } catch (e) { showError(e); }
  };

  const handleAddPermission = async (auditorDeptId: string, targetDeptId: string, isMutual: boolean) => {
    try { await gateway.addPermission({ auditorDeptId, targetDeptId, isMutual, isActive: true }); setCrossAuditPermissions(await gateway.getPermissions()); }
    catch (e) { showError(e); }
  };

  const handleBulkAddPermissions = async (perms: Omit<CrossAuditPermission, 'id'>[]) => {
    try { await gateway.bulkAddPermissions(perms); setCrossAuditPermissions(await gateway.getPermissions()); }
    catch (e) { showError(e); }
  };

  const handleBulkRemovePermissions = async (ids: string[]) => {
    try { await gateway.bulkDeletePermissions(ids); setCrossAuditPermissions(await gateway.getPermissions()); }
    catch (e) { showError(e); }
  };

  const handleClearAllPermissions = async () => {
    try { await gateway.clearAllPermissions(); setCrossAuditPermissions([]); }
    catch (e) { showError(e); }
  };

  const handleResetOnlyPermissions = async () => {
    try { 
      await gateway.resetOnlyPermissions(); 
      const perms = await gateway.getPermissions();
      setCrossAuditPermissions(perms);
    } catch (e) { showError(e); }
  };

  const handleUpdatePermission = async (id: string, updates: Partial<CrossAuditPermission>) => {
    try { await gateway.updatePermission(id, updates); setCrossAuditPermissions(await gateway.getPermissions()); }
    catch (e) { showError(e); }
  };

  const handleRemovePermission = async (id: string) => {
    try { await gateway.deletePermission(id); setCrossAuditPermissions(await gateway.getPermissions()); }
    catch (e) { showError(e); }
  };

  const handleTogglePermission = async (id: string, isActive: boolean) => {
    try { await gateway.updatePermission(id, { isActive }); setCrossAuditPermissions(await gateway.getPermissions()); }
    catch (e) { showError(e); }
  };

  const handleUpdatePhase = async (id: string, updates: Partial<AuditPhase>) => {
    try { await gateway.updateAuditPhase(id, updates); setAuditPhases(await gateway.getAuditPhases()); }
    catch (e) { showError(e); }
  };

  const handleAddPhase = async (phase: Omit<AuditPhase, 'id'>) => {
    try { await gateway.addAuditPhase(phase); setAuditPhases(await gateway.getAuditPhases()); }
    catch (e) { showError(e); }
  };

  const handleDeletePhase = async (id: string) => {
    customConfirm("Delete Phase", "Are you sure?", async () => {
      try { await gateway.deleteAuditPhase(id); setAuditPhases(await gateway.getAuditPhases()); }
      catch (e) { showError(e); }
    });
  };

  const handleRebalanceSchedule = async () => {
    try {
      const [allAudits, allLocs] = await Promise.all([gateway.getAudits(), gateway.getLocations()]);
      const allDepts = departmentsWithAssets;
      const allPhases = [...auditPhases].sort((a, b) => a.startDate.localeCompare(b.startDate));
      const allTiers = [...kpiTiers].sort((a, b) => a.minAssets - b.minAssets);
      const totalInstAssets = allDepts.reduce((sum, d) => sum + (d.totalAssets || 0), 0) || 1;

      for (const dept of allDepts) {
        const totalAssets = dept.totalAssets || 0; if (totalAssets === 0) continue;
        const tier = allTiers.filter(t => (totalAssets / totalInstAssets) * 100 >= t.minAssets).reverse()[0];
        if (!tier) continue;
        const deptLocs = allLocs.filter(l => l.departmentId === dept.id).sort((a, b) => (b.totalAssets || 0) - (a.totalAssets || 0));
        const deptAudits = allAudits.filter(a => a.departmentId === dept.id);
        
        let assignedAssets = 0;
        for (const phase of allPhases) {
          const kt = kpiTierTargets.find(k => k.tierId === tier.id && k.phaseId === phase.id);
          const targetPct = kt?.targetPercentage ?? tier.targets?.[phase.id] ?? 0;
          const targetAssets = Math.ceil(totalAssets * targetPct / 100);
          const needs = targetAssets - assignedAssets;
          if (needs <= 0) continue;

          let currentPhaseAssets = 0;
          const toAssign = deptLocs.filter(l => !deptAudits.some(a => a.locationId === l.id && isAuditLocked(a)));
          for (const loc of toAssign) {
            if (currentPhaseAssets < needs) {
               const existing = deptAudits.find(a => a.locationId === loc.id);
               if (existing) await gateway.updateAudit(existing.id, { phaseId: phase.id });
               else await gateway.addAudit({ 
                 departmentId: dept.id, 
                 locationId: loc.id, 
                 phaseId: phase.id, 
                 status: 'Pending', 
                 auditor1Id: null, 
                 auditor2Id: null, 
                 date: '',
                 supervisorId: currentUser?.id || ''
               });
               currentPhaseAssets += (loc.totalAssets || 1);
            }
          }
          assignedAssets += currentPhaseAssets;
        }
      }
      setSchedules(await gateway.getAudits()); showToast('Rebalanced');
    } catch (e) { showError(e); }
  };

  const handleResetOperationalData = async () => {
    customConfirm("Reset System", "Delete EVERYTHING?", async () => {
      try { await gateway.fullSystemReset(currentUser!.id); await loadAllData(); showToast('Reset complete'); }
      catch (e) { showError(e); }
    });
  };

  const handleResetDepartments = async () => {
    customConfirm("Reset Departments", "Delete ALL depts?", async () => {
      try { await gateway.clearAllDepartments(currentUser!.id); await loadAllData(); }
      catch (e) { showError(e); }
    });
  };

  const handleResetLocations = async () => {
    customConfirm("Reset Locations", "Delete ALL locs?", async () => {
      try { await gateway.clearAllLocations(); await loadAllData(); }
      catch (e) { showError(e); }
    });
  };

  const handleResetUsers = async () => {
    customConfirm("Reset Users", "Delete ALL users?", async () => {
      try { await gateway.clearAllUsers(currentUser!.id); await loadAllData(); }
      catch (e) { showError(e); }
    });
  };

  const handleResetPhases = async () => {
    customConfirm("Reset Phases", "Delete ALL phases?", async () => {
      try { await gateway.clearAuditPhases(); await loadAllData(); }
      catch (e) { showError(e); }
    });
  };

  const handleResetKPI = async () => {
    customConfirm("Reset KPI", "Delete ALL KPI?", async () => {
      try { await gateway.clearKPI(); await loadAllData(); }
      catch (e) { showError(e); }
    });
  };

  const handleLockPairing = async (pairingCount: number) => {
    const info = { locked: true, lockedAt: new Date().toISOString(), lockedBy: currentUser?.name || 'Admin', pairingCount };
    await gateway.updateSystemSetting('pairing_lock', info); setPairingLocked(true); setPairingLockInfo(info); handleRebalanceSchedule();
  };

  const handleResetPairingData = async () => {
    customConfirm("Reset Pairings", "This will permanently delete ALL active cross-audit assignments. Proceed?", async () => {
      try { 
        await gateway.clearAllPermissions(); 
        setFeasibilityReport(null);
        setCrossAuditPermissions([]);
        showToast('Pairings cleared from database.', 'success');
        loadAllData();
      } catch (e) { showError(e); }
    });
  };

  const handleUnlockPairing = async () => {
    // Soft unlock by default, but pairing reset is available via Reset Pairings
    await gateway.updateSystemSetting('pairing_lock', { locked: false }); 
    setPairingLocked(false); 
    setPairingLockInfo(null);
    showToast('Configuration unlocked. You can now edit constraints or pairings.', 'info');
  };

  const handleViewChange = (view: AppView) => {
    if (!currentUser) return;
    const isAdmin = (currentUser.roles || []).includes('Admin');
    if (view !== 'profile' && view !== 'overview' && !isAdmin) {
      if (!(currentUser.departmentId && currentUser.contactNumber)) { showToast('Complete profile', 'info'); setActiveView('profile'); return; }
    }
    setActiveView(view);
  };

  const handleRequestRenewal = async () => {
    try { await gateway.updateUser(currentUser!.id, { status: 'Pending' }); showToast('Renewal request sent'); loadAllData(); }
    catch (e) { showError(e); }
  };

  const handleApproveCert = async (userId: string) => {
    try { await gateway.updateUser(userId, { status: 'Active' }); showToast('Certification approved'); setUsers(await gateway.getUsers()); }
    catch (e) { showError(e); }
  };

  const handleIssueCertForRenewal = async (issuedDate: string, expiryDate: string) => {
    if (!certRenewalModalUser) return;
    try {
      await gateway.updateUser(certRenewalModalUser.id, { certificationIssued: issuedDate, certificationExpiry: expiryDate, status: 'Active' });
      showToast(`Certificate issued for ${certRenewalModalUser.name}`);
      setUsers(await gateway.getUsers());
      setCertRenewalModalUser(null);
    } catch (e) { showError(e); }
  };

  const handleUpdateDashboardConfig = (newConfig: DashboardConfig) => {
    if (!currentUser) return;
    const updated = { ...currentUser, dashboardConfig: newConfig };
    setCurrentUser(updated);
    localStorage.setItem('audit_pro_session', JSON.stringify(updated));
    showToast('Preferences saved');
  };

  const handleUpdateUserStatus = async (id: string, status: User['status']) => {
    try { await gateway.updateUser(id, { status }); setUsers(await gateway.getUsers()); }
    catch (e) { showError(e); }
  };

  const handleUpdateUserRoles = async (id: string, roles: UserRole[]) => {
    try { await gateway.updateUser(id, { roles }); setUsers(await gateway.getUsers()); }
    catch (e) { showError(e); }
  };

  const handleResetUserPassword = async (userId: string) => {
    const user = users.find(u => u.id === userId);
    customConfirm("Reset Password", `Reset password for ${user?.name || 'user'}?`, async () => {
      try { await gateway.resetUserPassword(userId); showToast('Password reset'); }
      catch (e) { showError(e); }
    });
  };

  const handleBulkActivateStaff = async (userIds: string[]) => {
    try { await Promise.all(userIds.map(id => gateway.updateUser(id, { status: 'Active' }))); setUsers(await gateway.getUsers()); showToast('Staff activated'); }
    catch (e) { showError(e); }
  };

  const handleAddKPITier = async (tier: Omit<KPITier, 'id'>) => {
    try { await gateway.addKPITier(tier); setKpiTiers(await gateway.getKPITiers()); }
    catch (e) { showError(e); }
  };

  const handleUpdateKPITier = async (id: string, updates: Partial<KPITier>) => {
    try { await gateway.updateKPITier(id, updates); setKpiTiers(await gateway.getKPITiers()); }
    catch (e) { showError(e); }
  };

  const handleDeleteKPITier = async (id: string) => {
    try { await gateway.deleteKPITier(id); setKpiTiers(await gateway.getKPITiers()); }
    catch (e) { showError(e); }
  };

  const handleUpdateKPITierTarget = async (id: string, updates: Partial<KPITierTarget>) => {
    try { await gateway.updateKPITierTarget(id, updates); setKpiTierTargets(await gateway.getKPITierTargets()); }
    catch (e) { showError(e); }
  };

  const handleUpdateInstitutionKPI = async (id: string, updates: Partial<InstitutionKPITarget>) => {
    try { await gateway.updateInstitutionKPITarget(id, updates); setInstitutionKPIs(await gateway.getInstitutionKPIs()); }
    catch (e) { showError(e); }
  };

  const handleAutoCalculateTierTargets = async (tierId: string) => {
    try { await gateway.autoCalculateTierTargets(tierId); setKpiTierTargets(await gateway.getKPITierTargets()); }
    catch (e) { showError(e); }
  };

  const handleAddDepartmentMapping = async (mapping: Omit<DepartmentMapping, 'id'>) => {
    try { await gateway.addDepartmentMapping(mapping); setDepartmentMappings(await gateway.getDepartmentMappings()); }
    catch (e) { showError(e); }
  };

  const handleDeleteDepartmentMapping = async (id: string) => {
    try { await gateway.deleteDepartmentMapping(id); setDepartmentMappings(await gateway.getDepartmentMappings()); }
    catch (e) { showError(e); }
  };

  const handleAddAuditGroup = async (group: Omit<AuditGroup, 'id'>) => {
    try { await gateway.addAuditGroup(group); setAuditGroups(await gateway.getAuditGroups()); }
    catch (e) { showError(e); }
  };

  const handleUpdateAuditGroup = async (id: string, updates: Partial<AuditGroup>) => {
    try { await gateway.updateAuditGroup(id, updates); setAuditGroups(await gateway.getAuditGroups()); }
    catch (e) { showError(e); }
  };

  const handleDeleteAuditGroup = async (id: string) => {
    try { await gateway.deleteAuditGroup(id); setAuditGroups(await gateway.getAuditGroups()); }
    catch (e) { showError(e); }
  };

  const handleAddLocationMapping = async (mapping: Omit<LocationMapping, 'id'>) => {
    try { await gateway.addLocationMapping(mapping); setLocationMappings(await gateway.getLocationMappings()); }
    catch (e) { showError(e); }
  };

  const handleDeleteLocationMapping = async (id: string) => {
    try { await gateway.deleteLocationMapping(id); setLocationMappings(await gateway.getLocationMappings()); }
    catch (e) { showError(e); }
  };

  const handleBulkAddAudits = async (newAudits: Omit<AuditSchedule, 'id'>[]) => {
    try {
      const result = await bulkManagement.addAudits(newAudits, users, departments, locations, departmentsWithAssets);
      if (!result.success) { showToast(result.message || 'Bulk Import Failed', 'error'); return; }
      if (result.newUsersCreated?.length) setUsers(prev => [...prev, ...result.newUsersCreated!]);
      if (result.newDeptIds?.length) setDepartments(await gateway.getDepartments());
      setLocations(await gateway.getLocations());
      setSchedules(prev => [...prev, ...(result.added || [])]);
      showToast('Audits imported');
    } catch (e) { showError(e); }
  };

  const handleBulkAddLocs = async (newLocs: Omit<Location, 'id'>[]) => {
    try {
      setIsProcessing(true);
      const result = await bulkManagement.addLocations(newLocs, departments, users, locations, locationMappings, buildings);
      if (result.newUsersCreated?.length) setUsers(prev => [...prev, ...result.newUsersCreated!]);
      setLocations(await gateway.getLocations()); await refreshDepartmentTotals(); setDepartments(await gateway.getDepartments());
      showToast('Locations imported');
    } catch (e) { showError(e); }
    finally { setIsProcessing(false); }
  };

  const handleBulkDeleteAuditGroups = async (ids: string[]) => {
    try { await Promise.all(ids.map(id => gateway.deleteAuditGroup(id))); setAuditGroups(await gateway.getAuditGroups()); }
    catch (e) { showError(e); }
  };

  const handleAddBuilding = async (building: Omit<Building, 'id'>) => {
    try { await gateway.addBuilding(building); setBuildings(await gateway.getBuildings()); showToast('Building registered', 'success'); }
    catch (e) { showError(e); }
  };

  const handleUpdateBuilding = async (id: string, updates: Partial<Building>) => {
    try { await gateway.updateBuilding(id, updates); setBuildings(await gateway.getBuildings()); showToast('Building updated', 'success'); }
    catch (e) { showError(e); }
  };

  const handleDeleteBuilding = async (id: string) => {
    try { await gateway.deleteBuilding(id); setBuildings(await gateway.getBuildings()); }
    catch (e) { showError(e); }
  };

  const handleBulkAddBuildings = async (newBuildings: Omit<Building, 'id'>[]) => {
    try { await gateway.bulkAddBuildings(newBuildings); setBuildings(await gateway.getBuildings()); }
    catch (e) { showError(e); }
  };

  const handleAutoConsolidate = async (threshold: number, excludedIds: string[], minAuditors: number, margin: number, useAI: boolean, pairingMode: string = 'asymmetric', aiConsolidation: boolean = false, minAuditorsPerGroup: number = 10, dryRun: boolean = false, auditorMargin: number = 3) => {
    try { 
      const res = await gateway.autoConsolidateAuditGroups(threshold, excludedIds, minAuditors, margin, useAI, pairingMode, aiConsolidation, minAuditorsPerGroup, dryRun, auditorMargin) as any; 
      
      if (dryRun && res?.groups) {
        setSimulatedGroups(res.groups);
        setIsGroupSimulatorActive(true);
        showToast('Grouping Simulation Draft Generated', 'info');
      } else {
        setAuditGroups(await gateway.getAuditGroups()); 
        setDepartments(await gateway.getDepartments());
        setIsGroupSimulatorActive(false);
        setSimulatedGroups([]);
        showToast(aiConsolidation ? 'Auditor-first AI balancing complete' : (useAI ? 'Thematic consolidation complete' : 'Mathematical consolidation complete')); 
      }
      return res;
    } catch (e) { showError(e); }
  };

  const handleCommitGroups = async (groups: any[]) => {
    try {
      setIsProcessing(true);
      // Persist the exact groups from simulation draft
      await gateway.commitConsolidationDraft(groups);
      
      setAuditGroups(await gateway.getAuditGroups());
      setDepartments(await gateway.getDepartments());
      setIsGroupSimulatorActive(false);
      setSimulatedGroups([]);
      showToast('Institutional Groups Committed & Locked', 'success');
    } catch (e) { showError(e); }
  };

  const handleCancelGroupSimulation = () => {
    setIsGroupSimulatorActive(false);
    setSimulatedGroups([]);
    showToast('Simulation Draft Discarded');
  };

  const handleRunStrategicPairing = async (payload: any) => {
    try {
      const res = await gateway.generateStrategicPairings(payload);
      if (res && (props as any).setFeasibilityReport) {
        (props as any).setFeasibilityReport(res);
      }
      return res;
    } catch (e) {
      showError(e);
      throw e;
    }
  };

  const handleSaveFeasibilityReport = (report: any) => {
    if ((props as any).setFeasibilityReport) {
      (props as any).setFeasibilityReport(report);
    }
  };

  const handleSetDeptTotalsFromMapping = async () => {
    try { await gateway.setDeptTotalsFromMapping(); await refreshDepartmentTotals(); showToast('Totals updated'); }
    catch (e) { showError(e); }
  };

  const handleUpsertLocations = async (locs: Omit<Location, 'id'>[]) => {
    try { await gateway.upsertLocations(locs); setLocations(await gateway.getLocations()); await refreshDepartmentTotals(); }
    catch (e) { showError(e); }
  };

  const handleSyncLocationMappings = async () => {
    try { await gateway.syncLocationMappings(); setLocations(await gateway.getLocations()); await refreshDepartmentTotals(); }
    catch (e) { showError(e); }
  };

  const handleAddMember = async (member: Omit<User, 'id'>) => {
    try { await gateway.addUser(member); setUsers(await gateway.getUsers()); showToast('Member added'); }
    catch (e) { showError(e); }
  };

  const handleBulkAddMembers = async (members: Omit<User, 'id'>[]) => {
    try { await bulkManagement.addUsers(members, departments); setUsers(await gateway.getUsers()); showToast('Members imported'); }
    catch (e) { showError(e); }
  };

  const handleUpdateMember = async (id: string, updates: Partial<User>) => {
    try { 
      await gateway.updateUser(id, updates); 
      const freshUsers = await gateway.getUsers();
      setUsers(freshUsers); 
      if (currentUser?.id === id) {
        const freshSelf = freshUsers.find(u => u.id === id);
        if (freshSelf) setCurrentUser(freshSelf);
      }
      showToast('Profile updated'); 
    } catch (e) { showError(e); }
  };

  const handleDeleteMember = async (id: string) => {
    try { await gateway.deleteUser(id); setUsers(await gateway.getUsers()); }
    catch (e) { showError(e); }
  };

  const handleUpdateAssignmentMode = async (mode: AssignmentMode) => {
    try {
      await gateway.updateSystemSetting('audit_strategy', { assignmentMode: mode, openAuditThreshold: (props as any).openAuditThreshold || 500 });
      setAssignmentMode(mode);
      showToast(`Strategy updated to ${mode === 'cross-audit' ? 'Cross Audit' : 'Open Audit'}`);
    } catch (e) { showError(e); }
  };

  const handleUpdateOpenAuditThreshold = async (threshold: number) => {
    try {
      await gateway.updateSystemSetting('audit_strategy', { assignmentMode: (props as any).assignmentMode || 'cross-audit', openAuditThreshold: threshold });
      setOpenAuditThreshold(threshold);
      showToast(`Threshold updated to ${threshold} assets`);
    } catch (e) { showError(e); }
  };

  return {
    showToast, closeToast, showError, customConfirm, customAlert, logActivity, handleLogout, handleLoginSuccess,
    refreshDepartmentTotals, handleToggleLock, handleAssign, handleUnassign, handleDeleteAudit, handleUpdateAudit,
    handleUpdateAuditDate, handleToggleStatus, handleAddLoc, handleUpdateLoc, handleArchiveLoc, handleAddDept,
    handleUpdateDept, handleArchiveDept, handleAddPermission, handleRemovePermission, handleUpdatePhase,
    handleRebalanceSchedule, handleResetOperationalData, handleLockPairing, handleUnlockPairing, handleResetPairingData, handleViewChange,
    handleResetDepartments, handleResetLocations, handleResetUsers, handleResetPhases, handleResetKPI,
    handleBulkAddAudits, handleBulkAddLocs, handleUpdateUninspectedAssetCounts, handleApproveArchive,
    handleRejectArchive, handleBulkAddDepts, handleBulkUpdateDepts, handleBulkAddPermissions,
    handleBulkRemovePermissions, handleTogglePermission, handleAddPhase, handleDeletePhase, handleAddKPITier,
    handleUpdateKPITier, handleUpdateKPITierTarget, handleUpdateInstitutionKPI, handleAutoCalculateTierTargets,
    handleDeleteKPITier, handleAddDepartmentMapping, handleDeleteDepartmentMapping, handleAddAuditGroup,
    handleUpdateAuditGroup, handleUpdateBuilding, handleDeleteBuilding, handleBulkAddBuildings,
    handleDeleteAuditGroup, handleBulkDeleteAuditGroups, handleAutoConsolidate, handleCommitGroups, handleCancelGroupSimulation, handleRunStrategicPairing, handleSaveFeasibilityReport, handleSetDeptTotalsFromMapping,
    handleUpsertLocations, handleSyncLocationMappings, handleAddMember, handleBulkAddMembers, handleUpdateMember,
    handleRequestRenewal, handleApproveCert, handleIssueCertForRenewal, handleUpdateDashboardConfig,
    handleUpdateUserStatus, handleUpdateUserRoles, handleResetUserPassword, handleBulkActivateStaff,
    handleDeleteMember, handleAddBuilding, handleResetOnlyPermissions,
    handleUpdateAssignmentMode, handleUpdateOpenAuditThreshold,
    handleSyncLocationNotes,
    handleMergeLocations,
    handleAddLocationMapping, handleDeleteLocationMapping,
    handlePurgeDept, handlePurgeLoc,
  };
};
