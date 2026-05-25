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
