
import React, { useMemo, useState, useRef, useEffect } from 'react';
import { AuditPhase, KPITier, KPITierTarget, Department, Location, AuditSchedule, InstitutionKPITarget } from '@shared/types';
import { ChevronDown, Building2, TrendingUp, AlertCircle, CheckCircle2 } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import { PrintButton } from './PrintButton';
import { printKPICompletionTarget } from '../lib/printUtils';

interface KPIStatsWidgetProps {
  phases: AuditPhase[];
  kpiTiers: KPITier[];
  kpiTierTargets: KPITierTarget[];
  departments: Department[];
  locations: Location[];
  schedules: AuditSchedule[];
  institutionKPIs: InstitutionKPITarget[];
}

function TierProgressBar({ actual, target, color }: { actual: number; target: number; color: string }) {
  const fillRef = React.useRef<HTMLDivElement>(null);
  const markerRef = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    fillRef.current?.style.setProperty('--w', `${Math.min(100, actual)}%`);
    markerRef.current?.style.setProperty('--mark', `${Math.min(100, target)}%`);
  }, [actual, target]);
  return (
    <div className="h-3 w-full bg-slate-200 rounded-full relative overflow-hidden mb-2">
      <div ref={markerRef} className="absolute top-0 bottom-0 w-0.5 bg-slate-900 z-10 opacity-30 left-(--mark)" title={`Target: ${target}%`} />
      <div ref={fillRef} className={`h-full rounded-full transition-all duration-1000 ${color} relative w-(--w)`} />
    </div>
  );
}

function DeptProgressBar({ percentage, color }: { percentage: number; color: string }) {
  const ref = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    ref.current?.style.setProperty('--w', `${percentage}%`);
  }, [percentage]);
  return <div ref={ref} className={`h-full rounded-full ${color} w-(--w)`} />;
}

export const KPIStatsWidget: React.FC<KPIStatsWidgetProps> = ({ phases, kpiTiers, kpiTierTargets, departments, locations, schedules, institutionKPIs }) => {
  const { t } = useLanguage();
  const [expandedTierId, setExpandedTierId] = useState<string | null>(null);
  const today = new Date();
  
  // 1. Identify Current Active Phase
  const activePhase = useMemo(() => {
    return phases.find(p => {
        const start = new Date(p.startDate);
        const end = new Date(p.endDate);
        return today >= start && today <= end;
    }) || phases.sort((a,b) => a.startDate.localeCompare(b.startDate))[0]; // Default to first phase if none active
  }, [phases, today]);

  // ── Helpers ────────────────────────────────────────────────────────────
  const isInActivePhase = (s: AuditSchedule): boolean => {
    if (!activePhase) return false;
    if (s.date) {
      const d = new Date(s.date); d.setHours(12, 0, 0, 0);
      const start = new Date(activePhase.startDate); start.setHours(0, 0, 0, 0);
      const end = new Date(activePhase.endDate); end.setHours(23, 59, 59, 999);
      return d >= start && d <= end;
    }
    return s.phaseId === activePhase.id;
  };

  // 2. Compute Stats per Tier (asset-based) — with projected completion
  const tierStats = useMemo(() => {
    if (!activePhase || !kpiTiers || kpiTiers.length === 0) return [];

    const institutionTotalAssets = departments.reduce((sum, d) => sum + (d.totalAssets || 0), 0);
    const phaseEnd = new Date(activePhase.endDate);

    // Build location asset lookup
    const locAssets: Record<string, number> = {};
    for (const l of locations) { locAssets[l.id] = l.totalAssets || 0; }

    const sortedTiers = [...kpiTiers].sort((a,b) => a.minAssets - b.minAssets);

    return sortedTiers.map((tier, idx) => {
      const deptsInTier = departments.filter(d => {
        const deptPercentage = institutionTotalAssets > 0 ? ((d.totalAssets || 0) / institutionTotalAssets) * 100 : 0;
        const assignedTier = sortedTiers
          .filter(t => deptPercentage >= t.minAssets)
          .sort((a,b) => b.minAssets - a.minAssets)[0];
        return assignedTier?.id === tier.id;
      });

      // Use relational kpiTierTargets table
      const targetPercentage = kpiTierTargets.find(kt => kt.tierId === tier.id && kt.phaseId === activePhase.id)?.targetPercentage ?? 0;

      // Asset-based per-department progress for the active phase (with projection)
      const deptDetails = deptsInTier.map(d => {
        const totalDeptAssets = d.totalAssets || 0;
        const isZeroAsset = totalDeptAssets === 0;

        // Completed: any schedule in this phase + dept with status=Completed
        const completedLocIds: string[] = schedules
          .filter(s => s.departmentId === d.id && isInActivePhase(s) && s.status === 'Completed')
          .map(s => s.locationId);
        const inspectedAssets = completedLocIds.reduce((sum, locId) => sum + (locAssets[locId] || 0), 0);

        // Projected: schedules with a future date (within phase) that aren't completed yet
        const projectedLocIds: string[] = schedules
          .filter(s =>
            s.departmentId === d.id &&
            isInActivePhase(s) &&
            s.status !== 'Completed' &&
            s.date && new Date(s.date) <= phaseEnd
          )
          .map(s => s.locationId);
        // Only count locations not already completed
        const uniqueProjected = [...new Set(projectedLocIds.filter(lid => !completedLocIds.includes(lid)))];
        const projectedAssets = uniqueProjected.reduce((sum, locId) => sum + (locAssets[locId] || 0), 0);

        const combinedAssets = inspectedAssets + projectedAssets;
        const percentage = isZeroAsset ? 100 : Math.round((inspectedAssets / totalDeptAssets) * 100);
        const projectedPercentage = isZeroAsset ? 100 : Math.round((combinedAssets / totalDeptAssets) * 100);

        return {
          id: d.id,
          name: d.name,
          assets: totalDeptAssets,
          inspectedAssets,
          projectedAssets,
          percentage,
          projectedPercentage,
          status: (isZeroAsset || projectedPercentage >= targetPercentage) ? 'On Track' : 'At Risk'
        };
      }).sort((a, b) => a.percentage - b.percentage);

      const totalTierAssets = deptsInTier.reduce((sum, d) => sum + (d.totalAssets || 0), 0);
      const inspectedTierAssets = deptDetails.reduce((sum, d) => sum + d.inspectedAssets, 0);
      const projectedTierAssets = deptDetails.reduce((sum, d) => sum + d.projectedAssets, 0);
      const combinedTierAssets = inspectedTierAssets + projectedTierAssets;
      const actualPercentage = totalTierAssets > 0 ? Math.round((inspectedTierAssets / totalTierAssets) * 100) : 0;
      const projectedPercentage = totalTierAssets > 0 ? Math.round((combinedTierAssets / totalTierAssets) * 100) : 0;

      return {
        ...tier,
        isHighestTier: idx === sortedTiers.length - 1,
        nextMin: sortedTiers[idx + 1]?.minAssets || 100,
        departments: deptDetails,
        deptCount: deptsInTier.length,
        actualPercentage,
        projectedPercentage,
        targetPercentage,
        status: projectedPercentage >= targetPercentage ? 'On Track' : 'At Risk'
      };
    }).sort((a,b) => a.minAssets - b.minAssets);
  }, [kpiTiers, kpiTierTargets, departments, locations, schedules, activePhase]);

  // Global Institutional Progress — asset-based with projection
  const globalStats = useMemo(() => {
    if (!activePhase) return null;
    const phaseEnd = new Date(activePhase.endDate);
    const totalInstitutionAssets = departments.reduce((sum, d) => sum + (d.totalAssets || 0), 0);
    const targetPercentage = institutionKPIs.find(k => k.phaseId === activePhase.id)?.targetPercentage ?? 0;
    const targetAssets = Math.ceil(totalInstitutionAssets * targetPercentage / 100);

    // Completed
    const completedLocIds = new Set(
      schedules.filter(s => isInActivePhase(s) && s.status === 'Completed').map(s => s.locationId)
    );
    const inspectedAssets = locations
      .filter(l => completedLocIds.has(l.id))
      .reduce((sum, l) => sum + (l.totalAssets || 0), 0);

    // Projected (dated but not yet completed, within phase)
    const projectedLocIds = new Set(
      schedules.filter(s =>
        isInActivePhase(s) &&
        s.status !== 'Completed' &&
        s.date && new Date(s.date) <= phaseEnd
      ).map(s => s.locationId)
    );
    const projectedAssets = locations
      .filter(l => projectedLocIds.has(l.id) && !completedLocIds.has(l.id))
      .reduce((sum, l) => sum + (l.totalAssets || 0), 0);

    const combinedAssets = inspectedAssets + projectedAssets;
    const actualPercentage = totalInstitutionAssets > 0 ? Math.round((inspectedAssets / totalInstitutionAssets) * 100) : 0;
    const projectedPercentage = totalInstitutionAssets > 0 ? Math.round((combinedAssets / totalInstitutionAssets) * 100) : 0;

    return {
      totalInstitutionAssets,
      inspectedAssets,
      projectedAssets,
      targetAssets,
      actualPercentage,
      projectedPercentage,
      targetPercentage,
      isOnTrack: projectedPercentage >= targetPercentage
    };
  }, [schedules, locations, departments, institutionKPIs, activePhase]);

  const globalFillRef = useRef<HTMLDivElement>(null);
  const globalTargetRef = useRef<HTMLDivElement>(null);

  const toggleExpand = (id: string) => {
    setExpandedTierId(prev => prev === id ? null : id);
  };

  if (!activePhase) return null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-xl font-bold text-slate-900">{t('dashboard.performance')}</h3>
          <p className="text-sm font-bold text-blue-600 uppercase tracking-widest mt-1">
            {t('dashboard.current_phase')}: {activePhase.name}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <PrintButton
            onClick={() => printKPICompletionTarget(globalStats, tierStats, activePhase)}
            label="Print"
            title="Print Inspection Completion KPI Target"
          />
          <div className="bg-slate-50 px-4 py-2 rounded-2xl border border-slate-100 hidden sm:block">
              <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest text-right">{t('dashboard.phase_ends')}</p>
              <p className="text-sm font-black text-slate-700">{activePhase.endDate}</p>
          </div>
        </div>
      </div>

      {globalStats && (
        <div className="bg-slate-900 rounded-[24px] p-5 text-white relative overflow-hidden shadow-lg shadow-blue-900/10">
           <div className="absolute top-0 right-0 w-48 h-48 bg-blue-500/10 blur-[60px] rounded-full -mr-16 -mt-16"></div>
           <div className="absolute bottom-0 left-0 w-36 h-36 bg-emerald-500/5 blur-2xl rounded-full -ml-16 -mb-16"></div>
           
           <div className="relative flex flex-col md:flex-row md:items-center gap-5">
              <div className="grow">
                 <div className="flex items-center gap-2 mb-3">
                    <div className="w-8 h-8 bg-white/10 text-blue-400 rounded-lg flex items-center justify-center border border-white/10">
                       <Building2 className="w-4 h-4" />
                    </div>
                    <h4 className="text-sm font-black uppercase tracking-tight">{t('dashboard.progress')}</h4>
                 </div>
                 
                 <div className="flex items-baseline gap-2 mb-3">
                    <span className="text-4xl font-black">{globalStats.actualPercentage}%</span>
                    <span className="text-sm font-bold text-white/40">→ {globalStats.projectedPercentage}% incl. scheduled</span>
                 </div>

                 <div className="grid grid-cols-2 gap-3">
                    <div className="bg-white/5 border border-white/10 rounded-xl p-2.5">
                       <p className="text-[10px] font-black uppercase tracking-widest text-white/40 mb-0.5">Phase Goal</p>
                       <p className="text-base font-bold">{globalStats.targetPercentage}%</p>
                       <p className="text-[9px] text-white/50 mt-0.5">{globalStats.targetAssets.toLocaleString()} assets</p>
                    </div>
                    <div className="bg-white/5 border border-white/10 rounded-xl p-2.5">
                       <p className="text-[10px] font-black uppercase tracking-widest text-white/40 mb-0.5">Status</p>
                       <div className="flex items-center gap-1.5">
                          {globalStats.isOnTrack ? (
                             <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                          ) : (
                             <AlertCircle className="w-4 h-4 text-amber-400" />
                          )}
                          <p className={`text-xs font-bold ${globalStats.isOnTrack ? 'text-emerald-400' : 'text-amber-400'}`}>
                             {globalStats.isOnTrack ? 'On Track' : 'At Risk'}
                          </p>
                       </div>
                    </div>
                 </div>
              </div>

              <div className="w-full md:w-40 shrink-0 flex flex-col items-center justify-center p-4 bg-white/5 rounded-[20px] border border-white/10">
                 <TrendingUp className={`w-6 h-6 mb-2 ${globalStats.isOnTrack ? 'text-emerald-400' : 'text-amber-400'}`} />
                 <p className="text-[9px] font-black uppercase tracking-widest text-white/40 text-center mb-0.5">Inspected + Scheduled</p>
                 <p className="text-xl font-black">{globalStats.inspectedAssets.toLocaleString()}</p>
                 <p className="text-[10px] text-emerald-400/80 font-bold">+{globalStats.projectedAssets.toLocaleString()} scheduled</p>
                 <p className="text-[9px] text-white/40 font-medium mt-0.5">of {globalStats.targetAssets.toLocaleString()} target</p>
              </div>
           </div>

           <div className="h-2 w-full bg-white/10 rounded-full mt-5 relative overflow-hidden">
              <div 
                 ref={globalTargetRef}
                 className="absolute top-0 bottom-0 w-1 bg-white z-10 left-(--mark)" 
              ></div>
              <div 
                 ref={globalFillRef}
                 className={`h-full rounded-full transition-all duration-1000 ${globalStats.isOnTrack ? 'bg-emerald-400' : 'bg-amber-400'} w-(--w)`}
              ></div>
           </div>
        </div>
      )}
    </div>
  );
};
