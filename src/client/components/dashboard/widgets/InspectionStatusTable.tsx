import React from 'react';
import { LayoutDashboard } from 'lucide-react';

interface InspectionDeptRow {
  id: string;
  name: string;
  locs: number;
  totalAssets: number;
  pending: number;
  inProgress: number;
  completed: number;
  noSupervisor: number;
  progress: number;
}

interface Props {
  data: InspectionDeptRow[];
}

export const InspectionStatusTable: React.FC<Props> = ({ data }) => {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      <div className="p-5 border-b border-slate-100 flex items-center justify-between">
        <h3 className="text-sm font-black text-slate-900 flex items-center gap-2">
          <LayoutDashboard className="w-4 h-4 text-indigo-500" />Institutional Inspection Status
        </h3>
        <span className="text-[10px] text-slate-400 font-bold">{data.length} departments</span>
      </div>
      <div className="overflow-x-auto max-h-96 overflow-y-auto">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-50 sticky top-0">
            <tr>
              <th className="px-4 py-3 text-[10px] font-black uppercase text-slate-400">Department</th>
              <th className="px-2 py-3 text-[10px] font-black uppercase text-slate-400 text-center">Locs</th>
              <th className="px-2 py-3 text-[10px] font-black uppercase text-slate-400 text-center">Pending</th>
              <th className="px-2 py-3 text-[10px] font-black uppercase text-amber-500 text-center">In Prog</th>
              <th className="px-2 py-3 text-[10px] font-black uppercase text-emerald-600 text-center">Done</th>
              <th className="px-2 py-3 text-[10px] font-black uppercase text-slate-400 text-center">No Supv</th>
              <th className="px-4 py-3 text-[10px] font-black uppercase text-slate-400 text-right">Progress</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {data.map(d => (
              <tr key={d.id} className="hover:bg-slate-50/30">
                <td className="px-4 py-3 font-bold text-slate-800">{d.name}</td>
                <td className="px-2 py-3 text-center font-bold text-slate-600">{d.locs}</td>
                <td className="px-2 py-3 text-center font-medium text-slate-500">{d.pending}</td>
                <td className="px-2 py-3 text-center font-bold text-amber-500">{d.inProgress}</td>
                <td className="px-2 py-3 text-center font-bold text-emerald-600">{d.completed}</td>
                <td className="px-2 py-3 text-center">
                  {d.noSupervisor > 0
                    ? <span className="inline-flex px-2 py-0.5 bg-red-50 text-red-600 rounded-lg text-[10px] font-bold">{d.noSupervisor}</span>
                    : <span className="text-slate-300">—</span>}
                </td>
                <td className="px-4 py-3 text-right min-w-40">
                  <div className="flex items-center justify-end gap-2">
                    <div className="flex-1 h-2.5 bg-slate-100 rounded-full overflow-hidden flex">
                      {d.completed > 0 && (
                        <div
                          className="h-full bg-emerald-500 transition-all"
                          style={{ width: `${(d.completed / d.locs) * 100}%` }}
                        />
                      )}
                      {d.inProgress > 0 && (
                        <div
                          className="h-full bg-amber-400 transition-all"
                          style={{ width: `${(d.inProgress / d.locs) * 100}%` }}
                        />
                      )}
                      {d.pending > 0 && (
                        <div
                          className="h-full bg-slate-300 transition-all"
                          style={{ width: `${(d.pending / d.locs) * 100}%` }}
                        />
                      )}
                    </div>
                    <span className="text-[10px] font-black text-slate-700 w-10 text-right">{d.progress}%</span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
