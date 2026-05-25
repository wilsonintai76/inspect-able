import React, { useCallback } from 'react';
import { User, AppView, DashboardConfig, SystemActivity, AuditPhase, AuditSchedule } from '@shared/types';
import { ToastMessage, ToastType } from '../components/Toast';
import { gateway } from '../services/dataGateway';
import { authService } from '../services/auth';
import { useAuditActions } from './useAuditActions';
import { useEntityActions } from './useEntityActions';
import { useSystemActions } from './useSystemActions';

// ── Props (trimmed — sub-hooks take their own subsets) ────────────────────

interface AppActionsProps {
  currentUser: User | null;
  setCurrentUser: React.Dispatch<React.SetStateAction<User | null>>;
  setViewState: React.Dispatch<React.SetStateAction<'landing' | 'app' | 'docs' | 'kiosk'>>;
  activeView: AppView;
  setActiveView: React.Dispatch<React.SetStateAction<AppView>>;
  schedules: AuditSchedule[];
  setSchedules: React.Dispatch<React.SetStateAction<AuditSchedule[]>>;
  users: User[];
  setUsers: React.Dispatch<React.SetStateAction<User[]>>;
  departments: any[];
  setDepartments: React.Dispatch<React.SetStateAction<any[]>>;
  locations: any[];
  setLocations: React.Dispatch<React.SetStateAction<any[]>>;
  setAuditPhases: React.Dispatch<React.SetStateAction<AuditPhase[]>>;
  setKpiTiers: React.Dispatch<React.SetStateAction<any[]>>;
  setKpiTierTargets: React.Dispatch<React.SetStateAction<any[]>>;
  setInstitutionKPIs: React.Dispatch<React.SetStateAction<any[]>>;
  setDepartmentMappings: React.Dispatch<React.SetStateAction<any[]>>;
  setAuditGroups: React.Dispatch<React.SetStateAction<any[]>>;
  setBuildings: React.Dispatch<React.SetStateAction<any[]>>;
  setActivities: React.Dispatch<React.SetStateAction<SystemActivity[]>>;
  setNotifications: React.Dispatch<React.SetStateAction<any[]>>;
  setToasts: React.Dispatch<React.SetStateAction<ToastMessage[]>>;
  setPairingLocked: React.Dispatch<React.SetStateAction<boolean>>;
  setPairingLockInfo: React.Dispatch<React.SetStateAction<any>>;
  setIsSidebarOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setConfirmState: React.Dispatch<React.SetStateAction<any>>;
  setFeasibilityReport: React.Dispatch<React.SetStateAction<any>>;
  setCrossAuditPermissions: React.Dispatch<React.SetStateAction<any[]>>;
  setLocationMappings: React.Dispatch<React.SetStateAction<any[]>>;
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
  kpiTiers: any[];
  kpiTierTargets: any[];
  institutionKPIs: any[];
  maxAssetsPerDay: number; maxLocationsPerDay: number; standaloneThresholdAssets: number;
  groupingMargin: number; groupingAuditorMargin: number;
  setMaxAssetsPerDay: React.Dispatch<React.SetStateAction<number>>;
  setMaxLocationsPerDay: React.Dispatch<React.SetStateAction<number>>;
  setMinAuditorsPerLocation: React.Dispatch<React.SetStateAction<number>>;
  setDailyInspectionCapacity: React.Dispatch<React.SetStateAction<number>>;
  setStandaloneThresholdAssets: React.Dispatch<React.SetStateAction<number>>;
  setGroupingMargin: React.Dispatch<React.SetStateAction<number>>;
  setGroupingAuditorMargin: React.Dispatch<React.SetStateAction<number>>;
  setAssignmentMode: React.Dispatch<React.SetStateAction<any>>;
  setOpenAuditThreshold: React.Dispatch<React.SetStateAction<number>>;
  locationMappings: any[];
  buildings: any[];
  pairingLocked: boolean;
  pairingLockInfo: any;
  setPairingLockedGlobal?: any;
  assignmentMode?: any;
  openAuditThreshold?: number;
}

export const useAppActions = (props: AppActionsProps) => {
  const {
    currentUser, setCurrentUser, setViewState, setActiveView,
    schedules, setSchedules, users, setUsers, departments, setDepartments,
    locations, setLocations, setAuditPhases, setKpiTiers, setKpiTierTargets,
    setInstitutionKPIs, setDepartmentMappings, setAuditGroups, setBuildings,
    setActivities, setNotifications, setToasts,
    setPairingLocked, setPairingLockInfo, setIsSidebarOpen, setConfirmState,
    setFeasibilityReport, setCrossAuditPermissions, setLocationMappings,
    isGroupSimulatorActive, setIsGroupSimulatorActive, simulatedGroups, setSimulatedGroups,
    isProcessing, setIsProcessing, certRenewalModalUser, setCertRenewalModalUser,
    setShowForcePasswordModal, setShowProfileCompleteModal,
    loadAllData, loadPublicStats, setConnectionErrorMessage,
    departmentsWithAssets, auditPhases, kpiTiers, kpiTierTargets, institutionKPIs,
    maxAssetsPerDay, maxLocationsPerDay, standaloneThresholdAssets,
    groupingMargin, groupingAuditorMargin,
    setMaxAssetsPerDay, setMaxLocationsPerDay, setMinAuditorsPerLocation,
    setDailyInspectionCapacity, setStandaloneThresholdAssets,
    setGroupingMargin, setGroupingAuditorMargin,
    setAssignmentMode, setOpenAuditThreshold,
    locationMappings, buildings, pairingLocked, pairingLockInfo,
  } = props;

  // ── Core utilities ────────────────────────────────────────────────────

  const showToast = useCallback((message: string, type: ToastType = 'success', duration?: number) => {
    const id = crypto.randomUUID();
    setToasts((prev: ToastMessage[]) => [...prev, { id, message, type, duration }]);
  }, [setToasts]);

  const closeToast = useCallback((id: string) => setToasts((prev: ToastMessage[]) => prev.filter((t: ToastMessage) => t.id !== id)), [setToasts]);

  const showError = useCallback((error: any, title: string = 'Operation Failed') => {
    showToast(error?.message || error?.toString?.() || String(error), 'error');
  }, [showToast]);

  const customConfirm = useCallback((title: string, message: string, onConfirm: () => void, isDestructive = true) => {
    setConfirmState({ title, message, onConfirm, isDestructive });
  }, [setConfirmState]);

  const customAlert = useCallback((message: string) => setConfirmState({ title: 'Notice', message, isAlert: true }), [setConfirmState]);

  // ── Auth ──────────────────────────────────────────────────────────────

  const handleLogout = async () => {
    try { await authService.logout(); } catch { /* ignore */ }
    setCurrentUser(null); setViewState('landing'); setActiveView('overview');
    setSchedules([]); setUsers([]); setDepartments([]); setLocations([]);
    setNotifications([]); setShowForcePasswordModal(false); setShowProfileCompleteModal(false);
  };

  const handleLoginSuccess = useCallback(async (userProfile: User) => {
    setCurrentUser(userProfile); setViewState('app'); setActiveView('dashboard');
    localStorage.setItem('audit_pro_session', JSON.stringify(userProfile));
    if ((userProfile.roles || []).some(r => r === 'Admin' || r === 'Coordinator')) await gateway.initializeDefaults();
    loadAllData();
  }, [setCurrentUser, setViewState, setActiveView, loadAllData]);

  const refreshDepartmentTotals = useCallback(async () => {
    try {
      const [allLocs, allDepts, allUsers] = await Promise.all([gateway.getLocations(), gateway.getDepartments(), gateway.getUsers()]);
      const deptTotals: Record<string, number> = {};
      allLocs.forEach((l: any) => { if (l.departmentId && l.status !== 'Archived') deptTotals[l.departmentId] = (deptTotals[l.departmentId] || 0) + (l.totalAssets || 0); });
      const updates = allDepts.map((d: any) => ({
        id: d.id, data: { totalAssets: Math.max(deptTotals[d.id] || 0, d.totalAssets || 0), isExempted: d.isExempted || (deptTotals[d.id] === 0 && !allUsers.some((u: any) => u.departmentId === d.id)) }
      })).filter((u: any) => { const d = allDepts.find((dept: any) => dept.id === u.id); return d && (d.totalAssets !== u.data.totalAssets || d.isExempted !== u.data.isExempted); });
      if (updates.length > 0) { await Promise.all(updates.map((u: any) => gateway.updateDepartment(u.id, u.data))); setDepartments(await gateway.getDepartments()); }
    } catch (e) { /* non-critical */ }
  }, [setDepartments]);

  // ── Sub-hooks ─────────────────────────────────────────────────────────

  const auditActions = useAuditActions({ schedules, setSchedules, users, auditPhases, setActivities, setIsProcessing, showToast, showError, customConfirm });
  const entityActions = useEntityActions({ locations, departments, users, setLocations, setDepartments, setUsers, setSchedules, setCrossAuditPermissions, setAuditPhases, setAuditGroups, setBuildings, setDepartmentMappings, setLocationMappings, showToast, showError, customConfirm, refreshDepartmentTotals });
  const systemActions = useSystemActions({ schedules, setSchedules, setAuditPhases, setKpiTiers, setKpiTierTargets, setInstitutionKPIs, setDepartments, setLocations, setUsers, setCrossAuditPermissions, setPairingLocked, setPairingLockInfo, pairingLocked, pairingLockInfo, currentUser, maxAssetsPerDay, setMaxAssetsPerDay, setMaxLocationsPerDay, setMinAuditorsPerLocation, setDailyInspectionCapacity, setStandaloneThresholdAssets, setGroupingMargin, setGroupingAuditorMargin, setAssignmentMode, setOpenAuditThreshold, setSimulatedGroups, setIsGroupSimulatorActive, setFeasibilityReport, showToast, showError, customConfirm });

  // ── User / Profile ────────────────────────────────────────────────────

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

  const handleApproveCert = async (user: User) => {
    try { await gateway.updateUser(user.id, { status: 'Active' }); showToast('Certification approved'); setUsers(await gateway.getUsers()); }
    catch (e) { showError(e); }
  };

  const handleIssueCertForRenewal = async (issuedDate: string, expiryDate: string) => {
    if (!certRenewalModalUser) return;
    try {
      await gateway.updateUser(certRenewalModalUser.id, { certificationIssued: issuedDate, certificationExpiry: expiryDate, status: 'Active' });
      showToast(`Certificate issued for ${certRenewalModalUser.name}`);
      setUsers(await gateway.getUsers()); setCertRenewalModalUser(null);
    } catch (e) { showError(e); }
  };

  const handleUpdateDashboardConfig = (newConfig: DashboardConfig) => {
    if (!currentUser) return;
    const updated = { ...currentUser, dashboardConfig: newConfig };
    setCurrentUser(updated); localStorage.setItem('audit_pro_session', JSON.stringify(updated));
    showToast('Preferences saved');
  };

  const handleUpdateUserStatus = async (id: string, status: User['status']) => {
    try { await gateway.updateUser(id, { status }); setUsers(await gateway.getUsers()); }
    catch (e) { showError(e); }
  };

  const handleUpdateUserRoles = async (id: string, roles: string[]) => {
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

  const handleBulkActivateStaff = async (entries: { name: string; email: string; department?: string; designation?: string; role?: string }[]) => {
    try { const userIds = users.filter(u => entries.some(e => e.email === u.email)).map(u => u.id); await Promise.all(userIds.map(id => gateway.updateUser(id, { status: 'Active' }))); setUsers(await gateway.getUsers()); showToast('Staff activated'); }
    catch (e) { showError(e); }
  };

  const handleAddMember = async (member: Omit<User, 'id'>) => {
    try { await gateway.addUser(member as any); setUsers(await gateway.getUsers()); showToast('Added'); }
    catch (e) { showError(e); }
  };

  const handleBulkAddMembers = async (members: Omit<User, 'id'>[]) => {
    try { await Promise.all(members.map(m => gateway.addUser(m as any))); setUsers(await gateway.getUsers()); showToast(`Added ${members.length} members`); }
    catch (e) { showError(e); }
  };

  const handleUpdateMember = async (id: string, updates: Partial<User>) => {
    try { await gateway.updateUser(id, updates as any);
      if (updates.departmentId && updates.departmentId !== currentUser?.departmentId) { loadAllData(); }
      else { setUsers(await gateway.getUsers()); }
      if (id === currentUser?.id) { const freshSelf = (await gateway.getUsers()).find(u => u.id === id); if (freshSelf) setCurrentUser(freshSelf); }
      showToast('Updated');
    } catch (e) { showError(e); }
  };

  const handleDeleteMember = async (id: string) => {
    const user = users.find(u => u.id === id);
    customConfirm("Delete Member", `Delete "${user?.name || 'user'}"? This cannot be undone.`, async () => {
      try { await gateway.deleteUser(id); setUsers((prev: User[]) => prev.filter((u: User) => u.id !== id)); showToast('Deleted'); }
      catch (e) { showError(e); }
    });
  };

  // ── Compose return ────────────────────────────────────────────────────

  return {
    // Core
    showToast, closeToast, showError, customConfirm, customAlert,
    handleLogout, handleLoginSuccess, refreshDepartmentTotals,
    handleViewChange,
    // Audit
    ...auditActions,
    // Entity CRUD
    ...entityActions,
    // System
    ...systemActions,
    // User / Profile
    handleRequestRenewal, handleApproveCert, handleIssueCertForRenewal,
    handleUpdateDashboardConfig, handleUpdateUserStatus, handleUpdateUserRoles,
    handleResetUserPassword, handleBulkActivateStaff,
    handleAddMember, handleBulkAddMembers, handleUpdateMember, handleDeleteMember,
  };
};
