import React from 'react';

interface Props {
  status: string;
}

const STATUS_STYLES: Record<string, string> = {
  Pending: 'bg-amber-50 text-amber-700 border-amber-200',
  'In Progress': 'bg-blue-50 text-blue-700 border-blue-200',
  Completed: 'bg-emerald-50 text-emerald-700 border-emerald-200',
};

export const StatusBadge: React.FC<Props> = ({ status }) => (
  <span
    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-black uppercase tracking-wider ${
      STATUS_STYLES[status] ?? 'bg-slate-50 text-slate-500 border-slate-200'
    }`}
  >
    <span className="w-1.5 h-1.5 rounded-full bg-current" />
    {status}
  </span>
);
