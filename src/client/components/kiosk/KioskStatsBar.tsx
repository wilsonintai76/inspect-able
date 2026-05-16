import React from 'react';
import { Calendar, Users, Package, Check } from 'lucide-react';

interface StatItem {
  label: string;
  value: string;
  color: string;
  icon: React.ElementType;
}

interface Props {
  totalAssets: number;
  totalSlots: number;
  assigned: number;
  totalAuditors: number;
  completed: number;
}

export const KioskStatsBar: React.FC<Props> = ({ totalAssets, totalSlots, assigned, totalAuditors, completed }) => {
  const stats: StatItem[] = [
    { label: 'Total Assets',  value: totalAssets.toLocaleString(), color: 'text-indigo-600', icon: Package  },
    { label: 'Total Slots',   value: totalSlots.toString(),        color: 'text-slate-800',  icon: Calendar  },
    { label: 'Assigned',      value: `${assigned} / ${totalAuditors}`, color: 'text-blue-600', icon: Users     },
    { label: 'Completed',     value: completed.toString(),         color: 'text-emerald-600', icon: Check    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-4">
      {stats.map(({ label, value, color, icon: Icon }) => (
        <div key={label} className="bg-white border border-slate-200 rounded-xl sm:rounded-3xl p-2 sm:p-5 flex items-center gap-2 sm:gap-4 min-w-0 shadow-sm">
          <div className={`p-1.5 sm:p-2.5 rounded-lg sm:rounded-2xl bg-slate-50 ${color} shrink-0`}>
            <Icon className="w-3.5 h-3.5 sm:w-5 sm:h-5" />
          </div>
          <div className="min-w-0">
            <p className="text-sm sm:text-2xl font-black text-slate-900 truncate tracking-tight">{value}</p>
            <p className="text-[7px] sm:text-[10px] font-bold uppercase text-slate-400 tracking-widest truncate">{label}</p>
          </div>
        </div>
      ))}
    </div>
  );
};
