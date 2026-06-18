import React, { useEffect, useState } from 'react';
import { Building2, ChevronDown, ChevronRight, Package } from 'lucide-react';

interface DeptAssetEntry {
  deptId: string;
  deptName: string;
  deptAbbr: string;
  total: number;
  locationCount: number;
  statuses: Record<string, number>;
}

const STATUS_COLORS: Record<string, string> = {
  'In Use': 'bg-emerald-500',
  'Not In Use': 'bg-slate-400',
  'Broken': 'bg-rose-500',
  'Under Maintenance': 'bg-amber-500',
  'Borrowed': 'bg-blue-500',
  'Missing': 'bg-red-600',
};

export const DepartmentAssetSummary: React.FC = () => {
  const [data, setData] = useState<DeptAssetEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetch('/api/db/audits/department-asset-summary')
      .then(r => r.json())
      .then(d => { setData(Array.isArray(d) ? d : []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const toggle = (id: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  if (loading) return (
    <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm animate-pulse">
      <div className="h-4 bg-slate-200 rounded w-48 mb-4" />
      <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="h-10 bg-slate-100 rounded-xl" />
      ))}</div>
    </div>
  );

  if (data.length === 0) return (
    <div className="bg-white border border-dashed border-slate-300 rounded-3xl p-6 text-center shadow-sm">
      <Package className="w-8 h-8 text-slate-300 mx-auto mb-2" />
      <p className="text-xs text-slate-400 font-medium">No completed audits with asset data yet.</p>
    </div>
  );

  const grandTotal = data.reduce((s, d) => s + d.total, 0);

  return (
    <div className="bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-sm">
      <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50/30">
        <h3 className="text-sm font-black text-slate-800 flex items-center gap-2">
          <Building2 className="w-4 h-4 text-indigo-500" />
          Asset Status by Department
        </h3>
        <span className="text-[10px] font-bold text-slate-400">
          {data.length} depts · {grandTotal.toLocaleString()} total assets
        </span>
      </div>
      <div className="divide-y divide-slate-100">
        {data.map(dept => {
          const isOpen = expanded.has(dept.deptId);
          const total = dept.total;
          return (
            <div key={dept.deptId}>
              {/* Department row */}
              <button
                onClick={() => toggle(dept.deptId)}
                className="w-full flex items-center gap-3 px-5 py-3 hover:bg-slate-50 transition-colors text-left"
              >
                {isOpen ? <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" /> : <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />}
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-sm text-slate-800 truncate">{dept.deptName}</div>
                  <div className="text-[10px] text-slate-400 font-medium">{dept.locationCount} locations</div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  {/* Mini bar */}
                  <div className="hidden sm:flex items-center gap-0.5 h-4 w-24 rounded-full overflow-hidden bg-slate-100">
                    {Object.entries(dept.statuses).slice(0, 4).map(([k, v]) => {
                      const pct = Math.max((v / total) * 100, 2);
                      return (
                        <div key={k} className={`h-full ${STATUS_COLORS[k] || 'bg-slate-500'}`}
                          style={{ width: `${pct}%` }} title={`${k}: ${v}`} />
                      );
                    })}
                  </div>
                  <span className="text-sm font-black text-slate-700 tabular-nums">{total}</span>
                </div>
              </button>
              {/* Expanded: status breakdown */}
              {isOpen && (
                <div className="px-5 pb-3 pl-14">
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {Object.entries(dept.statuses).map(([k, v]) => (
                      <div key={k} className="flex items-center gap-2 bg-slate-50 rounded-lg px-3 py-1.5">
                        <div className={`w-2 h-2 rounded-full shrink-0 ${STATUS_COLORS[k] || 'bg-slate-400'}`} />
                        <span className="text-[10px] font-bold text-slate-500 truncate">{k}</span>
                        <span className="text-[10px] font-black text-slate-700 ml-auto tabular-nums">{v}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
