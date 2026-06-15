import React, { useMemo, useRef } from 'react';
import { CrossAuditPermission, Department, User, AuditPhase, KPITier, KPITierTarget, InstitutionKPITarget, UserRole, Location, AuditSchedule, DepartmentMapping, AuditGroup, AssignmentMode, LocationMapping, Building } from '@shared/types';
import { hasCapability } from '../lib/pbacUtils';

import { AuditPhasesSettings } from './AuditPhasesSettings';
import { KPISettings } from './KPISettings';

import { suggestThresholds } from '../services/aiService';

import { ArchivedLocationsPanel } from './ArchivedLocationsPanel';
import { Zap, Sliders, AlertCircle, Eye, Calendar, UserCheck, Users, UserPlus, Edit, ShieldAlert, ShieldCheck, Network, Lock, Unlock, RotateCcw, Building2, Trash2, Database, RefreshCcw } from 'lucide-react';
import { BackupManager } from './BackupManager';
import { AuditConstraints } from './AuditConstraints';
import { BrandingSettings } from './BrandingSettings';

interface SystemSettingsProps {
  departments: Department[];
  users: User[];
  phases: AuditPhase[];
  kpiTiers: KPITier[];
  kpiTierTargets: KPITierTarget[];
  institutionKPIs: InstitutionKPITarget[];
  userRoles: string[];
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

  locations: Location[];
  buildings: Building[];

  showToast?: (message: string, type?: any) => void;
  currentUser?: User | null;
  assignmentMode: AssignmentMode;
  onUpdateAssignmentMode: (mode: AssignmentMode) => void;
  openAuditThreshold: number;
  onUpdateOpenAuditThreshold: (val: number) => void;

  // Archived locations management
  onRestoreLocation?: (id: string) => Promise<void>;
  onPurgeLocation?: (id: string) => Promise<void>;

}

export const SystemSettings: React.FC<SystemSettingsProps> = ({
  departments,
  users,
  phases,
  kpiTiers,
  userRoles,
  onUpdateDepartment,
  onBulkUpdateDepartments,
  onAddPhase,
  onUpdatePhase,
  onDeletePhase,
  onAddKPITier,
  onUpdateKPITier,
  onDeleteKPITier,
  onUpdateKPITierTarget,

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

  kpiTierTargets,
  institutionKPIs,
  onUpdateInstitutionKPI,
  onAutoCalculateTierTargets,
  showToast,
  locations,
  buildings,

  onRestoreLocation,
  onPurgeLocation,
  currentUser,
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
                Decentralized: Any Qualified Asset Inspector can assign themselves to any location except their own.
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
          showToast={showToast}
        />

      </div>






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


    </div>
  );
};
