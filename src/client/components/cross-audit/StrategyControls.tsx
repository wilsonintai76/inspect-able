import React from 'react';
import { Zap, Loader2, CheckCheck, Wand2, Ban } from 'lucide-react';
import { Department } from '@shared/types';

interface StrategyControlsProps {
  pairingStrategy: 'mutual' | 'asymmetric' | 'hybrid';
  setPairingStrategy: (v: 'mutual' | 'asymmetric' | 'hybrid') => void;
  pairingMode: 'assets' | 'assets_auditors';
  setPairingMode: (v: 'assets' | 'assets_auditors') => void;
  dailyInspectionCapacity: number;
  onUpdateDailyInspectionCapacity: (v: number) => void;
  maxAssetsPerDay: number;
  onUpdateMaxAssetsPerDay: (v: number) => void;
  maxLocationsPerDay: number;
  onUpdateMaxLocationsPerDay: (v: number) => void;
  minAuditorsPerLocation: number;
  onUpdateMinAuditorsPerLocation: (v: number) => void;
  simulateIdealStaffing: boolean;
  setSimulateIdealStaffing: (v: boolean) => void;
  isSimulatorActive: boolean;
  setIsSimulatorActive: (v: boolean) => void;
  isProcessing: boolean;
  handleRunSimulator: () => void;
  handleCommitSimulation: () => void;
  pairingLocked: boolean;
  exemptedDepts: Department[];
  onCancelDraft: () => void;
  pairingAssetMargin: number;
  pairingAuditorMargin: number;
  onUpdatePairingMargins: (assets: number, auditors: number) => void;
}

export const StrategyControls: React.FC<StrategyControlsProps> = ({
  pairingStrategy,
  setPairingStrategy,
  pairingMode,
  setPairingMode,
  dailyInspectionCapacity,
  onUpdateDailyInspectionCapacity,
  maxAssetsPerDay,
  onUpdateMaxAssetsPerDay,
  maxLocationsPerDay,
  onUpdateMaxLocationsPerDay,
  minAuditorsPerLocation,
  onUpdateMinAuditorsPerLocation,
  simulateIdealStaffing,
  setSimulateIdealStaffing,
  isSimulatorActive,
  setIsSimulatorActive,
  isProcessing,
  handleRunSimulator,
  handleCommitSimulation,
  pairingLocked,
  exemptedDepts,
  onCancelDraft,
  pairingAssetMargin,
  pairingAuditorMargin,
  onUpdatePairingMargins
}) => {
  return (
    <div className="lg:w-1/3 space-y-8">
       <div className={`p-8 rounded-[32px] border-2 transition-all ${isSimulatorActive ? 'bg-amber-50 border-amber-200' : 'bg-slate-50 border-slate-100'}`}>
          <div className="w-12 h-12 rounded-2xl bg-white shadow-sm flex items-center justify-center mb-6">
            <Zap className={`w-6 h-6 ${isSimulatorActive ? 'text-amber-500' : 'text-indigo-500'}`} />
          </div>
             <div className="space-y-6">
                <div>
                   <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-3">Institutional Flow</p>
                   <div className="flex bg-white/50 p-1 rounded-xl border border-slate-200 gap-1">
                      <button onClick={() => setPairingStrategy('asymmetric')} className={`flex-1 py-2 rounded-lg text-[10px] font-black uppercase transition-all ${pairingStrategy === 'asymmetric' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-400'}`}>Asymmetric</button>
                      <button onClick={() => setPairingStrategy('mutual')} className={`flex-1 py-2 rounded-lg text-[10px] font-black uppercase transition-all ${pairingStrategy === 'mutual' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-400'}`}>Mutual</button>
                      <button onClick={() => setPairingStrategy('hybrid')} className={`flex-1 py-2 rounded-lg text-[10px] font-black uppercase transition-all ${pairingStrategy === 'hybrid' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-400'}`}>Hybrid</button>
                   </div>
                </div>

                <div>
                   <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-3">Calculation Mode</p>
                   <div className="flex bg-white/50 p-1 rounded-xl border border-slate-200 gap-1">
                      <button onClick={() => setPairingMode('assets')} className={`flex-1 py-2 rounded-lg text-[10px] font-black uppercase transition-all ${pairingMode === 'assets' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-400'}`}>Assets</button>
                      <button onClick={() => setPairingMode('assets_auditors')} className={`flex-1 py-2 rounded-lg text-[10px] font-black uppercase transition-all ${pairingMode === 'assets_auditors' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-400'}`}>Capacity</button>
                   </div>
                </div>

                <div className="space-y-6">
                   <div className="space-y-3">
                     <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest block">Daily Team Capacity (Workload)</label>
                     <div className="flex items-center gap-4">
                       <input 
                         type="range" 
                         title="Daily team inspection capacity"
                         min="500" 
                         max="2500" 
                         step="100"
                         value={dailyInspectionCapacity || 1500}
                         onChange={(e) => onUpdateDailyInspectionCapacity?.(parseInt(e.target.value))}
                         className="grow h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                       />
                       <span className="text-[11px] font-black text-slate-700 min-w-12 tabular-nums italic">{dailyInspectionCapacity || 1500}</span>
                     </div>
                   </div>

                   <div className="space-y-3">
                     <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest block">Max assets / Day</label>
                     <div className="flex items-center gap-4">
                       <input 
                         type="range" 
                         title="Maximum assets per day"
                         min="100" 
                         max="2000" 
                         step="50"
                         value={maxAssetsPerDay}
                         onChange={(e) => onUpdateMaxAssetsPerDay?.(parseInt(e.target.value))}
                         className="grow h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-amber-500"
                       />
                       <span className="text-[11px] font-black text-slate-700 min-w-12 tabular-nums italic">{maxAssetsPerDay}</span>
                     </div>
                   </div>

                   <div className="space-y-3">
                     <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest block">Max Locations / Day</label>
                     <div className="flex items-center gap-4">
                       <input 
                         type="range" 
                         title="Maximum locations per day"
                         min="5" 
                         max="30" 
                         step="1"
                         value={maxLocationsPerDay}
                         onChange={(e) => onUpdateMaxLocationsPerDay?.(parseInt(e.target.value))}
                         className="grow h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                       />
                       <span className="text-[11px] font-black text-slate-700 min-w-12 tabular-nums italic">{maxLocationsPerDay}</span>
                     </div>
                   </div>

                   <div className="space-y-3">
                     <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest block">Min auditors / Location</label>
                     <div className="flex items-center gap-4">
                       <input 
                         type="range" 
                         title="Minimum auditors per location"
                         min="1" 
                         max="5" 
                         step="1"
                         value={minAuditorsPerLocation}
                         onChange={(e) => onUpdateMinAuditorsPerLocation?.(parseInt(e.target.value))}
                         className="grow h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-500"
                       />
                       <span className="text-[11px] font-black text-slate-700 min-w-12 tabular-nums italic">{minAuditorsPerLocation}</span>
                     </div>
                   </div>

                   {/* Matching Gap Controls */}
                   <div className="space-y-3 pt-4 border-t border-slate-200/50">
                      <div className="flex items-center justify-between">
                         <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Asset Matching Gap</label>
                         <span className="text-[11px] font-black text-indigo-500 italic">± {pairingAssetMargin}</span>
                      </div>
                      <input 
                        type="range" 
                        title="Asset matching gap tolerance"
                        min="0" 
                        max="5000" 
                        step="100"
                        value={pairingAssetMargin}
                        onChange={(e) => onUpdatePairingMargins(parseInt(e.target.value), pairingAuditorMargin)}
                        className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-400"
                      />
                   </div>

                   <div className="space-y-3">
                      <div className="flex items-center justify-between">
                         <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Auditor Matching Gap</label>
                         <span className="text-[11px] font-black text-emerald-500 italic">± {pairingAuditorMargin} staff</span>
                      </div>
                      <input 
                        type="range" 
                        title="Auditor matching gap tolerance"
                        min="0" 
                        max="20" 
                        step="1"
                        value={pairingAuditorMargin}
                        onChange={(e) => onUpdatePairingMargins(pairingAssetMargin, parseInt(e.target.value))}
                        className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-emerald-400"
                      />
                   </div>

                   <label className="flex items-center justify-between cursor-pointer group pt-2">
                       <span className="text-[10px] font-black uppercase text-slate-500">Ideal Staffing Simulation</span>
                      <input type="checkbox" className="sr-only peer" checked={simulateIdealStaffing} onChange={() => setSimulateIdealStaffing(!simulateIdealStaffing)} />
                      <div className="w-9 h-5 bg-slate-200 rounded-full peer peer-checked:bg-indigo-600 relative after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-full"></div>
                   </label>
                </div>
             </div>

             {isSimulatorActive ? (
                <div className="pt-6 space-y-3">
                   <button onClick={handleCommitSimulation} disabled={isProcessing} className="w-full py-4 bg-slate-900 text-white rounded-2xl text-xs font-black uppercase tracking-widest shadow-xl flex items-center justify-center gap-2 hover:bg-black transition-all">
                     {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCheck className="w-4 h-4" />}
                     Commit & Lock
                   </button>
                   <button onClick={onCancelDraft} className="w-full py-4 bg-white border border-slate-200 text-slate-500 rounded-2xl text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-slate-50 transition-all">
                     Cancel Draft
                   </button>
                </div>
             ) : (
                <button onClick={handleRunSimulator} disabled={isProcessing || pairingLocked} className="w-full py-4 bg-indigo-600 text-white rounded-2xl text-xs font-black uppercase tracking-widest shadow-xl shadow-indigo-600/20 flex items-center justify-center gap-2 hover:bg-indigo-700 transition-all disabled:opacity-50 mt-6">
                  {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
                  {pairingLocked ? 'Pairing Locked' : 'Run Auto-Pairing'}
                </button>
             )}
          </div>

        {exemptedDepts.length > 0 && (
          <div className="p-6 rounded-[28px] border border-rose-100 bg-rose-50/50">
            <div className="flex items-center gap-2 mb-4">
              <Ban className="w-4 h-4 text-rose-400" />
              <span className="text-[10px] font-black uppercase text-rose-500">Exempted Departments</span>
            </div>
            <div className="flex flex-wrap gap-2">
               {exemptedDepts.map(d => <span key={d.id} className="px-2 py-1 bg-white border border-rose-100 rounded-lg text-[9px] font-black uppercase text-rose-400">{d.name}</span>)}
            </div>
          </div>
        )}
    </div>
  );
};
