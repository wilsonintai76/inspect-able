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
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
      {stats.map(({ label, value, color, icon: Icon }) => (
        <div key={label} className="bg-white border border-slate-200 rounded-2xl sm:rounded-3xl p-3 sm:p-5 flex items-center gap-3 sm:gap-4">
          <div className={`p-2 sm:p-2.5 rounded-xl sm:rounded-2xl bg-slate-50 ${color}`}>
            <Icon className="w-4 h-4 sm:w-5 sm:h-5" />
          </div>
          <div>
            <p className="text-xl sm:text-2xl font-black text-slate-900">{value}</p>
            <p className="text-[9px] sm:text-[10px] font-bold uppercase text-slate-400 tracking-widest">{label}</p>
          </div>
        </div>
      ))}
    </div>
  );
};
