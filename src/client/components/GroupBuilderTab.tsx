import React, { useState, useMemo, useEffect } from 'react';
import { Department, AuditGroup } from '@shared/types';
import { Boxes, Loader2, Sparkles, Trash2, Users, RotateCcw, Lock, AlertTriangle, Zap, ShieldCheck, Wand2, CheckCheck, X } from 'lucide-react';
import { PrintButton } from './PrintButton';
import { printUnitConsolidation } from '../lib/printUtils';

interface GroupBuilderTabProps {
  departments: (Department & { locationCount?: number, auditorCount?: number })[];
  auditGroups: AuditGroup[];
  onAutoConsolidate?: (threshold: number, excludedIds: string[], minAuditors: number, margin: number, useAI: boolean, pairingMode: string, aiConsolidation: boolean, minAuditorsPerGroup: number, dryRun: boolean, auditorMargin: number) => Promise<any>;
  onAddAuditGroup?: (group: Omit<AuditGroup, 'id'>) => Promise<AuditGroup | null>;
  onDeleteAuditGroup?: (id: string) => Promise<void>;
  onBulkDeleteAuditGroups?: (ids: string[]) => Promise<void>;
  onBulkUpdateDepartments: (updates: { id: string, data: Partial<Department> }[]) => void;
  isProcessing: boolean;
  setIsProcessing: (processing: boolean) => void;
  strictAuditorRule: boolean;
  setStrictAuditorRule: (val: boolean) => void;
  maxAssetsPerDay: number;
  standaloneThresholdAssets: number;
  maxLocationsPerDay?: number;
  minAuditorsPerLocation?: number;
  isSystemLocked?: boolean;
  isGroupSimulatorActive?: boolean;
  simulatedGroups?: any[];
  onCommitGroups?: (groups: any[]) => Promise<void>;
  onCancelGroupSimulation?: () => void;
  onUpdateSimulatedGroups?: (groups: any[]) => void;
  groupingMargin?: number;
  onUpdateStandaloneThresholdAssets: (val: number) => void;
  onUpdateGroupingMargin: (val: number) => void;
  groupingAuditorMargin?: number;
  onUpdateGroupingAuditorMargin?: (val: number) => void;
  pairingLocked?: boolean;
}

export const GroupBuilderTab: React.FC<GroupBuilderTabProps> = ({
  departments,
  auditGroups,
  onAutoConsolidate,
  onDeleteAuditGroup,
  onBulkDeleteAuditGroups,
  onBulkUpdateDepartments,
  isProcessing,
  setIsProcessing,
  strictAuditorRule,
  setStrictAuditorRule,
  standaloneThresholdAssets,
  minAuditorsPerLocation = 2,
  isSystemLocked = false,
  pairingLocked = false,
  isGroupSimulatorActive = false,
  simulatedGroups = [],
  onCommitGroups,
  onCancelGroupSimulation,
  onUpdateSimulatedGroups,
  onUpdateGroupingMargin,
  groupingMargin = 0.15,
  onUpdateStandaloneThresholdAssets,
  groupingAuditorMargin = 3,
  onUpdateGroupingAuditorMargin,
}) => {
  const [useAI, setUseAI] = useState<boolean>(() => localStorage.getItem('group_builder_use_ai') === 'true');
  const [pairingCompatibility, setPairingCompatibility] = useState<'asymmetric' | 'strict_mutual' | 'hybrid'>(() => (localStorage.getItem('group_builder_pairing_mode') as any) || 'strict_mutual');
  const [aiConsolidation, setAiConsolidation] = useState<boolean>(() => localStorage.getItem('group_builder_ai_balancing') === 'true');
  const [minAuditorsPerGroup, setMinAuditorsPerGroup] = useState<number>(() => parseInt(localStorage.getItem('group_builder_min_auditors_group') || '8'));
  const [recommendations, setRecommendations] = useState<{ deptId: string; reason: string; action: string }[]>([]);

  const groupsInitialized = auditGroups.length > 0;

  const { initLocked, initLockReason } = useMemo(() => {
    // If we're actively simulating/grouping in draft mode, we allow tweaking margins
    // to support "what-if" analysis even if the official setup is locked.
    if (isGroupSimulatorActive) {
      return { initLocked: false, initLockReason: '' };
    }

    if (pairingLocked) {
      return { initLocked: true, initLockReason: 'Audit pairing has been committed and is locked. Reset the configuration first.' };
    }
    if (isSystemLocked) {
      return { initLocked: true, initLockReason: 'System is locked due to active audit assignments.' };
    }
    return { initLocked: false, initLockReason: '' };
  }, [pairingLocked, isSystemLocked, isGroupSimulatorActive]);

  const handleRunAutoConsolidate = async () => {
    if (!onAutoConsolidate) return;
    setIsProcessing(true);
    setRecommendations([]);
    localStorage.setItem('group_builder_pairing_mode', pairingCompatibility);
    try {
      const threshold = standaloneThresholdAssets;
      const minAuditors = minAuditorsPerLocation;
      localStorage.setItem('group_builder_ai_balancing', aiConsolidation ? 'true' : 'false');
      localStorage.setItem('group_builder_min_auditors_group', minAuditorsPerGroup.toString());
      localStorage.setItem('group_builder_asset_threshold', standaloneThresholdAssets.toString());
      
      const res = await onAutoConsolidate(threshold, [], minAuditors, groupingMargin, useAI, pairingCompatibility, aiConsolidation, minAuditorsPerGroup, true, groupingAuditorMargin);
      if (res?.recommendations) {
        setRecommendations(res.recommendations);
      }
    } finally {
      setIsProcessing(false);
    }
  };

  const handleResetAllGroups = async () => {
    if (auditGroups.length === 0) return;
    if (!confirm('Reset all audit groups? This will unassign all departments.')) return;

    setIsProcessing(true);
    try {
      const deptsWithGroup = departments.filter(d => d.auditGroupId);
      if (deptsWithGroup.length > 0) {
        const updates = deptsWithGroup.map(d => ({
          id: d.id,
          data: { auditGroupId: null }
        }));
        await onBulkUpdateDepartments(updates);
      }

      if (onBulkDeleteAuditGroups && auditGroups.length > 0) {
        await onBulkDeleteAuditGroups(auditGroups.map(g => g.id));
      } else if (onDeleteAuditGroup && auditGroups.length > 0) {
        for (const group of auditGroups) {
          await onDeleteAuditGroup(group.id);
        }
      }
    } catch (e) {
      console.error('Reset all groups failed:', e);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleMoveDepartment = (deptId: string, sourceGroupId: string, targetGroupId: string) => {
    if (sourceGroupId === targetGroupId) return;

    if (isGroupSimulatorActive && simulatedGroups && onUpdateSimulatedGroups) {
      const newSimGroups = simulatedGroups.map(g => {
        let newDepts = [...(g.departments || [])];
        if (g.id === sourceGroupId) {
          newDepts = newDepts.filter(id => id !== deptId);
        } else if (g.id === targetGroupId) {
          newDepts = [...newDepts, deptId];
        } else {
          return g;
        }

        const deptsData = newDepts.map(id => departments.find(d => d.id === id)).filter(Boolean);
        const totalAssets = deptsData.reduce((sum, d) => sum + (typeof d.totalAssets === 'string' ? parseInt(d.totalAssets) : (d.totalAssets || 0)), 0);
        const auditors = deptsData.reduce((sum, d) => sum + (d.auditorCount || 0), 0);
        
        return { ...g, departments: newDepts, totalAssets, auditors };
      });
      onUpdateSimulatedGroups(newSimGroups);
    } else {
      const targetGroup = auditGroups.find(g => g.id === targetGroupId);
      if (targetGroup) {
        onBulkUpdateDepartments([{ 
          id: deptId, 
          data: { auditGroupId: targetGroupId, auditGroup: targetGroup.name } 
        }]);
      }
    }
  };

  const entities = useMemo(() => {
    if (isGroupSimulatorActive && simulatedGroups && simulatedGroups.length > 0) {
      return simulatedGroups.map(g => {
        const memberDepts = g.departments.map((dId: string) => departments.find(d => d.id === dId)).filter(Boolean);
        return {
          id: g.id,
          name: g.name,
          members: memberDepts.map((d: any) => ({
             id: d.id,
             name: d.name,
             abbr: d.abbr,
             isTaskForce: d.abbr === 'UPKK' || d.name.includes('UPKK')
          })),
          assets: g.totalAssets,
          auditors: g.auditors,
          tier: g.tier,
          departments: g.departments,
          isGroup: !g.isTaskForce,
          isTaskForce: g.isTaskForce,
          isStandalone: !g.isTaskForce && g.departments.length === 1
        };
      });
    }

    const groupedDepts: Record<string, Department[]> = {};
    departments.filter(d => !d.isSystemExempted && !d.isExempted).forEach(dept => {
      const key = dept.auditGroupId || 'unassigned_' + dept.id;
      if (!groupedDepts[key]) groupedDepts[key] = [];
      groupedDepts[key].push(dept);
    });

    return Object.entries(groupedDepts).map(([groupId, depts]) => {
      const isActuallyUnassigned = groupId.startsWith('unassigned_');
      const totalAssets = depts.reduce((sum, d) => sum + (typeof d.totalAssets === 'string' ? parseInt(d.totalAssets) : (d.totalAssets || 0)), 0);
      const totalAuditors = depts.reduce((sum, d) => sum + (d.auditorCount || 0), 0);
      
      const groupRecord = auditGroups.find(g => g.id === groupId);
      const name = groupRecord?.name ?? depts[0].name;
      
      const totalLocations = depts.reduce((sum, d: any) => sum + (d.locationCount || 0), 0);
      const constitutesGroup = !isActuallyUnassigned;
      
      const isStandalone = constitutesGroup && depts.length === 1 && totalAssets >= standaloneThresholdAssets;
      const bbi = (totalAssets * 0.5) + (totalLocations * 100) + (totalAuditors * 300);

      return { 
        name, 
        assets: totalAssets, 
        auditors: totalAuditors, 
        locations: totalLocations,
        bbi: Math.round(bbi),
        memberCount: depts.length, 
        isJoint: constitutesGroup, 
        isGroup: constitutesGroup, 
        isStandalone,
        id: groupId, 
        members: depts,
        isTaskForce: depts.some(d => d.isTaskForce),
        tier: groupRecord?.tier || (depts.length === 1 ? depts[0].tier : undefined)
      };
    }).filter(e => e.isGroup).sort((a, b) => b.bbi - a.bbi);
  }, [departments, auditGroups, standaloneThresholdAssets, isGroupSimulatorActive, simulatedGroups]);

  const grandTotalAssets = useMemo(() => {
    return departments.reduce((sum, d) => sum + (typeof d.totalAssets === 'string' ? parseInt(d.totalAssets) : (d.totalAssets || 0)), 0);
  }, [departments]);

  const consolidationPrintData = useMemo(() => {
    let total = 0;
    const groups = auditGroups.map(group => {
      const groupDepts = departments.filter(d => (d.auditGroupId === group.id || d.auditGroup === group.name) && !d.isExempted && !d.isSystemExempted);
      let subTotal = 0;
      let subAuditors = 0;
      groupDepts.forEach(d => {
        const val = typeof d.totalAssets === 'string' ? parseInt(d.totalAssets) : (d.totalAssets || 0);
        total += val;
        subTotal += val;
        subAuditors += d.auditorCount || 0;
      });
      return { ...group, departments: groupDepts, subTotal, subAuditors };
    });
    const unassignedDepts = departments.filter(d => !d.auditGroupId && !d.auditGroup && !d.isExempted && !d.isSystemExempted && !d.isTaskForce);
    unassignedDepts.forEach(d => {
      total += typeof d.totalAssets === 'string' ? parseInt(d.totalAssets) : (d.totalAssets || 0);
    });
    return { groupedData: { groups, unassignedDepts }, overallTotal: total };
  }, [departments, auditGroups, isGroupSimulatorActive, simulatedGroups]);

  return (
    <div className="bg-slate-50/50 rounded-[40px] border-2 border-slate-100 p-8 md:p-12 shadow-sm animate-in fade-in slide-in-from-bottom-4 duration-500 overflow-hidden">
      <div className="flex flex-col lg:flex-row gap-8 lg:gap-14">
        {/* Left Sidebar: Control Panel */}
        <div className="lg:w-1/4 xl:w-1/5 space-y-8 lg:border-r lg:border-slate-100 lg:pr-10">
          <div>
            <div className="w-16 h-16 bg-white border border-slate-100 text-indigo-500 rounded-3xl flex items-center justify-center shadow-sm mb-8">
              <Boxes className="w-8 h-8" />
            </div>
            <h3 className="text-2xl font-black text-slate-900 tracking-tight leading-none mb-4">Unit Consolidation</h3>
            <p className="text-slate-500 text-xs font-medium leading-relaxed mb-6">
              Control Panel for institutional audit landscape grouping.
            </p>
          </div>

          <div className="space-y-6">
             <div className="flex items-center justify-between mb-4">
               <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Strategy Parameters</span>
               <PrintButton
                 onClick={() => printUnitConsolidation(consolidationPrintData.groupedData, consolidationPrintData.overallTotal)}
                 label="Print"
               />
             </div>

             {/* Mode Toggles */}
             <div className="flex flex-col gap-3">
               <button 
                onClick={() => { if (!initLocked) { setUseAI(!useAI); localStorage.setItem('group_builder_use_ai', (!useAI).toString()); } }}
                disabled={initLocked}
                className={`flex items-center justify-between px-4 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${useAI ? 'bg-indigo-600 text-white shadow-lg' : 'bg-white border border-slate-100 text-slate-400'} ${initLocked ? 'opacity-50 cursor-not-allowed' : ''}`}
               >
                 <div className="flex items-center gap-2">
                   <Sparkles className="w-3 h-3" />
                   <span>Thematic Clustering</span>
                 </div>
                 <span className={`text-[8px] px-1.5 py-0.5 rounded-md ${useAI ? 'bg-white/20' : 'bg-slate-100'}`}>{useAI ? 'ON' : 'OFF'}</span>
               </button>

               <button 
                onClick={() => { if (!initLocked) setAiConsolidation(!aiConsolidation); }}
                disabled={initLocked}
                className={`flex items-center justify-between px-4 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${aiConsolidation ? 'bg-emerald-600 text-white shadow-lg' : 'bg-white border border-slate-100 text-slate-400'} ${initLocked ? 'opacity-50 cursor-not-allowed' : ''}`}
               >
                 <div className="flex items-center gap-2">
                   <Users className="w-3 h-3" />
                   <span>Auditor Balancing</span>
                 </div>
                 <span className={`text-[8px] px-1.5 py-0.5 rounded-md ${aiConsolidation ? 'bg-white/20' : 'bg-slate-100'}`}>{aiConsolidation ? 'ON' : 'OFF'}</span>
               </button>
             </div>

             {/* Clean Sliders */}
             <div className="space-y-6 pt-4 border-t border-slate-100">
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-black uppercase text-slate-500">Standalone Cutoff</span>
                    <span className="text-[11px] font-black text-indigo-600 italic tabular-nums">{standaloneThresholdAssets.toLocaleString()}</span>
                  </div>
                  <input 
                    type="range" 
                    title="Standalone cutoff threshold"
                    min="500" 
                    max="2000" 
                    step="50"
                    value={standaloneThresholdAssets}
                    onChange={(e) => onUpdateStandaloneThresholdAssets(parseInt(e.target.value))}
                    disabled={initLocked}
                    className={`w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-500 ${initLocked ? 'opacity-50 cursor-not-allowed' : ''}`}
                  />
                </div>

                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-black uppercase text-slate-500">Grouping Margin</span>
                    <span className="text-[11px] font-black text-indigo-400 italic">{(groupingMargin * 100).toFixed(0)}%</span>
                  </div>
                  <input 
                    type="range" 
                    title="Grouping margin percentage"
                    min="0.05" 
                    max="0.30" 
                    step="0.01"
                    value={groupingMargin}
                    onChange={(e) => onUpdateGroupingMargin(parseFloat(e.target.value))}
                    disabled={initLocked}
                    className={`w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-300 ${initLocked ? 'opacity-50 cursor-not-allowed' : ''}`}
                  />
                </div>

                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-black uppercase text-slate-500">Auditor Parity Gap</span>
                    <span className="text-[11px] font-black text-emerald-500 italic">± {groupingAuditorMargin} staff</span>
                  </div>
                  <input 
                    type="range" 
                    title="Auditor parity gap"
                    min="1" 
                    max="10" 
                    step="1"
                    value={groupingAuditorMargin}
                    onChange={(e) => onUpdateGroupingAuditorMargin?.(parseInt(e.target.value))}
                    disabled={initLocked}
                    className={`w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-emerald-500 ${initLocked ? 'opacity-50 cursor-not-allowed' : ''}`}
                  />
                  <p className="text-[8px] text-slate-400 italic">Tolerance for manpower balancing.</p>
                </div>

                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-black uppercase text-slate-500">Manpower Baseline</span>
                    <span className={`text-[11px] font-black italic tabular-nums ${aiConsolidation ? 'text-emerald-600' : 'text-amber-600'}`}>
                      {aiConsolidation ? minAuditorsPerGroup : minAuditorsPerLocation}
                    </span>
                  </div>
                  <input 
                    type="range" 
                    title="Manpower baseline"
                    min="2" 
                    max="30" 
                    step="1"
                    value={aiConsolidation ? minAuditorsPerGroup : minAuditorsPerLocation}
                    onChange={(e) => {
                      if (aiConsolidation) setMinAuditorsPerGroup(parseInt(e.target.value));
                    }}
                    disabled={!aiConsolidation}
                    className={`w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer ${aiConsolidation ? 'accent-emerald-500' : 'accent-slate-300 opacity-50'}`}
                  />
                  <p className="text-[8px] text-slate-400 italic">Target auditors per cluster.</p>
                </div>
             </div>

             {/* Primary Simulation Button */}
             <div className="pt-8">
               <button
                  onClick={handleRunAutoConsolidate}
                  disabled={isProcessing || initLocked}
                  className={`w-full flex items-center justify-center gap-3 px-6 py-4 border-2 rounded-2xl font-black tracking-tight transition-all shadow-xl active:scale-[0.98] ${
                    isGroupSimulatorActive 
                      ? 'bg-amber-500 border-amber-400 text-white shadow-amber-200 hover:bg-amber-600' 
                      : 'bg-slate-900 border-slate-800 text-white shadow-slate-900/10 hover:bg-slate-800'
                  } disabled:bg-slate-200 disabled:border-slate-100 disabled:shadow-none`}
                >
                  {isProcessing ? <Loader2 className="w-5 h-5 animate-spin" /> : <Wand2 className={`w-5 h-5 ${isGroupSimulatorActive ? 'text-white' : 'text-amber-400'}`} />}
                  <span className="text-xs uppercase tracking-widest">{isGroupSimulatorActive ? 'Recalculate Draft' : 'Run Simulation'}</span>
                </button>
                {initLocked && (
                  <p className="text-[8px] text-rose-500 font-bold uppercase mt-2 text-center tracking-tighter">{initLockReason}</p>
                )}
             </div>
          </div>
        </div>

        {/* Main Content: Results & Inventory */}
        <div className="lg:w-3/4 xl:w-4/5 bg-white rounded-[44px] p-8 md:p-10 border border-slate-100 shadow-sm relative overflow-hidden flex flex-col h-175 max-h-[85vh]">
           {entities.length === 0 && !isProcessing ? (
             <div className="flex-1 flex flex-col items-center justify-center text-center p-12">
                <div className="w-20 h-20 bg-slate-50 text-slate-200 rounded-full flex items-center justify-center mb-6">
                  <Boxes className="w-10 h-10" />
                </div>
                <h4 className="text-2xl font-black text-slate-900 mb-2">Ready to Consolidate?</h4>
                <p className="text-sm text-slate-400 max-w-sm">Use the control panel on the left to adjust strategy and run your first institutional group simulation.</p>
             </div>
           ) : (
             <div className="animate-in fade-in duration-500 flex flex-col flex-1 h-full min-h-0">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-8 pb-8 border-b border-slate-100 shrink-0">
                   <div className="space-y-1">
                     <div className="flex items-center gap-3">
                        <h4 className="text-3xl font-black text-slate-900 tracking-tighter leading-[0.9]">Active Entities</h4>
                        {isGroupSimulatorActive ? (
                          <div className="px-3 py-1 bg-amber-500 text-white rounded-lg text-[10px] font-black uppercase tracking-widest shadow-lg shadow-amber-200 animate-pulse">
                            Simulation Draft
                          </div>
                        ) : (
                          <div className="px-3 py-1 bg-emerald-100 text-emerald-600 border border-emerald-200 rounded-lg text-[10px] font-black uppercase tracking-widest">
                            Committed
                          </div>
                        )}
                     </div>
                     <p className="text-xs font-medium text-slate-400">Reviewing {entities.length} institutional clusters and standalone units.</p>
                   </div>

                   <div className="flex items-center gap-4">
                      <div className="bg-slate-50 px-6 py-4 rounded-[24px] border border-slate-100 flex flex-col items-center min-w-32">
                         <span className="text-[8px] font-black uppercase text-slate-400 tracking-widest mb-1">Institutional Total</span>
                         <span className="text-2xl font-mono font-black text-slate-900 italic tracking-tighter leading-none">{grandTotalAssets.toLocaleString()}</span>
                      </div>

                      {isGroupSimulatorActive ? (
                        <div className="flex items-center gap-2">
                          <button 
                            onClick={onCancelGroupSimulation}
                            className="w-12 h-12 bg-white border-2 border-slate-100 text-slate-400 hover:text-rose-500 hover:border-rose-100 hover:bg-rose-50 rounded-2xl transition-all flex items-center justify-center shadow-sm"
                            title="Discard Draft"
                          >
                            <X className="w-5 h-5" />
                          </button>
                          <button 
                            onClick={() => onCommitGroups?.(simulatedGroups)}
                            disabled={isProcessing || initLocked}
                            className="px-6 py-3.5 bg-emerald-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-lg shadow-emerald-100 hover:bg-emerald-700 transition-all flex items-center gap-2 border-2 border-emerald-500 disabled:opacity-50"
                          >
                            <CheckCheck className="w-3.5 h-3.5" />
                            Commit Draft
                          </button>
                        </div>
                      ) : (
                        auditGroups.length > 0 && (
                          <div className="flex items-center gap-2">
                            <button
                              onClick={handleResetAllGroups}
                              disabled={isProcessing || isSystemLocked}
                              className="w-12 h-12 bg-white border-2 border-rose-100 text-rose-400 hover:bg-rose-50 rounded-2xl transition-all flex items-center justify-center shadow-sm"
                              title="Reset Groups"
                            >
                              <Trash2 className="w-5 h-5" />
                            </button>
                            <button onClick={() => window.location.reload()} title="Reload page" className="w-12 h-12 bg-white border-2 border-slate-100 text-slate-300 hover:text-indigo-600 rounded-2xl transition-all flex items-center justify-center shadow-sm">
                              <RotateCcw className="w-5 h-5" />
                            </button>
                          </div>
                        )
                      )}
                   </div>
                </div>
                
                <div className="flex-1 min-h-0 overflow-hidden">
                   <div className="flex gap-6 overflow-x-auto pb-10 pt-4 px-2 custom-scrollbar snap-x snap-mandatory h-full">
                     {entities.map((e, idx) => (
                       <div 
                         key={e.id} 
                         className="bg-white p-8 rounded-[36px] border-2 border-slate-100 shadow-sm flex flex-col min-w-75 w-75 snap-center relative shrink-0 text-left overflow-hidden h-fit mb-4 group/card hover:border-indigo-200 transition-all"
                       >
                          <div className={`absolute left-0 top-0 bottom-0 w-1.5 ${isGroupSimulatorActive ? 'bg-amber-500/20' : 'bg-indigo-500/10'}`}></div>
                          <div className="flex justify-between items-start mb-8">
                             <span className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400">Rank #{idx + 1}</span>
                              {e.isGroup ? (
                                <div className="px-2.5 py-1 bg-amber-500/10 text-amber-600 border border-amber-500/20 rounded-lg text-[8px] font-black uppercase">Group</div>
                              ) : e.isTaskForce ? (
                                <div className="px-2.5 py-1 bg-blue-600 text-white rounded-lg text-[8px] font-black uppercase shadow-sm">Task Force</div>
                              ) : e.isStandalone ? (
                                <div className="px-2.5 py-1 bg-slate-900 text-white rounded-lg text-[8px] font-black uppercase shadow-sm">Standalone</div>
                              ) : (
                                <div className="px-2.5 py-1 bg-slate-100 text-slate-400 border border-slate-200 rounded-lg text-[8px] font-black uppercase">Candidate</div>
                              )}
                              {e.tier && (
                                <div className={`px-2.5 py-1 rounded-lg text-[8px] font-black uppercase border shadow-sm ${
                                  e.tier === 'Large' ? 'bg-rose-50 border-rose-200 text-rose-600' :
                                  e.tier === 'Medium' ? 'bg-indigo-50 border-indigo-200 text-indigo-600' :
                                  'bg-emerald-50 border-emerald-200 text-emerald-600'
                                }`}>
                                  {e.tier}
                                </div>
                              )}
                          </div>
                          <h5 className="font-black text-lg text-slate-900 mb-6 tracking-tight line-clamp-2 h-11">{e.name}</h5>
                          <div className="flex flex-wrap gap-2 mb-8 grow content-start min-h-16">
                             {e.members.map(m => (
                               <div key={m.id} className="relative group/badge">
                                <div className={`relative px-3 py-1.5 border-2 rounded-xl text-[10px] font-black uppercase tracking-tight transition-all cursor-pointer shadow-sm flex items-center gap-2 ${m.isTaskForce ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-700 border-slate-100 group-hover/card:border-indigo-200'}`}>
                                  <span>{m.abbr || m.name}</span>
                                  {!pairingLocked && !isSystemLocked && (
                                      <select
                                        title="Move department to group"
                                        className="absolute inset-0 opacity-0 cursor-pointer"
                                        value={e.id}
                                        onChange={(evt) => handleMoveDepartment(m.id, e.id, evt.target.value)}
                                      >
                                      {(isGroupSimulatorActive ? simulatedGroups : auditGroups).map(ag => (
                                        <option key={ag.id} value={ag.id}>{ag.id === e.id ? 'Stay in ' : 'Move to '}{ag.name}</option>
                                      ))}
                                    </select>
                                  )}
                                </div>
                                 {!pairingLocked && !isSystemLocked && (
                                   <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none opacity-40 group-hover/badge:opacity-100 group-hover/badge:text-indigo-500 transition-opacity">
                                     <RotateCcw className="w-2 h-2" />
                                   </div>
                                 )}
                               </div>
                             ))}
                          </div>

                          <div className="mt-auto pt-6 border-t border-slate-100 grid grid-cols-2 gap-4 shrink-0">
                             <div className="flex flex-col gap-1">
                                <span className="text-[8px] font-black uppercase text-slate-400">Assets</span>
                                <span className="text-xl font-black text-slate-800 tabular-nums italic">{e.assets.toLocaleString()}</span>
                             </div>
                              <div className="flex flex-col items-end gap-1">
                                 <span className="text-[8px] font-black uppercase text-slate-400">Auditors</span>
                                 <span className={`text-xl font-black tabular-nums flex items-center gap-1.5 ${e.auditors < (aiConsolidation ? minAuditorsPerGroup : minAuditorsPerLocation) ? 'text-rose-600' : 'text-emerald-600'}`}>
                                   {e.auditors}
                                 </span>
                              </div>
                          </div>
                       </div>
                     ))}
                   </div>
                </div>

                {recommendations.length > 0 && (
                  <div className="mt-4 p-4 bg-amber-50 border border-amber-100 rounded-2xl flex items-start gap-3 shrink-0">
                    <Zap className="w-4 h-4 text-amber-500 mt-1" />
                    <div className="flex-1">
                      <span className="text-[10px] font-black uppercase text-amber-900 tracking-widest">Structural Insights</span>
                      <div className="flex flex-wrap gap-2 mt-2">
                        {recommendations.slice(0, 3).map((rec, i) => (
                           <span key={i} className="px-2 py-1 bg-white border border-amber-200 rounded-lg text-[8px] font-bold text-amber-700 uppercase tracking-tighter">
                             {rec.reason}
                           </span>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
             </div>
           )}
        </div>
      </div>
    </div>
  );
};
