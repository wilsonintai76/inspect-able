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

  showToast: (message: string, type?: ToastType, duration?: number) => void;
  showError: (error: any, title?: string) => void;
  customConfirm: (title: string, message: string, onConfirm: () => void, isDestructive?: boolean) => void;
}

export const useSystemActions = (props: UseSystemActionsProps) => {
  const { schedules, setSchedules, setAuditPhases, setKpiTiers, setKpiTierTargets,
    setInstitutionKPIs, setDepartments, setLocations, setUsers,
    currentUser,
    maxAssetsPerDay, setMaxAssetsPerDay, setMaxLocationsPerDay, setMinAuditorsPerLocation,
    setDailyInspectionCapacity, setStandaloneThresholdAssets, setGroupingMargin,
    setGroupingAuditorMargin, setAssignmentMode, setOpenAuditThreshold,
    showToast, showError, customConfirm } = props;



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

    handleAddKPITier, handleUpdateKPITier, handleDeleteKPITier,
    handleUpdateKPITierTarget, handleUpdateInstitutionKPI, handleAutoCalculateTierTargets,
    handleUpdateAssignmentMode, handleUpdateOpenAuditThreshold,
  };
};
