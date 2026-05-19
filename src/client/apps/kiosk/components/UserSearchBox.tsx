import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Search, Check, X, Award, Phone } from 'lucide-react';
import { KioskUser } from './types';

interface Props {
  users: KioskUser[];
  maxAssets: number;
  scheduleAssets?: number;
  placeholder: string;
  currentName: string | null;
  currentContact?: string | null;
  onSelect: (user: KioskUser) => void;
  onClear: () => void;
}

export const UserSearchBox: React.FC<Props> = ({
  users,
  maxAssets,
  scheduleAssets = 0,
  placeholder,
  currentName,
  currentContact,
  onSelect,
  onClear,
}) => {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const filtered = useMemo(
    () => users.filter(u => u.name.toLowerCase().includes(query.toLowerCase())).slice(0, 8),
    [users, query],
  );

  // ── Assigned state ────────────────────────────────────────────────────────
  if (currentName) {
    return (
      <div className="flex items-center justify-between gap-2 px-3 py-2 bg-indigo-50 border border-indigo-200 rounded-xl">
        <div className="flex-1 min-w-0 flex flex-col gap-0.5">
          <div className="flex items-center gap-1.5 min-w-0">
            <Check className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
            <span className="text-xs font-bold text-indigo-800 truncate">{currentName}</span>
          </div>
          {currentContact && (
            <div className="text-[10px] text-indigo-600/70 flex items-center gap-1 font-bold font-mono pl-5">
              <Phone className="w-2.5 h-2.5 opacity-60" />
              {currentContact}
            </div>
          )}
        </div>
        <button
          onClick={onClear}
          title="Remove assignment"
          className="text-indigo-400 hover:text-indigo-700 transition-colors shrink-0"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    );
  }

  // ── Search state ──────────────────────────────────────────────────────────
  return (
    <div ref={ref} className="relative">
      <div className="flex items-center gap-2 px-3 py-2 bg-white border border-slate-200 rounded-xl focus-within:border-indigo-400 focus-within:ring-2 focus-within:ring-indigo-500/10 transition-all">
        <Search className="w-3.5 h-3.5 text-slate-400 shrink-0" />
        <input
          className="flex-1 text-xs font-medium bg-transparent outline-none placeholder:text-slate-400"
          placeholder={placeholder}
          value={query}
          onChange={e => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
        />
      </div>

      {open && filtered.length > 0 && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-2xl shadow-xl overflow-hidden">
          {filtered.map(u => (
            <button
              key={u.id}
              onClick={() => { onSelect(u); setQuery(''); setOpen(false); }}
              className="w-full flex items-center gap-3 px-4 py-3 hover:bg-indigo-50 transition-colors text-left group"
            >
              <div className="w-7 h-7 rounded-full bg-linear-to-br from-indigo-400 to-purple-500 flex items-center justify-center text-white text-[10px] font-black shrink-0">
                {u.name.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-xs font-bold text-slate-800 truncate">{u.name}</p>
                  {u.certificationExpiry && new Date(u.certificationExpiry) > new Date() && (
                    <div className="px-1.5 py-0.5 bg-blue-100 text-blue-600 rounded text-[7px] font-black uppercase flex items-center gap-1 shrink-0">
                      <Award className="w-2 h-2" />
                      Certified
                    </div>
                  )}
                </div>
                <p className={`text-[10px] ${(u.assetsAssigned + scheduleAssets) > maxAssets ? 'text-rose-600 font-extrabold' : 'text-slate-500 font-medium'}`}>
                  {u.designation ?? 'Staff'} · {u.assetsAssigned.toLocaleString()} assets
                  {scheduleAssets > 0 && ` (Proj: ${(u.assetsAssigned + scheduleAssets).toLocaleString()} / ${maxAssets.toLocaleString()})`}
                </p>
              </div>
              <span className="text-[10px] font-black text-indigo-400 opacity-0 group-hover:opacity-100 transition-opacity">
                Select
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
