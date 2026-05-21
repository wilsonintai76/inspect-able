
import React, { useMemo, useState } from 'react';
import { KPITier, AuditPhase, KPITierTarget, Department, InstitutionKPITarget } from '@shared/types';
import { ConfirmationModal } from './ConfirmationModal';
import { Lock, Plus, Check, X, Pencil, Trash2, Boxes, Building2, Sparkles } from 'lucide-react';

interface KPISettingsProps {
  tiers: KPITier[];
  phases: AuditPhase[];
  tierTargets: KPITierTarget[];
  institutionKPIs: InstitutionKPITarget[];
  departments: Department[];
  onAddTier: (tier: Omit<KPITier, 'id'>) => void;
  onUpdateTier: (id: string, updates: Partial<KPITier>) => void;
  onDeleteTier: (id: string) => void;
  onUpdateTarget: (tierId: string, phaseId: string, percentage: number) => void;
  onUpdateInstitutionKPI: (phaseId: string, percentage: number) => void;
  onAutoCalculateTierTargets?: () => Promise<void>;
  onUpdateFeasibility?: (payload: any) => Promise<any>;
  onSaveFeasibilityReport?: (report: any) => void;
  feasibilityReport?: any;
  showToast?: (message: string, type?: any) => void;
}

export const KPISettings: React.FC<KPISettingsProps> = ({
  tiers,
  phases,
  tierTargets,
  institutionKPIs,
  departments,
  onAddTier,
  onUpdateTier,
  onDeleteTier,
  onUpdateTarget,
  onUpdateInstitutionKPI,
  onAutoCalculateTierTargets,
  onUpdateFeasibility,
  onSaveFeasibilityReport,
  feasibilityReport: globalFeasibilityReport,
  showToast
}) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [tierToDelete, setTierToDelete] = useState<string | null>(null);
  const [isAutoCalcRunning, setIsAutoCalcRunning] = useState(false);
  const [formData, setFormData] = useState<{ name: string; minAssets: number; targets: Record<string, number> }>({
    name: '',
    minAssets: 0,
    targets: {}
  });


  const sortedPhases = [...phases].sort((a,b) => a.startDate.localeCompare(b.startDate));
  const sortedTiers = [...tiers].sort((a, b) => {
    if (a.minAssets !== b.minAssets) return a.minAssets - b.minAssets;
    return 0;
  });

  const targetsByTier = useMemo(() => {
    // Source of truth is the relational table; this keeps UI consistent even if tiers[] is stale.
    const map = new Map<string, Record<string, number>>();
    for (const row of tierTargets || []) {
      const current = map.get(row.tierId) || {};
      current[row.phaseId] = row.targetPercentage ?? 0;
      map.set(row.tierId, current);
    }
    return map;
  }, [tierTargets]);

  const institutionTotalAssets = useMemo(() => {
    return departments.reduce((sum, d) => sum + (d.totalAssets || 0), 0);
  }, [departments]);

  if (institutionTotalAssets === 0) {
    return (
      <div className="bg-white rounded-[32px] border border-slate-200 shadow-sm overflow-hidden p-12 mt-8 text-center animate-in fade-in">
        <div className="w-16 h-16 bg-slate-100 text-slate-400 rounded-2xl flex items-center justify-center mx-auto mb-6">
          <Lock className="w-8 h-8" />
        </div>
        <h3 className="text-xl font-bold text-slate-900 mb-2">KPI Configuration Locked</h3>
        <p className="text-slate-500 max-w-md mx-auto leading-relaxed">
          You must upload Departments and Locations first. The system requires real asset data to calculate the benchmark department and automatically generate dynamic percentage tiers.
        </p>
      </div>
    );
  }

  const startEdit = (tier: KPITier) => {
    setEditingId(tier.id);
    const currentTargets = targetsByTier.get(tier.id) || tier.targets || {};
    setFormData({
      name: tier.name || '',
      minAssets: tier.minAssets || 0,
      targets: { ...currentTargets }
    });
  };

  const resetForm = () => {
    setEditingId(null);
    setFormData({ name: '', minAssets: 0, targets: {} });
  };

  const handleTargetChange = (phaseId: string, raw: string) => {
    const value = raw === '' ? 0 : Math.max(0, Math.min(100, Number(raw)));
    setFormData(prev => ({ ...prev, targets: { ...prev.targets, [phaseId]: value } }));
  };

  const saveEdit = async () => {
    if (!editingId) return;
    onUpdateTier(editingId, { minAssets: formData.minAssets });
    for (const phase of sortedPhases) {
      const pct = formData.targets[phase.id] ?? 0;
      onUpdateTarget(editingId, phase.id, pct);
    }
    resetForm();
  };



  const autoBalanceTiers = () => {
    const validDepts = departments.filter(d => (d.totalAssets || 0) > 0);
    const totalAssets = validDepts.reduce((sum, d) => sum + (d.totalAssets || 0), 0);

    if (totalAssets === 0 || sortedTiers.length < 3) return;

    validDepts.sort((a,b) => (a.totalAssets || 0) - (b.totalAssets || 0));
    const idx33 = Math.floor(validDepts.length * 0.33);
    const idx66 = Math.floor(validDepts.length * 0.66);

    const val33 = validDepts[idx33]?.totalAssets || 0;
    const val66 = validDepts[idx66]?.totalAssets || 0;

    const p33 = Math.max(1, Math.round((val33 / totalAssets) * 100));
    const p66 = Math.max(p33 + 1, Math.round((val66 / totalAssets) * 100));
    
    // Save to database
    onUpdateTier(sortedTiers[1].id, { minAssets: p33 });
    onUpdateTier(sortedTiers[2].id, { minAssets: p66 });
  };

  const handleDeleteClick = (id: string) => {
    setTierToDelete(id);
  };



  const confirmDelete = () => {
    if (tierToDelete) {
      onDeleteTier(tierToDelete);
      setTierToDelete(null);
    }
  };

  return (
    <>
    <div className="bg-white rounded-[32px] border border-slate-200 shadow-sm overflow-hidden mt-8 max-w-full p-8">
      {/* Institutional KPI Goals */}
      <div className="mb-12">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center shadow-sm border border-blue-100">
            <Building2 className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-xl font-bold text-slate-900 leading-tight">Institutional Inspection KPI Goals</h3>
            <p className="text-sm text-slate-500">Overarching performance targets for the entire institution across all 3 phases.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {sortedPhases.map(phase => {
            const current = institutionKPIs.find(k => k.phaseId === phase.id);
            const targetValue = current?.targetPercentage ?? 0;
            const isEditing = editingId === `inst-${phase.id}`;

            return (
              <div key={phase.id} className={`p-6 rounded-3xl border transition-all ${isEditing ? 'bg-blue-50/50 border-blue-200' : 'bg-slate-50/30 border-slate-100 hover:border-slate-200'}`}>
                <div className="flex items-center justify-between mb-4">
                  <span className="text-[10px] font-black uppercase text-slate-400 tracking-widest">{phase.name}</span>
                  {isEditing ? (
                    <button
                      title="Save KPI target"
                      aria-label="Save KPI target"
                      onClick={() => {
                        onUpdateInstitutionKPI(phase.id, formData.targets[phase.id] || 0);
                        setEditingId(null);
                      }}
                      className="w-7 h-7 bg-blue-600 text-white rounded-lg flex items-center justify-center hover:bg-blue-700 shadow-sm shadow-blue-500/20"
                    >
                      <Check className="w-3.5 h-3.5" />
                    </button>
                  ) : (
                    <button
                      title="Edit KPI target"
                      aria-label="Edit KPI target"
                      onClick={() => {
                        setEditingId(`inst-${phase.id}`);
                        setFormData(prev => ({ ...prev, targets: { ...prev.targets, [phase.id]: targetValue } }));
                      }}
                      className="text-slate-400 hover:text-blue-600 transition-colors"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
                
                <div className="flex items-baseline gap-1">
                  {isEditing ? (
                    <div className="flex items-center gap-2">
                       <input 
                         type="number"
                         min="0"
                         max="100"
                         autoFocus
                         title="Institution KPI target percentage"
                         aria-label="Institution KPI target percentage"
                         placeholder="0"
                         className="w-20 text-3xl font-black bg-transparent border-b-2 border-blue-500 text-slate-900 outline-none p-0"
                         value={formData.targets[phase.id] ?? ''}
                         onChange={(e) => handleTargetChange(phase.id, e.target.value)}
                       />
                       <span className="text-xl font-bold text-slate-400">%</span>
                    </div>
                  ) : (
                    <>
                      <span className="text-4xl font-black text-slate-900 leading-none">{targetValue}</span>
                      <span className="text-xl font-bold text-slate-400">%</span>
                    </>
                  )}
                </div>
                <div className="mt-2 text-[11px] font-medium text-slate-500">Global Target</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Section header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h3 className="text-xl font-bold text-slate-900">Inspection Completion KPI Targets</h3>
          <p className="text-sm text-slate-500 mt-0.5">
            Set percentage boundaries to group your departments into Small, Medium, and Large.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {onAutoCalculateTierTargets && (
            <button 
              onClick={async () => {
                setIsAutoCalcRunning(true);
                try { await onAutoCalculateTierTargets(); } finally { setIsAutoCalcRunning(false); }
              }}
              disabled={isAutoCalcRunning}
              className="flex items-center gap-2 px-4 py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-xl font-bold text-[13px] transition-all border border-blue-200 shadow-sm disabled:opacity-50 hover:scale-102 active:scale-98"
            >
              <Sparkles className={`w-4 h-4 ${isAutoCalcRunning ? 'animate-spin' : ''}`} />
              {isAutoCalcRunning ? 'Calculating...' : 'Auto-Calculate Targets'}
            </button>
          )}
          <button 
            onClick={autoBalanceTiers}
            className="flex items-center gap-2 px-4 py-2 bg-slate-100/50 hover:bg-slate-100 text-slate-700 rounded-xl font-bold text-[13px] transition-all border border-slate-200 shadow-sm hover:scale-102 active:scale-98"
          >
            <Boxes className="w-4 h-4 text-blue-600" />
            Auto-Balance Tiers
          </button>
        </div>
      </div>

      {/* Tiers Table */}
      {(!sortedTiers || sortedTiers.length === 0) ? (
        <div className="py-12 text-center text-slate-400 italic text-sm border border-slate-200/80 rounded-2xl bg-white mb-0">
          No asset tiers defined. Add a tier to start tracking KPIs.
        </div>
      ) : (
        <div className="border border-slate-200/80 rounded-2xl overflow-hidden bg-white mb-0">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/75 border-b border-slate-200/80">
                <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400">Tier</th>
                <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400">Asset Range</th>
                {sortedPhases.map(phase => (
                  <th key={phase.id} className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400 text-center">
                    {phase.name}
                    <span className="block text-[9px] font-normal opacity-60 normal-case tracking-normal">Target %</span>
                  </th>
                ))}
                <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(() => {
                const TIER_STYLES = [
                  { badge: 'bg-emerald-100 text-emerald-700 border-emerald-200', bar: 'bg-emerald-500', ring: 'ring-emerald-200' },
                  { badge: 'bg-amber-100 text-amber-700 border-amber-200',       bar: 'bg-amber-500',   ring: 'ring-amber-200' },
                  { badge: 'bg-blue-100 text-blue-700 border-blue-200',          bar: 'bg-blue-500',    ring: 'ring-blue-200' },
                  { badge: 'bg-purple-100 text-purple-700 border-purple-200',    bar: 'bg-purple-500',  ring: 'ring-purple-200' },
                ];
                return sortedTiers.map((tier, idx) => {
                  const isEditing = editingId === tier.id;
                  const style = TIER_STYLES[idx % TIER_STYLES.length];
                  const nextMin = sortedTiers[idx + 1]?.minAssets ?? 100;
                  const isLast = idx === sortedTiers.length - 1;

                  return (
                    <tr
                      key={tier.id}
                      className={`transition-colors hover:bg-slate-50/30 ${
                        isEditing ? 'bg-blue-50/30' : ''
                      }`}
                    >
                      {/* Tier name */}
                      <td className="px-6 py-4 align-middle">
                        <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-black border ${style.badge}`}>
                          {tier.name}
                        </span>
                      </td>

                      {/* Asset range */}
                      <td className="px-6 py-4 align-middle">
                        {isEditing ? (
                          <div className="flex items-center gap-1.5">
                            <input
                              type="number"
                              min={0}
                              max={100}
                              disabled={tier.id === sortedTiers[0].id}
                              title="Minimum asset threshold percentage"
                              aria-label="Minimum asset threshold percentage"
                              placeholder="0"
                              className="w-20 px-2 py-1 bg-white border border-slate-200 rounded-lg text-xs font-bold focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 disabled:bg-slate-100 disabled:text-slate-400"
                              value={formData.minAssets}
                              onChange={e => setFormData({ ...formData, minAssets: parseInt(e.target.value) || 0 })}
                            />
                            <span className="text-xs text-slate-400 font-bold">%</span>
                          </div>
                        ) : (
                          <div>
                            <span className="text-sm font-bold text-slate-800">
                              {tier.minAssets}%{isLast ? ' and above' : ` – ${nextMin - 1}%`}
                            </span>
                            <span className="block text-[11px] text-slate-400 mt-0.5 font-medium">
                              {Math.round(institutionTotalAssets * (tier.minAssets / 100)).toLocaleString()}
                              {isLast
                                ? ' assets +'
                                : ` – ${(Math.round(institutionTotalAssets * (nextMin / 100)) - 1).toLocaleString()} assets`}
                            </span>
                          </div>
                        )}
                      </td>

                      {/* Phase targets */}
                      {sortedPhases.map(phase => {
                        const val = targetsByTier.get(tier.id)?.[phase.id] ?? tier.targets?.[phase.id] ?? 0;
                        return (
                          <td key={phase.id} className="px-6 py-4 text-center align-middle">
                            {isEditing ? (
                              <div className="inline-flex items-center gap-1">
                                <input
                                  type="number"
                                  min="0"
                                  max="100"
                                  title={`${phase.name} target percentage`}
                                  aria-label={`${phase.name} target percentage`}
                                  className="w-16 px-2 py-1 bg-white border border-slate-200 rounded-lg text-xs font-bold text-center focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                                  value={formData.targets[phase.id] ?? ''}
                                  placeholder="0"
                                  onChange={e => handleTargetChange(phase.id, e.target.value)}
                                />
                                <span className="text-[10px] text-slate-400">%</span>
                              </div>
                            ) : (
                              <span className={`text-sm font-black ${val ? 'text-slate-800' : 'text-slate-300'}`}>
                                {val}%
                              </span>
                            )}
                          </td>
                        );
                      })}

                      {/* Actions */}
                      <td className="px-6 py-4 text-right align-middle">
                        <div className="flex justify-end gap-1.5">
                          {isEditing ? (
                            <>
                              <button title="Save tier" aria-label="Save tier" onClick={saveEdit} className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center hover:bg-blue-700 shadow-md shadow-blue-500/20 transition-all active:scale-95">
                                <Check className="w-4 h-4" />
                              </button>
                              <button title="Cancel edit" aria-label="Cancel edit" onClick={resetForm} className="w-8 h-8 rounded-lg bg-slate-200 text-slate-600 flex items-center justify-center hover:bg-slate-300 transition-all active:scale-95">
                                <X className="w-4 h-4" />
                              </button>
                            </>
                          ) : (
                            <button title="Edit tier" aria-label="Edit tier" onClick={() => startEdit(tier)} className="w-8 h-8 rounded-lg border border-slate-200 text-slate-400 hover:text-blue-600 hover:border-blue-200 hover:bg-blue-50 flex items-center justify-center transition-all active:scale-95">
                              <Pencil className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                });
              })()}
            </tbody>
          </table>
        </div>
      )}
    </div>
    <ConfirmationModal 
      isOpen={!!tierToDelete}
      title="Remove Asset Tier?"
      message="This will delete this KPI tier and all associated phase targets. This action is permanent."
      confirmLabel="Yes, Delete Tier"
      cancelLabel="Cancel"
      onConfirm={confirmDelete}
      onCancel={() => setTierToDelete(null)}
      variant="danger"
    />
    </>
  );
};
