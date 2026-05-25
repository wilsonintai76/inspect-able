import React from 'react';
import { KPITier, KPITierTarget, InstitutionKPITarget, AuditSchedule, AuditPhase, Department, Location, User, CrossAuditPermission, AssignmentMode } from '@shared/types';
import { gateway } from '../services/dataGateway';
import { ToastType } from '../components/Toast';

interface UseSystemActionsProps {
  schedules: AuditSchedule[];
  setSchedules: React.Dispatch<React.SetStateAction<AuditSchedule[]>>;
  setAuditPhases: React.Dispatch<React.SetStateAction<AuditPhase[]>>;
  setKpiTiers: React.Dispatch<React.SetStateAction<KPITier[]>>;
  setKpiTierTargets: React.Dispatch<React.SetStateAction<KPITierTarget[]>>;
  setInstitutionKPIs: React.Dispatch<React.SetStateAction<InstitutionKPITarget[]>>;
  setDepartments: React.Dispatch<React.SetStateAction<Department[]>>;
  setLocations: React.Dispatch<React.SetStateAction<Location[]>>;
  setUsers: React.Dispatch<React.SetStateAction<User[]>>;
  setCrossAuditPermissions: React.Dispatch<React.SetStateAction<CrossAuditPermission[]>>;
  setPairingLocked: React.Dispatch<React.SetStateAction<boolean>>;
  setPairingLockInfo: React.Dispatch<React.SetStateAction<any>>;
  pairingLocked: boolean;
  pairingLockInfo: any;
  currentUser: User | null;
  maxAssetsPerDay: number;
  setMaxAssetsPerDay: React.Dispatch<React.SetStateAction<number>>;
  setMaxLocationsPerDay: React.Dispatch<React.SetStateAction<number>>;
  setMinAuditorsPerLocation: React.Dispatch<React.SetStateAction<number>>;
  setDailyInspectionCapacity: React.Dispatch<React.SetStateAction<number>>;
  setStandaloneThresholdAssets: React.Dispatch<React.SetStateAction<number>>;
  setGroupingMargin: React.Dispatch<React.SetStateAction<number>>;
  setGroupingAuditorMargin: React.Dispatch<React.SetStateAction<number>>;
  setAssignmentMode: React.Dispatch<React.SetStateAction<AssignmentMode>>;
  setOpenAuditThreshold: React.Dispatch<React.SetStateAction<number>>;
  setSimulatedGroups: React.Dispatch<React.SetStateAction<any[]>>;
  setIsGroupSimulatorActive: React.Dispatch<React.SetStateAction<boolean>>;
  setFeasibilityReport: React.Dispatch<React.SetStateAction<any>>;
  showToast: (message: string, type?: ToastType, duration?: number) => void;
  showError: (error: any, title?: string) => void;
  customConfirm: (title: string, message: string, onConfirm: () => void, isDestructive?: boolean) => void;
}

export const useSystemActions = (props: UseSystemActionsProps) => {
  const { schedules, setSchedules, setAuditPhases, setKpiTiers, setKpiTierTargets,
    setInstitutionKPIs, setDepartments, setLocations, setUsers, setCrossAuditPermissions,
    setPairingLocked, setPairingLockInfo, pairingLocked, pairingLockInfo, currentUser,
    maxAssetsPerDay, setMaxAssetsPerDay, setMaxLocationsPerDay, setMinAuditorsPerLocation,
    setDailyInspectionCapacity, setStandaloneThresholdAssets, setGroupingMargin,
    setGroupingAuditorMargin, setAssignmentMode, setOpenAuditThreshold,
    setSimulatedGroups, setIsGroupSimulatorActive, setFeasibilityReport,
    showToast, showError, customConfirm } = props;

  // ── Reset Operations ──────────────────────────────────────────────────

  const handleResetOperationalData = async () => {
    customConfirm("Reset System", "Delete EVERYTHING?", async () => {
      try { await gateway.fullSystemReset(currentUser!.id); await (props as any).loadAllData?.(); showToast('Reset complete'); }
      catch (e) { showError(e); }
    });
  };

  const handleResetDepartments = async () => {
    customConfirm("Reset Departments", "Delete ALL depts?", async () => {
      try { await gateway.clearAllDepartments(currentUser!.id); await (props as any).loadAllData?.(); }
      catch (e) { showError(e); }
    });
  };

  const handleResetLocations = async () => {
    customConfirm("Reset Locations", "Delete ALL locs?", async () => {
      try { await gateway.clearAllLocations(); await (props as any).loadAllData?.(); }
      catch (e) { showError(e); }
    });
  };

  const handleResetUsers = async () => {
    customConfirm("Reset Users", "Delete ALL users?", async () => {
      try { await gateway.clearAllUsers(currentUser!.id); await (props as any).loadAllData?.(); }
      catch (e) { showError(e); }
    });
  };

  const handleResetPhases = async () => {
    customConfirm("Reset Phases", "Delete ALL phases?", async () => {
      try { await gateway.clearAuditPhases(); await (props as any).loadAllData?.(); }
      catch (e) { showError(e); }
    });
  };

  const handleResetKPI = async () => {
    customConfirm("Reset KPI", "Delete ALL KPI?", async () => {
      try { await gateway.clearKPI(); await (props as any).loadAllData?.(); }
      catch (e) { showError(e); }
    });
  };

  // ── KPI Management ────────────────────────────────────────────────────

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

  const handleUpdateKPITierTarget = async (tierId: string, phaseId: string, percentage: number) => {
    try { const record = (props as any).kpiTierTargets?.find((k: any) => k.tierId === tierId && k.phaseId === phaseId); if (record) await gateway.updateKPITierTarget(record.id, { targetPercentage: percentage }); setKpiTierTargets(await gateway.getKPITierTargets()); }
    catch (e) { showError(e); }
  };

  const handleUpdateInstitutionKPI = async (phaseId: string, percentage: number) => {
    try { await gateway.updateInstitutionKPI(phaseId, percentage); setInstitutionKPIs(await gateway.getInstitutionKPIs()); }
    catch (e) { showError(e); }
  };

  const handleAutoCalculateTierTargets = async () => {
    try { await gateway.autoCalculateTierTargets(schedules as any); showToast('Tier targets calculated'); }
    catch (e) { showError(e); }
  };

  // ── Pairing Lock ──────────────────────────────────────────────────────

  const handleLockPairing = async (pairingCount: number) => {
    const info = { locked: true, lockedAt: new Date().toISOString(), lockedBy: currentUser?.name || 'Admin', pairingCount };
    await gateway.updateSystemSetting('pairing_lock', info); setPairingLocked(true); setPairingLockInfo(info);
  };

  const handleResetPairingData = async () => {
    try {
      await gateway.updateSystemSetting('pairing_lock', null);
      setPairingLocked(false); setPairingLockInfo(null); setSimulatedGroups([]);
      setIsGroupSimulatorActive(false); showToast('Pairing data reset');
    } catch (e) { showError(e); }
  };

  const handleUnlockPairing = async () => {
    await gateway.updateSystemSetting('pairing_lock', null);
    setPairingLocked(false); setPairingLockInfo(null);
  };

  // ── Simulation & Consolidation ────────────────────────────────────────

  const handleAutoConsolidate = async (threshold: number, excludedIds: string[], minAuditors: number, margin: number, useAI: boolean, pairingMode: string = 'asymmetric', aiConsolidation: boolean = false, minAuditorsPerGroup: number = 10, dryRun: boolean = false, auditorMargin: number = 3) => {
    try {
      const result: any = await gateway.autoConsolidateAuditGroups(threshold, excludedIds, minAuditors, margin, useAI, pairingMode, aiConsolidation, minAuditorsPerGroup, dryRun, auditorMargin);
      if (dryRun) { setSimulatedGroups(result.groups || []); setIsGroupSimulatorActive(true); }
      else { setSchedules(await gateway.getAudits()); showToast(`Consolidated into ${result.groupCount ?? '?'} groups`); }
    } catch (e) { showError(e); }
  };

  const handleCommitGroups = async (groups: any[]) => {
    try { await gateway.commitConsolidationDraft(groups); setIsGroupSimulatorActive(false); setSimulatedGroups([]); setSchedules(await gateway.getAudits()); showToast('Groups committed'); }
    catch (e) { showError(e); }
  };

  const handleCancelGroupSimulation = () => { setIsGroupSimulatorActive(false); setSimulatedGroups([]); };

  const handleRunStrategicPairing = async (payload: any) => {
    try { const result: any = await gateway.autoConsolidateAuditGroups(payload.threshold, payload.excludedIds, payload.minAuditors, payload.margin, payload.useAI, payload.pairingMode, payload.aiConsolidation, payload.minAuditorsPerGroup, true, payload.auditorMargin); setSimulatedGroups(result.groups || []); setIsGroupSimulatorActive(true); return result; }
    catch (e) { showError(e); throw e; }
  };

  const handleSaveFeasibilityReport = (report: any) => { setFeasibilityReport(report); };

  // ── Settings ──────────────────────────────────────────────────────────

  const handleUpdateAssignmentMode = async (mode: AssignmentMode) => {
    try {
      await gateway.updateSystemSetting('audit_strategy', { assignmentMode: mode, openAuditThreshold: (props as any).openAuditThreshold || 500 });
      setAssignmentMode(mode); showToast(`Mode: ${mode}`);
    } catch (e) { showError(e); }
  };

  const handleUpdateOpenAuditThreshold = async (threshold: number) => {
    try {
      await gateway.updateSystemSetting('audit_strategy', { assignmentMode: (props as any).assignmentMode || 'cross-audit', openAuditThreshold: threshold });
      setOpenAuditThreshold(threshold); showToast(`Threshold: ${threshold} assets`);
    } catch (e) { showError(e); }
  };

  return {
    handleResetOperationalData, handleResetDepartments, handleResetLocations,
    handleResetUsers, handleResetPhases, handleResetKPI,
    handleAddKPITier, handleUpdateKPITier, handleDeleteKPITier,
    handleUpdateKPITierTarget, handleUpdateInstitutionKPI, handleAutoCalculateTierTargets,
    handleLockPairing, handleResetPairingData, handleUnlockPairing,
    handleAutoConsolidate, handleCommitGroups, handleCancelGroupSimulation,
    handleRunStrategicPairing, handleSaveFeasibilityReport,
    handleUpdateAssignmentMode, handleUpdateOpenAuditThreshold,
  };
};
