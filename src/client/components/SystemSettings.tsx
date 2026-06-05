import React, { useMemo, useRef } from 'react';
import { CrossAuditPermission, Department, User, AuditPhase, KPITier, KPITierTarget, InstitutionKPITarget, UserRole, Location, AuditSchedule, DepartmentMapping, AuditGroup, AssignmentMode, LocationMapping, Building } from '@shared/types';
import { hasCapability } from '../lib/pbacUtils';

import { AuditPhasesSettings } from './AuditPhasesSettings';
import { KPISettings } from './KPISettings';
import { TierDistributionTable } from './TierDistributionTable';
import { suggestThresholds } from '../services/aiService';
import { DataManagementWorkflow } from './DataManagementWorkflow';
import { ArchivedLocationsPanel } from './ArchivedLocationsPanel';
import { Zap, Sliders, AlertCircle, Eye, Calendar, UserCheck, Users, UserPlus, Edit, ShieldAlert, ShieldCheck, Network, Lock, Unlock, RotateCcw, Building2, Trash2, Database, RefreshCcw } from 'lucide-react';
import { BackupManager } from './BackupManager';
import { AuditConstraints } from './AuditConstraints';
import { BrandingSettings } from './BrandingSettings';

interface SystemSettingsProps {
  departments: Department[];
  users: User[];
  permissions: CrossAuditPermission[];
  phases: AuditPhase[];
  kpiTiers: KPITier[];
  kpiTierTargets: KPITierTarget[];
  institutionKPIs: InstitutionKPITarget[];
  userRoles: string[];
  onAddPermission: (auditorDept: string, targetDept: string, isMutual: boolean) => Promise<void>;
  onRemovePermission: (id: string) => Promise<void>;
  onTogglePermission: (id: string, isActive: boolean) => void;
  onUpdateDepartment: (id: string, updates: Partial<Department>) => void;
  onBulkUpdateDepartments: (updates: { id: string, data: Partial<Department> }[]) => void;
  onAddPhase: (phase: Omit<AuditPhase, 'id'>) => void;
  onUpdatePhase: (id: string, updates: Partial<AuditPhase>) => void;
  onDeletePhase: (id: string) => void;
  onAddKPITier: (tier: Omit<KPITier, 'id'>) => void;
  onUpdateKPITier: (id: string, updates: Partial<KPITier>) => void;
  onDeleteKPITier: (id: string) => void;
  onUpdateKPITierTarget: (tierId: string, phaseId: string, percentage: number) => void;
  onUpdateInstitutionKPI: (phaseId: string, percentage: number) => void;
  onAutoCalculateTierTargets?: () => Promise<void>;
  onResetLocations: () => void;
  onResetOperationalData: () => void;
  onResetDepartments: () => void;
  onResetUsers: () => void;
  onResetPhases: () => void;
  onResetKPI: () => void;
  isSystemLocked: boolean;
  onBulkAddLocs: (locs: Omit<Location, 'id'>[]) => void;
  onBulkAddDepts: (depts: Omit<Department, 'id'>[]) => void;
  onBulkActivateStaff: (entries: { name: string; email: string; department?: string; designation?: string; role?: string }[]) => void;
  maxAssetsPerDay?: number;
  onUpdateMaxAssetsPerDay?: (val: number) => void;
  maxLocationsPerDay?: number;
  onUpdateMaxLocationsPerDay?: (val: number) => void;
  minAuditorsPerLocation?: number;
  onUpdateMinAuditorsPerLocation?: (val: number) => void;
  dailyInspectionCapacity?: number;
  onUpdateDailyInspectionCapacity?: (val: number) => void;
  standaloneThresholdAssets: number;
  onUpdateStandaloneThresholdAssets: (val: number) => void;
  groupingMargin: number;
  onUpdateGroupingMargin: (val: number) => void;
  groupingAuditorMargin: number;
  onUpdateGroupingAuditorMargin: (val: number) => void;
  schedules: AuditSchedule[];
  departmentMappings: DepartmentMapping[];
  onAddDepartmentMapping: (mapping: Omit<DepartmentMapping, 'id'>) => Promise<void>;
  onDeleteDepartmentMapping: (id: string) => Promise<void>;
  onSyncLocationMappings: () => Promise<void>;
  onSetDeptTotalsFromMapping: (totals: Record<string, number>) => Promise<void>;
  onUpdateUninspectedAssets: (updates: { id: string, uninspectedCount: number }[], deptExtras?: Record<string, number>) => Promise<void>;
  locations: Location[];
  buildings: Building[];
  locationMappings: LocationMapping[];
  onAddLocationMapping: (mapping: Omit<LocationMapping, 'id'>) => Promise<void>;
  onDeleteLocationMapping: (id: string) => Promise<void>;
  onSyncLocationNotes: () => Promise<void>;
  auditGroups: AuditGroup[];
  onAddAuditGroup: (group: Omit<AuditGroup, 'id'>) => Promise<void>;
  onUpdateAuditGroup: (id: string, updates: Partial<AuditGroup>) => Promise<void>;
  onDeleteAuditGroup: (id: string) => Promise<void>;
  onBulkDeleteAuditGroups?: (ids: string[]) => Promise<void>;
  onAutoConsolidate: (threshold: number, excludedIds: string[], minAuditors: number, margin: number, useAI: boolean, pairingMode: string, aiConsolidation: boolean, minAuditorsPerGroup: number, dryRun: boolean, auditorMargin: number) => Promise<void>;
  onRunStrategicPairing: (payload: any) => Promise<any>;
  onSaveFeasibilityReport: (report: any) => void;
  feasibilityReport: any;
  onBulkAddPermissions: (auditorDept: string, targetDept: string, isMutual: boolean) => Promise<void>;
  onBulkRemovePermissions: (ids: string[]) => Promise<void>;
  pairingLocked?: boolean;
  pairingLockInfo?: { lockedAt: string; lockedBy: string; pairingCount: number; cycleYear: number } | null;
  onLockPairing?: (pairingCount: number) => Promise<void>;
  onUnlockPairing?: () => Promise<void>;
  showToast?: (message: string, type?: any) => void;
  currentUser?: User | null;
  // Simulation props
  isGroupSimulatorActive?: boolean;
  simulatedGroups?: any[];
  onCommitGroups?: (groups: any[]) => Promise<void>;
  onCancelGroupSimulation?: () => void;
  onUpdateSimulatedGroups?: (groups: any[]) => void;
  assignmentMode: AssignmentMode;
  onUpdateAssignmentMode: (mode: AssignmentMode) => void;
  openAuditThreshold: number;
  onUpdateOpenAuditThreshold: (val: number) => void;
  onUpsertLocations?: (locs: Location[]) => Promise<void>;
  onMergeLocations?: (sourceIds: string[], targetId: string) => Promise<void>;
  onResetOnlyPermissions?: () => void;
  // Archived locations management
  onRestoreLocation?: (id: string) => Promise<void>;
  onPurgeLocation?: (id: string) => Promise<void>;
}

export const SystemSettings: React.FC<SystemSettingsProps> = ({
  departments,
  users,
  permissions,
  phases,
  kpiTiers,
  userRoles,
  onAddPermission,
  onRemovePermission,
  onTogglePermission,
  onUpdateDepartment,
  onBulkUpdateDepartments,
  onAddPhase,
  onUpdatePhase,
  onDeletePhase,
  onAddKPITier,
  onUpdateKPITier,
  onDeleteKPITier,
  onUpdateKPITierTarget,
  onResetLocations,
  onResetOperationalData,
  onResetDepartments,
  onResetUsers,
  onResetPhases,
  onResetKPI,
  isSystemLocked,
  onBulkAddLocs,
  onBulkAddDepts,
  onBulkActivateStaff,
  maxAssetsPerDay,
  onUpdateMaxAssetsPerDay,
  maxLocationsPerDay,
  onUpdateMaxLocationsPerDay,
  minAuditorsPerLocation,
  onUpdateMinAuditorsPerLocation,
  dailyInspectionCapacity,
  onUpdateDailyInspectionCapacity,
  standaloneThresholdAssets,
  onUpdateStandaloneThresholdAssets,
  groupingMargin,
  onUpdateGroupingMargin,
  groupingAuditorMargin,
  onUpdateGroupingAuditorMargin,
  schedules,
  departmentMappings,
  onAddDepartmentMapping,
  onDeleteDepartmentMapping,
  onSyncLocationMappings,
  onUpsertLocations,
  onSetDeptTotalsFromMapping,
  onUpdateUninspectedAssets,
  auditGroups,
  onAddAuditGroup,
  onUpdateAuditGroup,
  onDeleteAuditGroup,
  onBulkDeleteAuditGroups,
  onAutoConsolidate,
  onBulkAddPermissions,
  onBulkRemovePermissions,
  onRunStrategicPairing,
  onSaveFeasibilityReport,
  feasibilityReport,
  pairingLocked,
  pairingLockInfo,
  onLockPairing,
  kpiTierTargets,
  institutionKPIs,
  onUpdateInstitutionKPI,
  onAutoCalculateTierTargets,
  showToast,
  locations,
  buildings,
  locationMappings,
  onAddLocationMapping,
  onDeleteLocationMapping,
  onSyncLocationNotes,
  onMergeLocations,
  onRestoreLocation,
  onPurgeLocation,
  onUnlockPairing,
  currentUser,
  isGroupSimulatorActive,
  simulatedGroups,
  onCommitGroups,
  onCancelGroupSimulation,
  onUpdateSimulatedGroups,
  assignmentMode,
  onUpdateAssignmentMode,
  openAuditThreshold,
  onUpdateOpenAuditThreshold
}) => {
  // ── PBAC capability checks ───────────────────────────────────────────
  const pbacUser = currentUser ? { roles: currentUser.roles, certificationExpiry: currentUser.certificationExpiry } : { roles: userRoles, certificationExpiry: null as string | null };
  const isAdmin = hasCapability(pbacUser, 'system:admin');
  const isCoordinator = hasCapability(pbacUser, 'manage:departments') && !isAdmin;
  const [isProcessing, setIsProcessing] = React.useState(false);
  const [isSuggestingAI, setIsSuggestingAI] = React.useState(false);
  const [strictAuditorRule, setStrictAuditorRule] = React.useState(true);

  // GLOBAL SIMULATOR STATE (Lumped)
  const [isSimulatorActive, setIsSimulatorActive] = React.useState<boolean>(() => {
    return localStorage.getItem('cross_audit_simulator_active') === 'true';
  });
  const [draftConstraints, setDraftConstraints] = React.useState<{
    maxAssetsPerDay: number;
    maxLocationsPerDay: number;
    minAuditorsPerLocation: number;
    dailyInspectionCapacity: number;
    standaloneThresholdAssets: number;
    pairingAssetMargin: number;
    pairingAuditorMargin: number;
  } | null>(null);

  const currentMaxAssets = draftConstraints?.maxAssetsPerDay ?? maxAssetsPerDay;
  const currentMaxLocations = draftConstraints?.maxLocationsPerDay ?? maxLocationsPerDay;
  const currentMinAuditors = draftConstraints?.minAuditorsPerLocation ?? (strictAuditorRule ? 2 : minAuditorsPerLocation);
  const currentDailyCapacity = draftConstraints?.dailyInspectionCapacity ?? dailyInspectionCapacity;
  const currentStandaloneThreshold = draftConstraints?.standaloneThresholdAssets ?? standaloneThresholdAssets;

  // Actual Resource Calculations
  const activeAuditorCount = React.useMemo(() => {
    const today = new Date().toISOString().split('T')[0];
    return users.filter(u => u.status === 'Active' && u.certificationExpiry && u.certificationExpiry >= today).length;
  }, [users]);

  const totalInstitutionalAssets = React.useMemo(() => {
    return departments.reduce((sum, d) => sum + (d.totalAssets || 0), 0);
  }, [departments]);

  const handleUpdateDraftConstraints = (updates: Partial<typeof draftConstraints>) => {
    if (!isSimulatorActive) {
      if (updates.maxAssetsPerDay !== undefined) onUpdateMaxAssetsPerDay(updates.maxAssetsPerDay);
      if (updates.maxLocationsPerDay !== undefined) onUpdateMaxLocationsPerDay(updates.maxLocationsPerDay);
      if (updates.minAuditorsPerLocation !== undefined) onUpdateMinAuditorsPerLocation(updates.minAuditorsPerLocation);
      if (updates.dailyInspectionCapacity !== undefined) onUpdateDailyInspectionCapacity(updates.dailyInspectionCapacity);
      if (updates.standaloneThresholdAssets !== undefined) onUpdateStandaloneThresholdAssets(updates.standaloneThresholdAssets);
      if (updates.pairingAuditorMargin !== undefined) (onUpdateGroupingAuditorMargin as any)(updates.pairingAuditorMargin);
    } else {
      setDraftConstraints(prev => {
        const base = prev || { maxAssetsPerDay, maxLocationsPerDay, minAuditorsPerLocation, dailyInspectionCapacity, standaloneThresholdAssets, pairingAssetMargin: 500, pairingAuditorMargin: 3 };
        return { ...base, ...updates } as any;
      });
    }
  };

  const handleAIAutoOptimize = async () => {
    setIsSuggestingAI(true);
    try {
      // 1. Get AI suggested base threshold for grouping
      const result = await suggestThresholds(departments);
      
      // 2. Resource-based Capacity Math
      const teamCount = Math.floor(activeAuditorCount / 2); // Policy 2 minimum
      const WORK_DAYS_PER_MONTH = 20; 
      
      let optimizedCapacity = dailyInspectionCapacity;
      if (teamCount > 0 && totalInstitutionalAssets > 0) {
        // Ideal capacity per team to finish in 1 month (20 working days)
        optimizedCapacity = Math.ceil(totalInstitutionalAssets / (teamCount * WORK_DAYS_PER_MONTH));
        // Clamp to reasonable ranges (e.g., 50 to 1000)
        optimizedCapacity = Math.max(50, Math.min(1000, optimizedCapacity));
      }

      // 3. Apply to State
      handleUpdateDraftConstraints({ 
        standaloneThresholdAssets: result.assetThreshold || 1500,
        dailyInspectionCapacity: optimizedCapacity,
        minAuditorsPerLocation: 2, 
      });

      if (showToast) showToast('Strategy Optimized: Standalone BBI set to ' + (result.assetThreshold || 1500), 'success');
    } catch (err) {
      console.error('AI Auto-Optimize failed:', err);
      if (showToast) showToast('AI optimization encountered an error.', 'error');
    } finally {
      setIsSuggestingAI(false);
    }
  };

  const activePhase = React.useMemo(() => {
    const today = new Date();
    return phases.find(p => {
      const start = new Date(p.startDate);
      const end = new Date(p.endDate);
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
      return today >= start && today <= end;
    });
  }, [phases]);

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-500 pb-20 pt-6">

      {isAdmin && (
        <DataManagementWorkflow
          departments={departments}
          departmentMappings={departmentMappings}
          locationMappings={locationMappings}
          locations={locations}
          onBulkAddDepts={onBulkAddDepts}
          onBulkActivateStaff={onBulkActivateStaff}
          onAddDepartmentMapping={onAddDepartmentMapping}
          onDeleteDepartmentMapping={onDeleteDepartmentMapping}
          onAddLocationMapping={onAddLocationMapping}
          onDeleteLocationMapping={onDeleteLocationMapping}
          onSyncLocationMappings={onSyncLocationMappings}
          onUpsertLocations={onUpsertLocations}
          onSetDeptTotalsFromMapping={onSetDeptTotalsFromMapping}
          onUpdateUninspectedAssets={onUpdateUninspectedAssets}
        />
      )}

      {/* GLOBAL ASSIGNMENT STRATEGY */}
      {isAdmin && (
        <div className="bg-white rounded-[32px] border border-slate-200 shadow-sm overflow-hidden p-8">
          <div className="flex items-center gap-4 mb-6">
            <div className="w-12 h-12 bg-indigo-50 rounded-2xl flex items-center justify-center">
              <Network className="w-6 h-6 text-indigo-600" />
            </div>
            <div>
              <h3 className="text-xl font-black text-slate-900 tracking-tight">Global Assignment Strategy</h3>
              <p className="text-sm text-slate-500 font-medium">Define how inspecting officers are assigned to locations.</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="space-y-4">
              <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest pl-1">Operational Mode</label>
              <div className="flex items-center gap-3 p-4 bg-emerald-50/50 rounded-2xl border border-emerald-100/80">
                <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-xs font-black uppercase tracking-wider text-emerald-700">Open Audit (Any Officer)</span>
                <span className="text-[9px] font-bold bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-md uppercase ml-auto">Active</span>
              </div>
              <p className="text-[10px] text-slate-400 font-semibold px-2 italic">
                Decentralized: Any certified officer can assign themselves to any location except their own.
              </p>
            </div>

            <div className="space-y-4">
              <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest pl-1">Assets per Officer Threshold</label>
              <div className="relative group">
                <div className="absolute left-4 top-1/2 -translate-y-1/2 w-8 h-8 rounded-xl bg-slate-50 flex items-center justify-center border border-slate-100 group-focus-within:border-indigo-200 transition-colors">
                  <span className="text-xs font-bold text-slate-400">#</span>
                </div>
                <input
                  type="number"
                  value={openAuditThreshold}
                  onChange={(e) => onUpdateOpenAuditThreshold(parseInt(e.target.value) || 0)}
                  className="w-full bg-white border-2 border-slate-100 rounded-2xl py-3 pl-14 pr-4 text-sm font-bold text-slate-900 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 transition-all outline-hidden"
                  placeholder="e.g. 500"
                />
              </div>
              <p className="text-[10px] text-slate-400 font-medium px-2">
                Targets {openAuditThreshold.toLocaleString()} assets per officer. Used to calculate "Recommended Inspector Coverage".
              </p>
            </div>
          </div>
        </div>
      )}


      <div className="relative">
        <AuditPhasesSettings
          phases={phases}
          isAdmin={isAdmin}
          onAdd={onAddPhase}
          onUpdate={onUpdatePhase}
          onDelete={onDeletePhase}
        />
        {isAdmin && (
          <div className="flex justify-end mt-2 pr-2">
            <button
              onClick={onResetPhases}
              disabled={isSystemLocked}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                isSystemLocked
                  ? 'text-slate-300 cursor-not-allowed'
                  : 'text-red-400 hover:text-red-600 hover:bg-red-50'
              }`}
            >
              <RotateCcw className="w-3 h-3" />
              Reset Phases
            </button>
          </div>
        )}
      </div>

      <div className="relative">
        <KPISettings
          tiers={kpiTiers}
          phases={phases}
          tierTargets={kpiTierTargets}
          institutionKPIs={institutionKPIs}
          departments={departments}
          onAddTier={onAddKPITier}
          onUpdateTier={onUpdateKPITier}
          onDeleteTier={onDeleteKPITier}
          onUpdateTarget={onUpdateKPITierTarget}
          onUpdateInstitutionKPI={onUpdateInstitutionKPI}
          onAutoCalculateTierTargets={onAutoCalculateTierTargets}
          onUpdateFeasibility={onRunStrategicPairing}
          onSaveFeasibilityReport={onSaveFeasibilityReport}
          feasibilityReport={feasibilityReport}
          showToast={showToast}
        />
        {isAdmin && (
          <div className="flex justify-end mt-2 pr-2">
            <button
              onClick={onResetKPI}
              disabled={isSystemLocked}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                isSystemLocked
                  ? 'text-slate-300 cursor-not-allowed'
                  : 'text-red-400 hover:text-red-600 hover:bg-red-50'
              }`}
            >
              <RotateCcw className="w-3 h-3" />
              Reset KPI Tiers
            </button>
          </div>
        )}
      </div>

      {(phases?.length > 0 && kpiTiers?.length > 0) && (
        <div className="space-y-8">
          <TierDistributionTable
            departments={departments}
            kpiTiers={kpiTiers}
            kpiTierTargets={kpiTierTargets}
            phases={phases}
            schedules={schedules}
            locations={locations}
            openAuditThreshold={openAuditThreshold}
            users={users}
            buildings={buildings}
          />
        </div>
      )}


      {isAdmin && (
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden mb-8">
          <div className="p-8 border-b border-slate-100 bg-slate-50/50">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-indigo-600/20">
                <Database className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-xl font-black text-slate-900 tracking-tight">Data Maintenance</h3>
                <p className="text-slate-500 text-xs font-semibold">Utilities to keep existing location data in sync with Smart Sync standards</p>
              </div>
            </div>
          </div>
          
          <div className="p-8">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="group rounded-2xl border border-slate-200 p-6 hover:border-indigo-600/30 hover:bg-slate-50/50 transition-all">
                <div className="flex items-center gap-4 mb-4">
                  <div className="w-10 h-10 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                    <RefreshCcw className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-slate-900">Sync Names to Site Notes</h4>
                    <p className="text-[10px] text-slate-500">Copies existing room names to "Original Name" field in notes</p>
                  </div>
                </div>
                <button
                  onClick={onSyncLocationNotes}
                  className="w-full py-2.5 bg-white border-2 border-slate-200 text-slate-900 rounded-xl text-xs font-black uppercase tracking-widest hover:border-indigo-600 hover:text-indigo-600 transition-all shadow-sm"
                >
                  Sync All Existing Names
                </button>
              </div>

              <div className="group rounded-2xl border border-slate-200 p-6 hover:border-emerald-600/30 hover:bg-slate-50/50 transition-all">
                <div className="flex items-center gap-4 mb-4">
                  <div className="w-10 h-10 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center group-hover:bg-emerald-600 group-hover:text-white transition-colors">
                    <Network className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-slate-900">Merge Duplicate Locations</h4>
                    <p className="text-[10px] text-slate-500">Combine separate locations into one with summed asset totals</p>
                  </div>
                </div>
                
                <div className="space-y-3">
                  <div className="space-y-1">
                    <label htmlFor="merge-sources" className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Source(s) (ToDelete)</label>
                    <select 
                      multiple
                      className="w-full p-2 bg-white border border-slate-200 rounded-lg text-[11px] font-medium h-24 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                      id="merge-sources"
                    >
                      {locations.sort((a,b) => a.name.localeCompare(b.name)).map(l => (
                        <option key={l.id} value={l.id}>{l.name} ({l.totalAssets} assets)</option>
                      ))}
                    </select>
                  </div>
                  
                  <div className="space-y-1">
                    <label htmlFor="merge-target" className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Target (ToKeep)</label>
                    <select 
                      className="w-full p-2 bg-white border border-slate-200 rounded-lg text-[11px] font-medium focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                      id="merge-target"
                    >
                      <option value="">Select Target...</option>
                      {locations.sort((a,b) => a.name.localeCompare(b.name)).map(l => (
                        <option key={l.id} value={l.id}>{l.name} ({l.totalAssets} assets)</option>
                      ))}
                    </select>
                  </div>

                  <button
                    onClick={async () => {
                      const sourceSelect = document.getElementById('merge-sources') as any;
                      const targetSelect = document.getElementById('merge-target') as any;
                      const sourceIds = Array.from(sourceSelect.selectedOptions || []).map((o: any) => o.value);
                      const targetId = targetSelect.value;
                      
                      if (sourceIds.length === 0 || !targetId) {
                        alert('Please select at least one source and a target');
                        return;
                      }
                      if (sourceIds.includes(targetId)) {
                        alert('Target cannot be one of the sources');
                        return;
                      }

                      if (window.confirm(`Merge ${sourceIds.length} location(s) into target? Original source(s) will be deleted, and all assets/schedules will move to the target.`)) {
                        await onMergeLocations?.(sourceIds, targetId);
                        sourceSelect.selectedIndex = -1;
                        targetSelect.value = "";
                      }
                    }}
                    className="w-full py-2.5 bg-emerald-600 text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-emerald-700 transition-all shadow-md shadow-emerald-600/20"
                  >
                    Merge & Cleanup Now
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── Archived Locations ─── */}
      {isAdmin && (
        <ArchivedLocationsPanel
          locations={locations}
          departments={departments}
          onRestore={onRestoreLocation || (async () => {})}
          onPurge={onPurgeLocation || (async () => {})}
          showToast={showToast}
        />
      )}

      {isAdmin && <BrandingSettings showToast={showToast} />}

      {isAdmin && <BackupManager />}

      {isAdmin && (
        <div className={`rounded-[32px] p-8 border-2 transition-all duration-500 ${
          isSystemLocked 
          ? 'bg-slate-50 border-slate-200 opacity-80' 
          : 'bg-red-50 border-red-100'
        }`}>
          <div className="flex items-center justify-between mb-2">
            <div>
              <h3 className={`text-xl font-bold ${isSystemLocked ? 'text-slate-900' : 'text-red-900'}`}>Danger Zone</h3>
              <p className={`text-sm ${isSystemLocked ? 'text-slate-500' : 'text-red-700'}`}>Irreversible actions for system administration and data cleanup.</p>
            </div>
            <div className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest ${
              isSystemLocked ? 'bg-slate-200 text-slate-600' : 'bg-emerald-100 text-emerald-700'
            }`}>
              {isSystemLocked ? (
                <>
                  <Lock className="w-3 h-3" />
                  System Locked
                </>
              ) : (
                <>
                  <Unlock className="w-3 h-3" />
                  Reset Allowed
                </>
              )}
            </div>
          </div>

          {isSystemLocked && (
            <div className="bg-white/60 border border-slate-200 rounded-2xl p-4 mb-6 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-slate-400 mt-0.5" />
              <p className="text-xs font-medium text-slate-600 leading-relaxed">
                Reset features are disabled because some audit schedules are already active (Supervisor has set a date and an Inspector has assigned themselves). Please unassign the audits if you truly need to reset.
              </p>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-6">
            {/* Reset Departments */}
            <div className={`rounded-2xl border p-4 transition-all ${
              isSystemLocked ? 'border-slate-100 bg-slate-50' : 'border-red-100 bg-white hover:border-red-200'
            }`}>
              <div className="flex items-center gap-3 mb-2">
                <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${
                  isSystemLocked ? 'bg-slate-100 text-slate-300' : 'bg-red-50 text-red-500'
                }`}>
                  <Building2 className="w-4 h-4" />
                </div>
                <div>
                  <h4 className={`text-sm font-bold ${isSystemLocked ? 'text-slate-400' : 'text-slate-900'}`}>Reset Departments</h4>
                  <p className={`text-[10px] ${isSystemLocked ? 'text-slate-300' : 'text-slate-400'}`}>Clears depts, locs, mappings, schedules & groups (Users kept)</p>
                </div>
              </div>
              <button
                onClick={onResetDepartments}
                disabled={isSystemLocked}
                className={`w-full mt-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 ${
                  isSystemLocked
                    ? 'bg-slate-100 text-slate-300 cursor-not-allowed'
                    : 'bg-white border border-red-200 text-red-600 hover:bg-red-600 hover:text-white'
                }`}
              >
                <Trash2 className="w-3.5 h-3.5" />
                Clear Departments
              </button>
            </div>

            {/* Reset Users */}
            <div className={`rounded-2xl border p-4 transition-all ${
              isSystemLocked ? 'border-slate-100 bg-slate-50' : 'border-red-100 bg-white hover:border-red-200'
            }`}>
              <div className="flex items-center gap-3 mb-2">
                <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${
                  isSystemLocked ? 'bg-slate-100 text-slate-300' : 'bg-red-50 text-red-500'
                }`}>
                  <Users className="w-4 h-4" />
                </div>
                <div>
                  <h4 className={`text-sm font-bold ${isSystemLocked ? 'text-slate-400' : 'text-slate-900'}`}>Reset Users</h4>
                  <p className={`text-[10px] ${isSystemLocked ? 'text-slate-300' : 'text-slate-400'}`}>Removes all users except you</p>
                </div>
              </div>
              <button
                onClick={onResetUsers}
                disabled={isSystemLocked}
                className={`w-full mt-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 ${
                  isSystemLocked
                    ? 'bg-slate-100 text-slate-300 cursor-not-allowed'
                    : 'bg-white border border-red-200 text-red-600 hover:bg-red-600 hover:text-white'
                }`}
              >
                <Trash2 className="w-3.5 h-3.5" />
                Clear Users
              </button>
            </div>

            {/* Reset Locations & Audits */}
            <div className={`rounded-2xl border p-4 transition-all ${
              isSystemLocked ? 'border-slate-100 bg-slate-50' : 'border-red-100 bg-white hover:border-red-200'
            }`}>
              <div className="flex items-center gap-3 mb-2">
                <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${
                  isSystemLocked ? 'bg-slate-100 text-slate-300' : 'bg-red-50 text-red-500'
                }`}>
                  <RotateCcw className="w-4 h-4" />
                </div>
                <div>
                  <h4 className={`text-sm font-bold ${isSystemLocked ? 'text-slate-400' : 'text-slate-900'}`}>Reset Locations & Audits</h4>
                  <p className={`text-[10px] ${isSystemLocked ? 'text-slate-300' : 'text-slate-400'}`}>Clears locs & groups (Depts stay with 0 assets)</p>
                </div>
              </div>
              <button
                onClick={onResetLocations}
                disabled={isSystemLocked}
                className={`w-full mt-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 ${
                  isSystemLocked
                    ? 'bg-slate-100 text-slate-300 cursor-not-allowed'
                    : 'bg-white border border-red-200 text-red-600 hover:bg-red-600 hover:text-white'
                }`}
              >
                <Trash2 className="w-3.5 h-3.5" />
                Clear Locations
              </button>
            </div>


            {/* Full System Reset */}
            <div className={`rounded-2xl border p-4 transition-all ${
              isSystemLocked ? 'border-slate-100 bg-slate-50' : 'border-red-200 bg-red-50/50 hover:border-red-300'
            }`}>
              <div className="flex items-center gap-3 mb-2">
                <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${
                  isSystemLocked ? 'bg-slate-100 text-slate-300' : 'bg-red-100 text-red-600'
                }`}>
                  <AlertCircle className="w-4 h-4" />
                </div>
                <div>
                  <h4 className={`text-sm font-bold ${isSystemLocked ? 'text-slate-400' : 'text-red-900'}`}>Full System Reset</h4>
                  <p className={`text-[10px] ${isSystemLocked ? 'text-slate-300' : 'text-red-400'}`}>Wipes everything &amp; restarts clean</p>
                </div>
              </div>
              <button
                onClick={onResetOperationalData}
                disabled={isSystemLocked}
                className={`w-full mt-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 ${
                  isSystemLocked
                    ? 'bg-slate-200 text-slate-300 cursor-not-allowed shadow-none'
                    : 'bg-red-600 text-white shadow-lg shadow-red-500/20 hover:bg-red-700'
                }`}
              >
                <Trash2 className="w-3.5 h-3.5" />
                Reset Everything
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
