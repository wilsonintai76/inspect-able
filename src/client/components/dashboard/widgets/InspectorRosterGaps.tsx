import React from 'react';
import { Users, UserCheck, Building2 } from 'lucide-react';

interface InspectorWorkload {
  name: string;
  id: string;
  deptName: string;
  assets: number;
  slots: number;
  certExpiry: string | null;
  isOverloaded: boolean;
}

interface StaffingGap {
  id: string;
  name: string;
  abbr: string;
  totalUsers: number;
  certifiedOfficers: number;
  hasHod: boolean;
  totalAssets: number;
  gaps: string[];
}

interface Props {
  allInspectors: InspectorWorkload[];
  totalInspectors: number;
  staffingGaps: StaffingGap[];
}

export const InspectorRosterGaps: React.FC<Props> = ({ allInspectors, totalInspectors, staffingGaps }) => {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* ── Inspector Workload Roster ─────────────────────────────── */}
      <div className="rounded-3xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="p-5 border-b border-slate-100 flex items-center justify-between">
          <h3 className="text-sm font-black text-slate-900 flex items-center gap-2">
            <Users className="w-4 h-4 text-indigo-500" />
            Inspector Workload Roster
          </h3>
          <span className="text-[10px] text-slate-400 font-bold">{totalInspectors} inspectors</span>
        </div>
        <div className="overflow-auto max-h-96">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 sticky top-0">
              <tr>
                <th className="px-4 py-2.5 text-[10px] font-black uppercase text-slate-400">Inspector</th>
                <th className="px-3 py-2.5 text-[10px] font-black uppercase text-slate-400">Dept</th>
                <th className="px-3 py-2.5 text-[10px] font-black uppercase text-slate-400 text-center">Slots</th>
                <th className="px-3 py-2.5 text-[10px] font-black uppercase text-slate-400 text-right">Assets</th>
                <th className="px-3 py-2.5 text-[10px] font-black uppercase text-slate-400 text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {allInspectors.slice(0, 50).map(o => (
                <tr key={o.id} className={`hover:bg-slate-50/30 ${o.isOverloaded ? 'bg-red-50/30' : ''}`}>
                  <td className="px-4 py-2 font-bold text-slate-800 truncate max-w-35">{o.name}</td>
                  <td className="px-3 py-2 text-slate-500 font-medium">{o.deptName}</td>
                  <td className="px-3 py-2 text-center font-bold text-slate-700">{o.slots}</td>
                  <td className="px-3 py-2 text-right font-bold text-indigo-600">{o.assets.toLocaleString()}</td>
                  <td className="px-3 py-2 text-right">
                    {o.isOverloaded
                      ? <span className="inline-flex px-2 py-0.5 bg-red-50 text-red-600 rounded-lg text-[10px] font-bold">Over</span>
                      : o.slots === 0
                        ? <span className="inline-flex px-2 py-0.5 bg-slate-50 text-slate-400 rounded-lg text-[10px] font-bold">Idle</span>
                        : <span className="inline-flex px-2 py-0.5 bg-emerald-50 text-emerald-600 rounded-lg text-[10px] font-bold">OK</span>
                    }
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Department Staffing Gaps ───────────────────────────────── */}
      <div className="rounded-3xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="p-5 border-b border-slate-100 flex items-center justify-between">
          <h3 className="text-sm font-black text-slate-900 flex items-center gap-2">
            <Building2 className="w-4 h-4 text-amber-500" />
            Department Staffing Gaps
          </h3>
          <span className="text-[10px] text-slate-400 font-bold">{staffingGaps.length} depts</span>
        </div>
        <div className="overflow-auto max-h-96">
          {staffingGaps.length === 0 ? (
            <div className="p-8 text-center">
              <UserCheck className="w-8 h-8 text-emerald-300 mx-auto mb-2" />
              <p className="text-xs text-slate-400 font-bold">All departments have QAIs</p>
            </div>
          ) : (
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 sticky top-0">
                <tr>
                  <th className="px-4 py-2.5 text-[10px] font-black uppercase text-slate-400">Department</th>
                  <th className="px-3 py-2.5 text-[10px] font-black uppercase text-slate-400 text-center">Inspectors</th>
                  <th className="px-3 py-2.5 text-[10px] font-black uppercase text-slate-400">Gaps</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {staffingGaps.map(d => (
                  <tr key={d.id} className="hover:bg-slate-50/30">
                    <td className="px-4 py-2">
                      <span className="font-bold text-slate-800">{d.abbr || d.name}</span>
                      <span className="text-[10px] text-slate-400 ml-1">({(d.totalAssets || 0).toLocaleString()} assets)</span>
                    </td>
                    <td className="px-3 py-2 text-center">
                      <span className={`font-bold ${d.certifiedOfficers === 0 ? 'text-red-500' : 'text-amber-500'}`}>
                        {d.certifiedOfficers}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-1">
                        {d.gaps.map((g, i) => (
                          <span key={i} className="px-1.5 py-0.5 bg-red-50 text-red-600 rounded text-[9px] font-bold">{g}</span>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
};
