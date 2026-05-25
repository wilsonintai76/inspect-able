import React from 'react';

/** Shared stat card used across dashboard widgets */
export function StatCard({ icon: Icon, label, value, color }: {
  icon: React.ElementType; label: string; value: string | number; color: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 hover:shadow-md transition-shadow">
      <div className="flex items-center gap-2 mb-2">
        <Icon className={`w-4 h-4 ${color}`} />
        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{label}</span>
      </div>
      <p className={`text-2xl font-black ${color}`}>{value}</p>
    </div>
  );
}

/** Admin-specific stat card with colored icon box */
export function AdminStatCard({ icon: Icon, label, value, color }: {
  icon: React.ElementType; label: string; value: number; color: string;
}) {
  const colors: Record<string, string> = {
    amber: 'bg-amber-50 text-amber-600 border-amber-100',
    rose: 'bg-rose-50 text-rose-600 border-rose-100',
    indigo: 'bg-indigo-50 text-indigo-600 border-indigo-100',
    orange: 'bg-orange-50 text-orange-600 border-orange-100',
  };
  return (
    <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm hover:border-slate-300 transition-colors">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 border ${colors[color] || 'bg-slate-100 text-slate-600 border-slate-200'}`}>
        <Icon className="w-5 h-5" />
      </div>
      <div className="text-2xl font-black text-slate-900">{value}</div>
      <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">{label}</div>
    </div>
  );
}

/** Data gap card (missing date / unassigned officers) */
export function DataGapCard({ title, icon: Icon, items, locations, departments, color }: {
  title: string; icon: React.ElementType; items: any[]; locations: any[]; departments: any[]; color: string;
}) {
  const colorClasses: Record<string, string> = {
    rose: 'bg-rose-50 text-rose-600 border-rose-100',
    indigo: 'bg-indigo-50 text-indigo-600 border-indigo-100',
  };
  return (
    <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-sm">
      <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon className={`w-4 h-4 ${color === 'rose' ? 'text-rose-500' : 'text-indigo-500'}`} />
          <h3 className="font-bold text-slate-900 text-sm">{title}</h3>
        </div>
        <span className={`px-2 py-0.5 rounded-lg text-[9px] font-black uppercase border ${colorClasses[color]}`}>{items.length} Gaps</span>
      </div>
      <div className="max-h-52 overflow-y-auto divide-y divide-slate-50">
        {items.slice(0, 15).map((a: any) => {
          const loc = locations.find((l: any) => l.id === a.locationId);
          const dept = departments.find((d: any) => d.id === a.departmentId);
          return (
            <div key={a.id} className="px-5 py-2.5 flex items-center gap-3 hover:bg-slate-50/50">
              <div className="w-7 h-7 rounded-lg bg-slate-50 border border-slate-100 flex items-center justify-center text-[9px] font-black text-slate-300">{loc?.abbr || '?'}</div>
              <div className="min-w-0">
                <div className="text-xs font-bold text-slate-800 truncate">{loc?.name || 'Invalid Location'}</div>
                <div className="text-[9px] text-slate-400 font-bold truncate">{dept?.name || 'Unknown Dept'}</div>
              </div>
            </div>
          );
        })}
        {items.length === 0 && (
          <div className="py-8 text-center">
            <p className="text-[10px] font-black text-slate-400 uppercase">Compliant</p>
          </div>
        )}
      </div>
    </div>
  );
}
