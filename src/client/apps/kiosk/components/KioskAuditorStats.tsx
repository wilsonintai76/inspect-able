import React from 'react';
import { UserCheck, Package } from 'lucide-react';

interface AuditorStat {
  name: string;
  assets: number;
  slots: number;
}

interface Props {
  stats: AuditorStat[];
}

export const KioskAuditorStats: React.FC<Props> = ({ stats }) => {
  if (stats.length === 0) return null;

  return (
    <div className="mt-6 space-y-4">
      <div className="flex items-center gap-2 mb-2">
        <UserCheck className="w-4 h-4 text-indigo-600" />
        <h3 className="text-xs font-black uppercase tracking-widest text-slate-400">Certified Auditor Workload</h3>
      </div>
      
      <div className="grid gap-3 sm:grid-cols-2">
        {stats.map((stat, idx) => (
          <div key={idx} className="bg-white border border-slate-200 rounded-2xl p-4 flex items-center justify-between shadow-sm">
            <div className="flex flex-col">
              <span className="text-sm font-black text-slate-900">{stat.name}</span>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">
                {stat.slots} Slot{stat.slots !== 1 ? 's' : ''} Assigned
              </span>
            </div>
            
            <div className="flex items-center gap-2 bg-indigo-50 px-3 py-1.5 rounded-xl">
              <Package className="w-3.5 h-3.5 text-indigo-600" />
              <span className="text-sm font-black text-indigo-700">{stat.assets.toLocaleString()}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
