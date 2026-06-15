import React from 'react';
import { Loader2, Sparkles, Users, ShieldCheck, Layers } from 'lucide-react';
import { AuditGroup } from '@shared/types';

interface AuditConstraintsProps {
  maxAssetsPerDay: number;
  onUpdateMaxAssetsPerDay: (value: number) => void;
  maxLocationsPerDay: number;
  onUpdateMaxLocationsPerDay: (value: number) => void;
  minAuditorsPerLocation: number;
  onUpdateMinAuditorsPerLocation: (value: number) => void;
  dailyInspectionCapacity: number;
  onUpdateDailyInspectionCapacity: (value: number) => void;
  standaloneThresholdAssets: number;
  onUpdateStandaloneThresholdAssets: (value: number) => void;
  onAutoOptimize?: () => void;
  isOptimizing?: boolean;
  activeAuditors?: number;
  totalAssets?: number;
  isSimulatorActive?: boolean;
}

export const AuditConstraints: React.FC<AuditConstraintsProps> = ({
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
  onAutoOptimize,
  isOptimizing = false,
  activeAuditors = 0,
  totalAssets = 0,
  isSimulatorActive = false,
}) => {
  // Hardcode policy to 2
  const policyMinAuditors = 2;
  // Projection math (Workload-based)
  const auditorTeams = Math.floor((activeAuditors || 0) / policyMinAuditors);
  
  const DAILY_WORKLOAD_CAPACITY = 1500; // Standard target assets/load per day per team
  
  // Use either the explicit daily capacity or our workload standard
  const workloadCapacity = auditorTeams * (dailyInspectionCapacity || DAILY_WORKLOAD_CAPACITY); 
  const totalDailyCapacity = auditorTeams * DAILY_WORKLOAD_CAPACITY;
  
  const daysToFinish = workloadCapacity > 0 ? Math.ceil((totalAssets || 0) / workloadCapacity) : 0;
  const monthCompletion = (totalAssets || 0) > 0 
    ? Math.min(100, Math.round(((workloadCapacity * 20) / (totalAssets || 1)) * 100)) 
    : 0;

  const progressBarRef = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (progressBarRef.current) {
      progressBarRef.current.style.setProperty('--w', `${monthCompletion}%`);
    }
  }, [monthCompletion]);

  return (
    <div className={`bg-white border-2 rounded-[32px] p-8 shadow-sm transition-all duration-500 ${isSimulatorActive ? 'border-amber-200 bg-amber-50/5' : 'border-slate-100'}`}>
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8 pb-6 border-b border-slate-50">
        <div>
          <h3 className="text-xl font-bold text-slate-800">Operational Strategy & Safety Policies</h3>
          <p className="text-sm text-slate-500 font-medium">Control the institutional pace and safety minimums for all automated pairings.</p>
        </div>
        {onAutoOptimize && (
          <button
            onClick={onAutoOptimize}
            disabled={isOptimizing}
            className="group flex items-center gap-3 px-6 py-3 bg-slate-900 hover:bg-slate-800 text-white rounded-2xl font-black text-xs uppercase tracking-widest transition-all shadow-xl shadow-slate-200 disabled:opacity-50 active:scale-95"
          >
            {isOptimizing ? (
              <Loader2 className="w-4 h-4 animate-spin text-emerald-400" />
            ) : (
              <Sparkles className="w-4 h-4 text-emerald-400 group-hover:rotate-12 transition-transform" />
            )}
            {isOptimizing ? 'Analyzing Capacity...' : 'AI Auto-Optimize Strategy'}
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-8">
        <div className="lg:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="space-y-4">
            <label className="text-xs font-black uppercase text-slate-400 tracking-widest block">Min Inspectors Per Location</label>
            <div className="relative">
              <input 
                type="number"
                readOnly
                title="Minimum inspectors per location (fixed policy)"
                className="w-full px-4 py-4 bg-slate-100/50 border-2 border-slate-200 rounded-2xl text-base font-black text-slate-400 cursor-not-allowed outline-none"
                value={policyMinAuditors}
              />
              <div className="absolute top-1/2 -right-2 -translate-y-1/2 -rotate-12 translate-x-1/2">
                 <div className="px-2 py-1 bg-red-600 text-white rounded-lg text-[8px] font-black uppercase tracking-wider shadow-lg">Fixed Policy</div>
              </div>
            </div>
            <p className="text-[10px] text-red-400 font-bold leading-relaxed">Standard Institutional Safety: Minimum 2 officers required per inspection.</p>
          </div>

          <div className="space-y-4">
            <label className="text-xs font-black uppercase text-indigo-500 tracking-widest block">Standalone Workload Threshold (Assets)</label>
            <input 
              type="number"
              min="500"
              max="1500"
              step="50"
              title="Standalone workload threshold in assets"
              placeholder="1000"
              className="w-full px-4 py-4 bg-indigo-50/30 border-2 border-indigo-100/50 rounded-2xl text-base font-black text-slate-900 focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none transition-all"
              value={standaloneThresholdAssets}
              onChange={(e) => onUpdateStandaloneThresholdAssets(parseInt(e.target.value, 10) || 1000)}
            />
            <p className="text-[10px] text-indigo-400 font-bold leading-relaxed">Magnitude Trigger: Recommended 800–1000 assets. Units above this audit themselves.</p>
          </div>



          <div className="md:col-span-2 p-6 bg-slate-50 border border-slate-100 rounded-2xl opacity-60 pointer-events-none">
             <div className="flex items-center justify-between">
                <div>
                   <span className="block text-[10px] font-black uppercase text-slate-400 tracking-widest mb-1">Implicit Daily Capacity (Workload)</span>
                   <span className="text-xl font-bold text-slate-600">{DAILY_WORKLOAD_CAPACITY.toLocaleString()} per team</span>
                </div>
                <div className="text-right">
                   <span className="block text-[10px] font-black uppercase text-indigo-400 tracking-widest mb-1">Projected Monthly Capacity</span>
                   <span className="text-xl font-bold text-slate-600">~{(workloadCapacity * 20).toLocaleString()}</span>
                </div>
             </div>
          </div>
        </div>

        {/* Projection Sidebar */}
        <div className="bg-slate-900 rounded-3xl p-6 text-white relative overflow-hidden shadow-2xl">
          <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/10 blur-[60px]"></div>
          <div className="relative z-10 flex flex-col h-full">
            <div className="text-[10px] font-black uppercase text-indigo-400 tracking-[0.2em] mb-6">Resource Health Signal</div>
            
            <div className="space-y-6 grow">
               <div className="flex items-center justify-between bg-white/5 border border-white/10 rounded-2xl p-4 transition-all hover:bg-white/10">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-indigo-500/10 rounded-xl flex items-center justify-center">
                       <Users className="w-5 h-5 text-indigo-400" />
                    </div>
                    <div>
                       <span className="block text-2xl font-black">{activeAuditors}</span>
                       <span className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest">Active Staff</span>
                    </div>
                 </div>
                 <div className="text-right">
                    <span className="block text-xl font-black text-emerald-400">{auditorTeams}</span>
                    <span className="block text-[8px] font-bold text-slate-500 uppercase">Available Teams</span>
                 </div>
               </div>
               
               <div className="px-1 flex justify-between items-center text-[8px] font-black uppercase text-slate-600 tracking-tighter">
                  <span>Resource Pool: {activeAuditors} Staff</span>
               </div>

                <div className="p-4 bg-white/5 border border-white/10 rounded-2xl">
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">Efficiency Projection</span>
                    <span className={`text-xs font-black px-2 py-0.5 rounded-md ${monthCompletion > 80 ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400'}`}>
                      {monthCompletion}% Phase Completion
                    </span>
                  </div>
                  <div className="h-4 bg-white/5 rounded-full overflow-hidden mb-3 p-1" ref={progressBarRef}>
                     <div className="h-full bg-linear-to-r from-indigo-500 to-emerald-400 rounded-full transition-all duration-1000 w-(--w,0%)" />
                  </div>
                  <div className="flex justify-between items-center text-[10px] mb-2 px-1">
                     <span className="text-slate-400">Capacity: {(workloadCapacity).toLocaleString()} / day</span>
                     <span className="text-indigo-400 font-bold">Total Load: {(totalAssets).toLocaleString()} assets</span>
                  </div>
                  <p className="text-[10px] text-slate-500 font-medium leading-normal italic">
                    {daysToFinish > 0 
                      ? `Based on current staff, your team can complete the institutional audit in approximately ${daysToFinish} working days.`
                      : 'Assign staff to see completion projections.'}
                  </p>
               </div>
            </div>

            <div className="mt-6 pt-6 border-t border-white/5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                 <ShieldCheck className="w-4 h-4 text-indigo-500" />
                 <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Security: Hard Policy Enabled</span>
              </div>
              <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

