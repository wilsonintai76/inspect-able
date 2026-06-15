import React from 'react';
import { 
  MapPin, 
  Package, 
  CheckCircle2, 
  FileText, 
  Clock, 
  Lock, 
  Unlock, 
  ExternalLink 
} from 'lucide-react';
import { Location } from '@shared/types';
import { StatCard } from '../Widgets';

interface SupervisorViewProps {
  supLocations: Location[];
  supStats: {
    totalLocs: number;
    totalAssets: number;
    completed: number;
    pending: number;
    inProgress: number;
    progress: number;
  };
  supPendingApprovals: any[];
  onToggleLock?: (id: string) => Promise<void>;
}

export const SupervisorView: React.FC<SupervisorViewProps> = ({
  supLocations,
  supStats,
  supPendingApprovals,
  onToggleLock,
}) => {
  const renderAssetBreakdownSummary = (statuses: Record<string, number> | null | undefined) => {
    if (!statuses || Object.keys(statuses).length === 0) return <span className="text-slate-400 font-medium">No details</span>;
    return (
      <div className="flex flex-wrap gap-1.5 justify-center">
        {Object.entries(statuses).map(([key, val]) => {
          if (!val) return null;
          let badgeColor = "bg-slate-50 text-slate-600 border-slate-100";
          if (key === 'In Use') badgeColor = "bg-emerald-50 text-emerald-700 border-emerald-100";
          if (key === 'Broken') badgeColor = "bg-rose-50 text-rose-700 border-rose-100";
          if (key === 'Under Maintenance') badgeColor = "bg-amber-50 text-amber-700 border-amber-100";
          if (key === 'Borrowed') badgeColor = "bg-blue-50 text-blue-700 border-blue-100";
          if (key === 'Missing') badgeColor = "bg-red-50 text-red-700 border-red-100";
          
          return (
            <span key={key} className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[9px] font-extrabold border ${badgeColor}`}>
              {key[0]}:{val}
            </span>
          );
        })}
      </div>
    );
  };

  if (supLocations.length === 0) {
    return (
      <div className="rounded-3xl border border-dashed border-slate-300 p-8 text-center bg-slate-50">
        <MapPin className="w-12 h-12 text-slate-400 mx-auto mb-3" />
        <h3 className="text-lg font-bold text-slate-800 mb-1">No Supervised Locations</h3>
        <p className="text-sm text-slate-500 max-w-md mx-auto">
          You are currently not listed as the supervisor for any active location assets. Check with your Coordinator to assign supervisor roles on department locations.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Supervisor Info Header */}
      <div className="bg-slate-900 text-white rounded-3xl p-6 relative overflow-hidden shadow-xl">
        <div className="absolute top-0 right-0 p-8 opacity-10">
          <MapPin className="w-32 h-32 text-white" />
        </div>
        <div className="relative z-10">
          <span className="text-[10px] font-black text-indigo-300 uppercase tracking-widest bg-indigo-950/60 px-2.5 py-1 rounded-md">
            Supervisor Workspace
          </span>
          <h2 className="text-2xl font-black mt-2 tracking-tight">
            Supervised Site Management
          </h2>
          <p className="text-xs text-slate-300 mt-1 max-w-xl">
            Verifying completed audits, managing assets and reporting pipelines for your {supLocations.length} supervised locations.
          </p>
        </div>
      </div>

      {/* Supervisor Stat Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard icon={MapPin} label="Supervised Sites" value={supStats.totalLocs} color="text-slate-800" />
        <StatCard icon={Package} label="Supervised Assets" value={supStats.totalAssets.toLocaleString()} color="text-blue-600" />
        <StatCard icon={CheckCircle2} label="Approved & Completed" value={supStats.completed} color="text-emerald-600" />
      </div>

      {/* Approval Pipeline Widget */}
      <div className="bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-sm">
        <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50/30">
          <h3 className="text-sm font-black text-slate-800 flex items-center gap-2">
            <FileText className="w-4 h-4 text-emerald-500" />
            Completed Audits Approval Pipeline
          </h3>
          <span className="inline-flex px-2 py-0.5 bg-amber-50 text-amber-700 rounded-lg text-[9px] font-black border border-amber-100">
            Awaiting HOD Lock: {supPendingApprovals.filter(s => !s.isLocked).length}
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-[10px] font-black text-slate-400 uppercase">
              <tr>
                <th className="px-5 py-3">Location Name</th>
                <th className="px-4 py-3">Inspection Date</th>
                <th className="px-4 py-3 text-center">Inspectors</th>
                <th className="px-4 py-3 text-center">Total Assets</th>
                <th className="px-4 py-3 text-center">Verified Assets</th>
                <th className="px-4 py-3 text-center">Asset Breakdown</th>
                <th className="px-4 py-3 text-center">Report Upload</th>
                <th className="px-5 py-3 text-right">Lock Status & Approval</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {supPendingApprovals.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-5 py-8 text-center text-slate-400 font-medium">
                    No completed inspections at your supervised locations yet.
                  </td>
                </tr>
              ) : (
                supPendingApprovals.map(s => {
                  const hasReport = !!s.reportPath;
                  const isLocked = s.isLocked === true;
                  return (
                    <tr key={s.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-5 py-3">
                        <div className="font-bold text-slate-800">{s.locationName}</div>
                        <div className="text-[10px] text-slate-400">Dept: {s.deptAbbr}</div>
                      </td>
                      <td className="px-4 py-3 font-medium text-slate-600">
                        {s.date ? new Date(s.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <div className="text-slate-700 font-bold">{s.auditor1Name}</div>
                        <div className="text-[10px] text-slate-400">{s.auditor2Name}</div>
                      </td>
                      <td className="px-4 py-3 text-center font-bold text-slate-800">
                        {s.totalAssets}
                      </td>
                      <td className="px-4 py-3 text-center font-bold text-slate-800">
                        {s.verifiedAssetCount ?? '—'}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {renderAssetBreakdownSummary(s.assetStatuses)}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {hasReport ? (
                          <button
                            onClick={() => window.open(s.reportPath!, '_blank')}
                            className="inline-flex items-center gap-1.5 px-3 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg text-[10px] font-black transition-colors"
                            title="Open KEW-PA 11 Report"
                          >
                            <FileText className="w-3 h-3" /> Report.pdf <ExternalLink className="w-2.5 h-2.5" />
                          </button>
                        ) : (
                          <span className="text-[10px] text-slate-400 font-semibold italic">No report uploaded</span>
                        )}
                      </td>
                      <td className="px-5 py-3 text-right">
                        <div className="flex justify-end items-center gap-2">
                          {isLocked ? (
                            <>
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-100 rounded-lg text-[10px] font-black">
                                <Lock className="w-2.5 h-2.5" /> Approved
                              </span>
                              {onToggleLock && (
                                <button
                                  onClick={() => onToggleLock(s.id)}
                                  className="p-1 hover:bg-slate-100 text-slate-400 hover:text-slate-600 rounded-lg transition-colors"
                                  title="Unlock schedule"
                                >
                                  <Unlock className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </>
                          ) : (
                            <>
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-50 text-amber-700 border border-amber-100 rounded-lg text-[10px] font-black animate-pulse">
                                <Clock className="w-2.5 h-2.5" /> Review
                              </span>
                              {onToggleLock && (
                                <button
                                  onClick={() => onToggleLock(s.id)}
                                  className="inline-flex items-center gap-1 px-2.5 py-1 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-[10px] font-bold shadow-sm transition-colors"
                                  title="Lock & approve inspection"
                                >
                                  Approve
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
