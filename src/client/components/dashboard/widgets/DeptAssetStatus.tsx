import React, { useEffect, useState } from 'react';
import { Package, ChevronDown, ChevronRight, MapPin } from 'lucide-react';

interface LocationDetail {
  name: string; total: number; statuses: Record<string, number>;
}

interface DeptStatus {
  deptId: string; deptName: string; deptAbbr: string;
  total: number; locationCount: number;
  statuses: Record<string, number>;
  locations: LocationDetail[];
}

const STATUS_COLORS: Record<string, string> = {
  'In Use': 'bg-emerald-500',
  'Not In Use': 'bg-slate-400',
  'Broken': 'bg-rose-500',
  'Under Maintenance': 'bg-amber-500',
  'Borrowed': 'bg-blue-500',
  'Missing': 'bg-red-600',
};

const STATUS_LABEL_COLORS: Record<string, string> = {
  'In Use': 'text-emerald-700 bg-emerald-50',
  'Not In Use': 'text-slate-600 bg-slate-100',
  'Broken': 'text-rose-700 bg-rose-50',
  'Under Maintenance': 'text-amber-700 bg-amber-50',
  'Borrowed': 'text-blue-700 bg-blue-50',
  'Missing': 'text-red-700 bg-red-50',
};

export const DeptAssetStatus: React.FC<{ deptId: string }> = ({ deptId }) => {
  const [data, setData] = useState<DeptStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedLocs, setExpandedLocs] = useState<Set<number>>(new Set());

  useEffect(() => {
    fetch('/api/db/audits/department-asset-summary')
      .then(r => r.json())
      .then((d: DeptStatus[]) => { setData(d.find(x => x.deptId === deptId) || null); setLoading(false); })
      .catch(() => setLoading(false));
  }, [deptId]);

  const toggleLoc = (i: number) => {
    setExpandedLocs(prev => { const next = new Set(prev); next.has(i) ? next.delete(i) : next.add(i); return next; });
  };

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
        Asset Status by Location · {data.locationCount} completed
      </h3>

      {/* Department total bar */}
      <div className="flex items-center gap-0.5 h-4 w-full rounded-full overflow-hidden bg-slate-100 mb-4">
        {Object.entries(data.statuses).map(([k, v]) => {
          const pct = Math.max((v / data.total) * 100, 2);
          return <div key={k} className={`h-full ${STATUS_COLORS[k] || 'bg-slate-500'}`}
            style={{ width: `${pct}%` }} title={`${k}: ${v}`} />;
        })}
      </div>
      <div className="flex flex-wrap gap-1.5 mb-4">
        {Object.entries(data.statuses).map(([k, v]) => (
          <span key={k} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[9px] font-extrabold ${STATUS_LABEL_COLORS[k] || 'bg-slate-50 text-slate-600'}`}>
            <div className={`w-1.5 h-1.5 rounded-full ${STATUS_COLORS[k] || 'bg-slate-400'}`} />{k}: {v}
          </span>
        ))}
      </div>

      {/* Location breakdown */}
      <div className="space-y-1">
        {data.locations.filter(l => l.total > 0).sort((a, b) => b.total - a.total).map((loc, i) => {
          const isOpen = expandedLocs.has(i);
          return (
            <div key={i} className="rounded-xl overflow-hidden">
              <button
                onClick={() => toggleLoc(i)}
                className="w-full flex items-center gap-2 px-3 py-2 hover:bg-slate-50 transition-colors text-left"
              >
                {isOpen ? <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" /> : <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />}
                <MapPin className="w-3 h-3 text-slate-400 shrink-0" />
                <span className="text-[11px] font-bold text-slate-700 truncate flex-1">{loc.name}</span>
                <div className="flex items-center gap-0.5 h-3 w-16 rounded-full overflow-hidden bg-slate-100 shrink-0">
                  {Object.entries(loc.statuses).map(([k, v]) => {
                    const pct = Math.max((v / loc.total) * 100, 2);
                    return <div key={k} className={`h-full ${STATUS_COLORS[k] || 'bg-slate-500'}`} style={{ width: `${pct}%` }} />;
                  })}
                </div>
                <span className="text-[10px] font-black text-slate-600 tabular-nums w-8 text-right">{loc.total}</span>
              </button>
              {isOpen && (
                <div className="px-3 pb-2 pl-12 grid grid-cols-3 gap-1">
                  {Object.entries(loc.statuses).map(([k, v]) => (
                    <span key={k} className="flex items-center gap-1 text-[9px] font-medium text-slate-500">
                      <div className={`w-1.5 h-1.5 rounded-full ${STATUS_COLORS[k] || 'bg-slate-400'}`} />
                      {k}: {v}
                    </span>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="text-[10px] text-slate-400 font-medium mt-3 text-right">
        Total: {data.total.toLocaleString()} verified assets
      </div>
    </div>
  );
};
