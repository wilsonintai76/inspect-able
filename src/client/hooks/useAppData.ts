import { useState, useCallback, useRef, useMemo } from 'react';
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
  SystemActivity, 
  AuditGroup, 

  DashboardConfig,
  AppView,
  LocationMapping,
  Building,
  AppNotification
} from '@shared/types';
import { gateway } from '../services/dataGateway';
import { awaitSessionRegistered } from '../services/honoClient';
import { ToastMessage } from '../components/Toast';
import { authService } from '../services/auth';
import { CrossAuditPermission, AssignmentMode } from '@shared/types';
import { SOFTWARE_DEV_DEPT_NAME } from '../constants';

export const useAppData = () => {
  const [viewState, setViewState] = useState<'landing' | 'app' | 'docs' | 'kiosk'>(() => {
    // If the user visits kiosk.domain.com, instantly route to the kiosk view.
    if (typeof window !== 'undefined' && window.location.hostname.startsWith('kiosk.')) {
      return 'kiosk';
    }
    return 'landing';
  });
  const [activeView, setActiveView] = useState<AppView>('overview');
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [connectionErrorMessage, setConnectionErrorMessage] = useState<string | null>(null);
  const [showForcePasswordModal, setShowForcePasswordModal] = useState(false);
  const [showProfileCompleteModal, setShowProfileCompleteModal] = useState(false);
  const [certRenewalModalUser, setCertRenewalModalUser] = useState<User | null>(null);

  const [schedules, setSchedules] = useState<AuditSchedule[]>([]);
  const [maxAssetsPerDay, setMaxAssetsPerDay] = useState<number>(1000);
  const [maxLocationsPerDay, setMaxLocationsPerDay] = useState<number>(5);
  const [minAuditorsPerLocation, setMinAuditorsPerLocation] = useState<number>(2);
  const [dailyInspectionCapacity, setDailyInspectionCapacity] = useState<number>(150);
  const [standaloneThresholdAssets, setStandaloneThresholdAssets] = useState<number>(1000);
  const [groupingMargin, setGroupingMargin] = useState<number>(0.15);
  const [groupingAuditorMargin, setGroupingAuditorMargin] = useState<number>(3);
  const [assignmentMode, setAssignmentMode] = useState<AssignmentMode>('open-audit');
  const [openAuditThreshold, setOpenAuditThreshold] = useState<number>(500);
  const [pairingLocked, setPairingLocked] = useState<boolean>(() => {
    try { return localStorage.getItem('pairing_lock_active') === 'true'; } catch { return false; }
  });
  const [pairingLockInfo, setPairingLockInfo] = useState<any>(() => {
    try { const s = localStorage.getItem('pairing_lock_info'); return s ? JSON.parse(s) : null; } catch { return null; }
  });
  const [users, setUsers] = useState<User[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [auditPhases, setAuditPhases] = useState<AuditPhase[]>([]);
  const [kpiTiers, setKpiTiers] = useState<KPITier[]>([]);
  const [kpiTierTargets, setKpiTierTargets] = useState<KPITierTarget[]>([]);
  const [institutionKPIs, setInstitutionKPIs] = useState<InstitutionKPITarget[]>([]);
  const [departmentMappings, setDepartmentMappings] = useState<DepartmentMapping[]>([]);
  const [locationMappings, setLocationMappings] = useState<LocationMapping[]>([]);
  const [auditGroups, setAuditGroups] = useState<AuditGroup[]>([]);
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [activities, setActivities] = useState<SystemActivity[]>([]);
  const [crossAuditPermissions, setCrossAuditPermissions] = useState<CrossAuditPermission[]>([]);
  const [publicStats, setPublicStats] = useState<any>(null);
  const [simulatedGroups, setSimulatedGroups] = useState<any[]>([]);
  const [isGroupSimulatorActive, setIsGroupSimulatorActive] = useState<boolean>(false);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);

  const [selectedDept, setSelectedDept] = useState<string>('All');
  const [selectedStatus, setSelectedStatus] = useState<string>('All');
  const [selectedPhaseId, setSelectedPhaseId] = useState<string>('All');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [confirmState, setConfirmState] = useState<any>(null);
  const [feasibilityReport, setFeasibilityReport] = useState<any>(() => {
    try {
      const saved = localStorage.getItem('last_feasibility_report');
      return saved ? JSON.parse(saved) : null;
    } catch { return null; }
  });

  // Persist feasibility report
  useMemo(() => {
    if (feasibilityReport) {
      localStorage.setItem('last_feasibility_report', JSON.stringify(feasibilityReport));
    } else {
      localStorage.removeItem('last_feasibility_report');
    }
  }, [feasibilityReport]);

  const dataLoadedRef = useRef(false);

  const loadPublicStats = useCallback(async () => {
    try {
      const base = import.meta.env.MODE === 'development' ? 'http://localhost:3000' : window.location.origin;
      const res = await fetch(`${base}/api/public/stats`);
      if (res.ok) setPublicStats(await res.json());
    } catch { /* ignore */ }
  }, []);

  const loadAllData = useCallback(async () => {
    try {
      const [auditsData, usersData, deptsData, locsData, phasesData, kpiTiersData, departmentMappingsData, activitiesData, auditGroupsData, institutionKPIsData, buildingsData, permsData] = await Promise.all([
        gateway.getAudits(), gateway.getUsers(), gateway.getDepartments(), gateway.getLocations(),
        gateway.getAuditPhases(), gateway.getKPITiers(), gateway.getDepartmentMappings(),
        gateway.getSystemActivity(), gateway.getAuditGroups(), gateway.getInstitutionKPIs(),
        gateway.getBuildings(), gateway.getPermissions()
      ]);
      
      setSchedules(auditsData); setUsers(usersData); setDepartments(deptsData); setLocations(locsData);
      setAuditPhases(phasesData); setKpiTiers(kpiTiersData); setDepartmentMappings(departmentMappingsData);
      setActivities(activitiesData); setAuditGroups(auditGroupsData); setInstitutionKPIs(institutionKPIsData);
      setBuildings(buildingsData); setCrossAuditPermissions(permsData);
      
      try { setLocationMappings(await gateway.getLocationMappings()); } catch (e) { console.warn(e); }

      try {
        const settings = await gateway.getSystemSettings();
        const constraints = settings.find(s => s.id === 'audit_constraints')?.value;
        if (constraints) {
          if (constraints.maxAssetsPerDay) setMaxAssetsPerDay(constraints.maxAssetsPerDay);
          if (constraints.maxLocationsPerDay) setMaxLocationsPerDay(constraints.maxLocationsPerDay);
          if (constraints.minAuditorsPerLocation) setMinAuditorsPerLocation(constraints.minAuditorsPerLocation);
          if (constraints.dailyInspectionCapacity) setDailyInspectionCapacity(constraints.dailyInspectionCapacity);
          if (constraints.standaloneThresholdAssets) setStandaloneThresholdAssets(constraints.standaloneThresholdAssets);
          if (constraints.groupingMargin) setGroupingMargin(constraints.groupingMargin);
          if (constraints.groupingAuditorMargin) setGroupingAuditorMargin(constraints.groupingAuditorMargin);
        }

        const strategy = settings.find(s => s.id === 'audit_strategy')?.value;
        if (strategy) {
          // System operates exclusively in streamlined Open Audit Mode
          setAssignmentMode('open-audit');
          if (strategy.openAuditThreshold) setOpenAuditThreshold(strategy.openAuditThreshold);
        }

        const pairingLock = settings.find(s => s.id === 'pairing_lock')?.value;
        if (pairingLock?.locked) { setPairingLocked(true); setPairingLockInfo(pairingLock); }
        else { setPairingLocked(false); setPairingLockInfo(null); }
      } catch (e) { console.warn(e); }

      try { setKpiTierTargets(await gateway.getKPITierTargets()); } catch (e) { console.warn(e); }
    } catch (e) {
      setConnectionErrorMessage((e as any)?.message || "Failed to load data.");
    }
  }, []);

  const initSession = useCallback(async () => {
    try {
      await awaitSessionRegistered();
      const user = await authService.getCurrentUser();
      if (user) {
        setCurrentUser(user);
        setViewState('app');
        await loadAllData();
      } else {
        await loadPublicStats();
      }
    } finally {
      setIsInitialLoading(false);
    }
  }, [loadAllData, loadPublicStats]);

  const departmentNames = useMemo(() => ['All', ...departments.map(d => d.name)], [departments]);
  
  const departmentsWithAssets = useMemo(() => {
    // Aggregate metrics per department
    const deptTotals: Record<string, number> = {};
    const deptLocations: Record<string, number> = {};
    locations.forEach(l => { 
      if (l.departmentId) {
        deptTotals[l.departmentId] = (deptTotals[l.departmentId] || 0) + (l.totalAssets || 0);
        deptLocations[l.departmentId] = (deptLocations[l.departmentId] || 0) + 1;
      }
    });

    // Unified Auditor Definition: Status Active AND Valid Expiry exists
    const deptAuditors: Record<string, number> = {};
    const today = new Date().toISOString().split('T')[0];
    users.forEach(u => {
      const isValidAuditor = u.status === 'Active' && u.certificationExpiry && u.certificationExpiry >= today;
      if (u.departmentId && isValidAuditor) {
        deptAuditors[u.departmentId] = (deptAuditors[u.departmentId] || 0) + 1;
      }
    });

    return departments
      .filter(d => d.name !== SOFTWARE_DEV_DEPT_NAME)
      .map(d => {
        const totalAssets = deptTotals[d.id] || 0;
        const auditorCount = deptAuditors[d.id] || 0;
        const locationCount = deptLocations[d.id] || 0;
        return { 
          ...d, 
          totalAssets,
          auditorCount,
          locationCount,
          // Natural Exemption: 0 assets AND 0 certified auditors
          isSystemExempted: totalAssets === 0 && auditorCount === 0
        };
      });
  }, [departments, locations, users]);

  const filteredSchedules = useMemo(() => {
    return schedules.filter(s => {
      if (selectedDept !== 'All' && s.departmentId !== departments.find(d => d.name === selectedDept)?.id) return false;
      if (selectedStatus !== 'All' && s.status !== selectedStatus) return false;
      if (selectedPhaseId !== 'All' && s.phaseId !== selectedPhaseId) return false;
      return true;
    });
  }, [schedules, selectedDept, selectedStatus, selectedPhaseId, departments]);

  const topDepartments = useMemo(() => {
    return departmentsWithAssets
      .filter(d => !d.isExempted)
      .map(d => {
        const deptAudits = schedules.filter(a => a.departmentId === d.id);
        const completed = deptAudits.filter(a => a.status === 'Completed').length;
        const total = deptAudits.length;
        return { name: d.name, compliance: total > 0 ? Math.round((completed / total) * 100) : 0 };
      })
      .sort((a, b) => b.compliance - a.compliance)
      .slice(0, 5);
  }, [departmentsWithAssets, schedules]);

  return {
    viewState, setViewState, activeView, setActiveView, currentUser, setCurrentUser,
    isInitialLoading, setIsInitialLoading, connectionErrorMessage, setConnectionErrorMessage,
    showForcePasswordModal, setShowForcePasswordModal, showProfileCompleteModal, setShowProfileCompleteModal,
    certRenewalModalUser, setCertRenewalModalUser, schedules, setSchedules,
    maxAssetsPerDay, setMaxAssetsPerDay, maxLocationsPerDay, setMaxLocationsPerDay,
    minAuditorsPerLocation, setMinAuditorsPerLocation, dailyInspectionCapacity, setDailyInspectionCapacity,
    standaloneThresholdAssets, setStandaloneThresholdAssets,
    groupingMargin, setGroupingMargin,
    pairingLocked, setPairingLocked, pairingLockInfo, setPairingLockInfo,
    users, setUsers, departments, setDepartments, locations, setLocations,
    auditPhases, setAuditPhases, kpiTiers, setKpiTiers, kpiTierTargets, setKpiTierTargets,
    institutionKPIs, setInstitutionKPIs, departmentMappings, setDepartmentMappings,
    locationMappings, setLocationMappings,
    auditGroups, setAuditGroups, buildings, setBuildings, notifications, setNotifications,
    toasts, setToasts, activities, setActivities, crossAuditPermissions, setCrossAuditPermissions,
    publicStats, setPublicStats, selectedDept, setSelectedDept, selectedStatus, setSelectedStatus,
    selectedPhaseId, setSelectedPhaseId, isSidebarOpen, setIsSidebarOpen,
    confirmState, setConfirmState, feasibilityReport, setFeasibilityReport,
    loadAllData, loadPublicStats, initSession,
    departmentNames, departmentsWithAssets, filteredSchedules, topDepartments,
    simulatedGroups, setSimulatedGroups, isGroupSimulatorActive, setIsGroupSimulatorActive,
    isProcessing, setIsProcessing,
    groupingAuditorMargin, setGroupingAuditorMargin,
    assignmentMode, setAssignmentMode, openAuditThreshold, setOpenAuditThreshold
  };
};
