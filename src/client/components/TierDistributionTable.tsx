
import React, { useMemo } from 'react';
import { Department, KPITier, AuditPhase, AuditSchedule, KPITierTarget, Location } from '@shared/types';
import { Boxes, Layers, CheckCircle2, AlertCircle, MinusCircle, HelpCircle } from 'lucide-react';
import { PrintButton } from './PrintButton';
import { hasCapability } from '../lib/pbacUtils';
import { printKPIPhasePlan } from '../lib/printUtils';

interface TierDistributionTableProps {
  departments: Department[];
  kpiTiers: KPITier[];
  kpiTierTargets: KPITierTarget[];
  phases: AuditPhase[];
  schedules: AuditSchedule[];
  locations?: Location[];
  users?: any[];
  buildings?: any[];
  openAuditThreshold?: number;
}

export const TierDistributionTable: React.FC<TierDistributionTableProps> = ({ 
  departments, 
  kpiTiers, 
  kpiTierTargets,
  phases,
  schedules,
  locations = [],
  users = [],
  buildings = [],
  openAuditThreshold = 500,
}) => {
  const sortedPhases = useMemo(() => [...phases].sort((a, b) => a.startDate.localeCompare(b.startDate)), [phases]);
  const sortedTiers = useMemo(() => [...kpiTiers].sort((a, b) => a.minAssets - b.minAssets), [kpiTiers]);

  const tableData = useMemo(() => {
    const institutionTotalAssets = departments.reduce((sum, d) => sum + (d.totalAssets || 0), 0);

    // Optimization: Pre-group users by department for O(1) lookup
    const usersByDept: Record<string, any[]> = {};
    users.forEach(u => {
      if (!u.departmentId) return;
      if (!usersByDept[u.departmentId]) usersByDept[u.departmentId] = [];
      usersByDept[u.departmentId].push(u);
    });



    return departments
      .filter(dept => (dept.totalAssets || 0) > 0)
      .map(dept => {
        const deptPercentage = institutionTotalAssets > 0 ? ((dept.totalAssets || 0) / institutionTotalAssets) * 100 : 0;
        const tier = sortedTiers
          .filter(t => deptPercentage >= t.minAssets)
          .sort((a,b) => b.minAssets - a.minAssets)[0];
        const deptAudits = schedules.filter(s => s.departmentId === dept.id);

      // Pre-compute location coverage so phaseStatus can use it
      const deptLocIds = new Set(locations.filter(l => l.departmentId === dept.id).map(l => l.id));
      const scheduledLocIds = new Set(deptAudits.map(a => a.locationId));
      const allLocsScheduled = deptLocIds.size > 0 && [...deptLocIds].every(lid => scheduledLocIds.has(lid));

      const phaseStatus = sortedPhases.reduce<{
        phaseId: string; hasAudit: boolean; isRequired: boolean;
        isCompleted: boolean; targetPct: number; targetAssets: number;
      }[]>((acc, phase) => {
        const isInPhase = (a: AuditSchedule) => {
          if (a.date) {
            const d = new Date(a.date); d.setHours(12, 0, 0, 0);
            const start = new Date(phase.startDate); start.setHours(0, 0, 0, 0);
            const end = new Date(phase.endDate); end.setHours(23, 59, 59, 999);
            return d >= start && d <= end;
          }
          return a.phaseId === phase.id;
        };
        const hasAuditDirect = deptAudits.some(isInPhase);
        const targetPct = tier
          ? (kpiTierTargets.find(kt => kt.tierId === tier.id && kt.phaseId === phase.id)?.targetPercentage
             ?? tier.targets?.[phase.id]
             ?? 0)
          : 0;
        const prevReached100 = acc.some(p => p.targetPct >= 100);
        const isRequired = (dept.totalAssets || 0) > 0 && targetPct > 0 && !prevReached100;
        const hasAudit = hasAuditDirect || (isRequired && allLocsScheduled);
        const isCompleted = deptAudits.some(a => isInPhase(a) && a.status === 'Completed');
        const targetAssets = Math.ceil((dept.totalAssets || 0) * targetPct / 100);

        acc.push({ phaseId: phase.id, hasAudit, isRequired, isCompleted, targetPct, targetAssets });
        return acc;
      }, []);

      const hasNoAssets = (dept.totalAssets || 0) === 0;
      const isFullyScheduled = !hasNoAssets && (
        deptLocIds.size > 0
          ? allLocsScheduled
          : phaseStatus.every(p => !p.isRequired || p.hasAudit)
      );
      
      const dUsers = usersByDept[dept.id] || [];
      const relevantUsers = dUsers.filter(u => u.certificationExpiry && new Date(u.certificationExpiry) > new Date());

      return {
        ...dept,
        tierName: tier?.name || 'Unassigned',
        phaseStatus,
        isFullyScheduled,
        hasNoAssets,
        locationCount: deptLocIds.size,
        auditorCount: relevantUsers.length,
      };
    }).sort((a, b) => (b.totalAssets || 0) - (a.totalAssets || 0));
  }, [departments, sortedTiers, sortedPhases, schedules, users, buildings, locations]);

  return (
    <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="p-6 border-b border-slate-100 flex items-center justify-between">
        <div>
          <h3 className="text-lg font-bold text-slate-900">KPI Phase Inspection Plan</h3>
          <p className="text-xs text-slate-500 mt-1">Guideline showing required inspection phases per department based on KPI tier. Phase assignment happens automatically when a slot is locked.</p>
        </div>
        <div className="flex items-center gap-4">
          <PrintButton
            onClick={() => printKPIPhasePlan(tableData, sortedPhases, openAuditThreshold)}
            label="Print"
            title="Print KPI Phase Inspection Plan"
          />
          <div className="flex gap-4">
             <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
                <span className="text-[10px] font-bold text-slate-500 uppercase">Inspection Scheduled</span>
             </div>
             <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-slate-200"></div>
                <span className="text-[10px] font-bold text-slate-500 uppercase">Not Required</span>
             </div>
          </div>
        </div>
      </div>
      
      <div className="overflow-x-auto max-h-150 overflow-y-auto custom-scrollbar">
        <table className="w-full text-left">
          <thead className="bg-slate-50/95 sticky top-0 z-10 backdrop-blur-sm shadow-sm">
            <tr>
              <th className="px-6 py-4 text-[10px] font-black uppercase text-slate-400 tracking-widest">Department</th>
              <th id="header-auditors-tier" className="px-6 py-4 text-[10px] font-black uppercase text-slate-400 tracking-widest text-center">Certified Officers</th>
              <th className="px-6 py-4 text-[10px] font-black uppercase text-slate-400 tracking-widest text-center">Required Inspectors</th>
              <th className="px-6 py-4 text-[10px] font-black uppercase text-slate-400 tracking-widest">Assets / Tier</th>
              {sortedPhases.map(phase => (
                <th key={phase.id} className="px-4 py-4 text-[10px] font-black uppercase text-slate-400 tracking-widest text-center">
                  {phase.name}
                </th>
              ))}
              <th className="px-6 py-4 text-[10px] font-black uppercase text-slate-400 tracking-widest text-right">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {tableData.map(row => (
              <tr key={row.id} className="hover:bg-slate-50/50 transition-colors">
                <td className="px-6 py-4">
                  <div className="font-bold text-slate-900 text-sm">{row.name}</div>
                  <div className="text-[10px] text-slate-400 font-medium">{row.abbr}</div>
                </td>
                <td className="px-6 py-4 text-center">
                  <span className="text-xs font-bold text-slate-700">{(row as any).auditorCount}</span>
                </td>
                <td className="px-6 py-4 text-center">
                    <div className="flex flex-col items-center">
                       <span className="text-xs font-black text-indigo-600">
                          {row.auditorsRequiredOverride ?? (() => {
                             const assets = row.totalAssets || 0;
                             if (assets === 0) return 0;
                             const raw = Math.ceil(assets / openAuditThreshold);
                             return Math.max(2, raw * 2);
                          })()}
                       </span>
                    </div>
                </td>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-2 mb-1">
                    <Boxes className="w-3 h-3 text-slate-400" />
                    <span className="text-xs font-bold text-slate-700">{(row.totalAssets || 0).toLocaleString()}</span>
                  </div>
                  <div className="inline-flex px-2 py-0.5 bg-blue-50 text-blue-600 text-[9px] font-black uppercase rounded border border-blue-100 tracking-tighter">
                    {row.tierName}
                  </div>
                </td>
                {row.phaseStatus.map((ps, idx) => (
                  <td key={idx} className="px-4 py-4 text-center">
                    {ps.isRequired ? (
                      <div className={`inline-flex flex-col items-center justify-center w-14 min-h-12 rounded-xl border-2 px-1 py-1 transition-all ${
                        ps.isCompleted 
                          ? 'bg-emerald-500 border-emerald-500 text-white shadow-lg shadow-emerald-500/20' 
                          : ps.hasAudit 
                          ? 'bg-blue-50 border-blue-200 text-blue-600' 
                          : 'bg-rose-50 border-rose-100 text-rose-400 border-dashed'
                      }`}>
                        {ps.isCompleted ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Layers className="w-3.5 h-3.5" />}
                        <span className="text-[9px] font-black mt-0.5">{ps.targetPct}%</span>
                        <span className="text-[8px] opacity-70">{ps.targetAssets.toLocaleString()} aset</span>
                      </div>
                    ) : (
                      <div className="w-8 h-8 rounded-xl bg-slate-100 border border-slate-200 mx-auto opacity-30"></div>
                    )}
                  </td>
                ))}
                <td className="px-6 py-4 text-right">
                  {row.hasNoAssets ? (
                    <span className="inline-flex items-center gap-1 text-[10px] font-black text-slate-400 uppercase">
                      <MinusCircle className="w-3 h-3" /> Not Required
                    </span>
                  ) : row.isFullyScheduled ? (
                    <span className="inline-flex items-center gap-1 text-[10px] font-black text-emerald-600 uppercase">
                      <CheckCircle2 className="w-3 h-3" /> Ready
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[10px] font-black text-amber-600 uppercase">
                      <AlertCircle className="w-3 h-3" /> Incomplete
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
