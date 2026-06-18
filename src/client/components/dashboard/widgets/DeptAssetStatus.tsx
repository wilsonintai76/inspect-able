import React, { useEffect, useState } from 'react';
import { Package } from 'lucide-react';

interface DeptStatus {
  deptId: string; deptName: string; deptAbbr: string;
  total: number; locationCount: number;
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

export const DeptAssetStatus: React.FC<{ deptId: string }> = ({ deptId }) => {
  const [data, setData] = useState<DeptStatus | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/db/audits/department-asset-summary')
      .then(r => r.json())
      .then((d: DeptStatus[]) => { setData(d.find(x => x.deptId === deptId) || null); setLoading(false); })
      .catch(() => setLoading(false));
  }, [deptId]);

  if (loading) return (
    <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-sm animate-pulse">
      <div className="h-4 bg-slate-200 rounded w-40 mb-3" />
      <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="h-8 bg-slate-100 rounded-lg" />
      ))}</div>
    </div>
  );

  if (!data) return (
    <div className="bg-white border border-dashed border-slate-300 rounded-3xl p-5 text-center shadow-sm">
      <Package className="w-6 h-6 text-slate-300 mx-auto mb-1" />
      <p className="text-[11px] text-slate-400 font-medium">No completed audits yet</p>
    </div>
  );

  return (
    <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-sm">
      <h3 className="text-sm font-black text-slate-800 flex items-center gap-2 mb-4">
        <Package className="w-4 h-4 text-emerald-500" />
        Asset Status Summary · {data.locationCount} locations
      </h3>
      {/* Mini bar */}
      <div className="flex items-center gap-0.5 h-4 w-full rounded-full overflow-hidden bg-slate-100 mb-4">
        {Object.entries(data.statuses).map(([k, v]) => {
          const pct = Math.max((v / data.total) * 100, 2);
          return <div key={k} className={`h-full ${STATUS_COLORS[k] || 'bg-slate-500'}`}
            style={{ width: `${pct}%` }} title={`${k}: ${v}`} />;
        })}
      </div>
      {/* Detail grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {Object.entries(data.statuses).map(([k, v]) => (
          <div key={k} className="flex items-center gap-2 bg-slate-50 rounded-lg px-3 py-2">
            <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${STATUS_COLORS[k] || 'bg-slate-400'}`} />
            <span className="text-[11px] font-bold text-slate-600 truncate">{k}</span>
            <span className="text-xs font-black text-slate-800 ml-auto tabular-nums">{v}</span>
          </div>
        ))}
      </div>
      <div className="text-[10px] text-slate-400 font-medium mt-3 text-right">
        Total: {data.total.toLocaleString()} verified assets
      </div>
    </div>
  );
};
