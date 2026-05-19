import React from 'react';
import { Sparkles, ClipboardCheck, Activity, Brain, LayoutGrid, Zap, Info } from 'lucide-react';

interface FeasibilityAnalysisProps {
  projectedKPIPercentage: number;
  projectedAssetsMet: number;
  overallTotalAssets: number;
  feasibilityReport: any;
}

export const FeasibilityAnalysis: React.FC<FeasibilityAnalysisProps> = ({
  projectedKPIPercentage,
  projectedAssetsMet,
  overallTotalAssets,
  feasibilityReport
}) => {
  return (
    <div className="space-y-8">
       <div className="bg-slate-900 rounded-[32px] p-8 text-white relative overflow-hidden">
          <div className="absolute top-0 right-0 p-8 opacity-10"><Sparkles className="w-24 h-24" /></div>
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 mb-2">Institutional Target Achievement</p>
          <div className="text-5xl font-black italic tracking-tighter mb-6">{projectedKPIPercentage.toFixed(1)}%</div>
          <div className="h-2 w-full bg-slate-800 rounded-full overflow-hidden">
            {/* biome-ignore lint/style/noInlineStyle: Dynamic progress bar width */}
            <div className="h-full bg-indigo-500 transition-all duration-1000 [width:var(--pct)]" style={{ '--pct': `${projectedKPIPercentage}%` } as React.CSSProperties} />
          </div>
          <p className="text-[10px] font-medium text-slate-500 mt-4">Projected Coverage: {projectedAssetsMet.toLocaleString()} / {overallTotalAssets.toLocaleString()} Movable Assets.</p>
       </div>

       {feasibilityReport && (
          <div className="animate-in fade-in slide-in-from-top-4 duration-1000">
            <div className="flex items-center gap-3 mb-6 px-2">
              <ClipboardCheck className="w-5 h-5 text-indigo-500" />
              <h3 className="text-xl font-black text-slate-900 tracking-tight">AI Strategic Analysis</h3>
              <div className={`px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest ${
                feasibilityReport.riskLevel === 'Low' ? 'bg-emerald-100 text-emerald-600' :
                feasibilityReport.riskLevel === 'Medium' ? 'bg-amber-100 text-amber-600' :
                'bg-rose-100 text-rose-600'
              }`}>
                {feasibilityReport.riskLevel} Risk
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Math Analysis */}
              <div className="p-8 rounded-[32px] border-2 border-indigo-100 bg-linear-to-br from-white to-indigo-50/30">
                <div className="flex items-center justify-between mb-6">
                  <div className="w-10 h-10 rounded-xl bg-indigo-100 text-indigo-600 flex items-center justify-center">
                    <Activity className="w-5 h-5" />
                  </div>
                  <div className="text-xs font-black text-indigo-400 uppercase tracking-tighter">Math Score: {feasibilityReport.mathematicalAnalysis?.loadBalanceScore || 0}%</div>
                </div>
                <h4 className="text-sm font-black text-slate-900 uppercase tracking-widest mb-3">Mathematical Balance</h4>
                <p className="text-xs text-slate-600 leading-relaxed mb-6 font-medium">
                  {feasibilityReport.mathematicalAnalysis?.summary || 'Comprehensive capacity analysis of assets vs. certified headcount.'}
                </p>
                <div className="space-y-2">
                  {feasibilityReport.mathematicalAnalysis?.logisticalRisks?.map((risk: string, i: number) => (
                    <div key={i} className="flex items-start gap-2.5 px-3 py-2 bg-white/60 border border-indigo-50 rounded-xl text-[10px] font-bold text-slate-600">
                      <Info className="w-3 h-3 text-indigo-400 mt-0.5 shrink-0" />
                      {risk}
                    </div>
                  ))}
                </div>
              </div>

              {/* Thematic Analysis */}
              <div className="p-8 rounded-[32px] border-2 border-emerald-100 bg-linear-to-br from-white to-emerald-50/30">
                <div className="flex items-center justify-between mb-6">
                  <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-600 flex items-center justify-center">
                    <Brain className="w-5 h-5" />
                  </div>
                  <div className="text-xs font-black text-emerald-400 uppercase tracking-tighter">Synergy: {feasibilityReport.thematicAnalysis?.affinityScore || 0}%</div>
                </div>
                <h4 className="text-sm font-black text-slate-900 uppercase tracking-widest mb-3">Thematic Synergy</h4>
                <p className="text-xs text-slate-600 leading-relaxed mb-6 font-medium">
                  {feasibilityReport.thematicAnalysis?.summary || 'Qualitative assessment of department affinity and technical compatibility.'}
                </p>
                <div className="space-y-2">
                  {feasibilityReport.thematicAnalysis?.synergyObservations?.map((obs: string, i: number) => (
                    <div key={i} className="flex items-start gap-2.5 px-3 py-2 bg-white/60 border border-emerald-50 rounded-xl text-[10px] font-bold text-slate-600">
                      <LayoutGrid className="w-3 h-3 text-emerald-400 mt-0.5 shrink-0" />
                      {obs}
                    </div>
                  ))}
                </div>
              </div>
            </div>

           <div className="mt-8 p-6 bg-slate-50 rounded-[28px] border border-slate-100">
              <div className="flex items-center gap-2 mb-4">
                <Zap className="w-4 h-4 text-amber-500" />
                <span className="text-[10px] font-black uppercase text-slate-500">Overall Strategy Advice</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {feasibilityReport.recommendations?.slice(0, 4).map((rec: string, i: number) => (
                  <div key={i} className="flex items-start gap-3 p-4 bg-white rounded-2xl border border-slate-100 shadow-xs">
                    <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 mt-1.5 shrink-0" />
                    <p className="text-[10px] font-bold text-slate-700 leading-relaxed">{rec}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
       )}
    </div>
  );
};
