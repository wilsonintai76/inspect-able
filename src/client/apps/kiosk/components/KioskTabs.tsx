import React from 'react';
import { Calendar, BarChart3, Filter, ShieldCheck } from 'lucide-react';

export type KioskTab = 'schedule' | 'stats' | 'filters' | 'hub';

interface Props {
  activeTab: KioskTab;
  onTabChange: (tab: KioskTab) => void;
  badgeCount?: number;
}

export const KioskTabs: React.FC<Props> = ({ activeTab, onTabChange, badgeCount }) => {
  const tabs = [
    { id: 'filters' as const,  label: 'Filters',  icon: Filter, badge: badgeCount },
    { id: 'schedule' as const, label: 'Schedule', icon: Calendar },
    { id: 'stats' as const,    label: 'Stats',    icon: BarChart3 },
    { id: 'hub' as const,      label: 'My Hub',   icon: ShieldCheck },
  ];

  return (
    <div className="fixed bottom-0 left-0 right-0 z-100 bg-white/80 backdrop-blur-lg border-t border-slate-200 pb-safe-area-inset-bottom lg:hidden">
      <div className="flex items-center justify-around h-16 max-w-md mx-auto">
        {tabs.map(({ id, label, icon: Icon, badge }) => {
          const isActive = activeTab === id;
          return (
            <button
              key={id}
              onClick={() => onTabChange(id)}
              className={`relative flex flex-col items-center justify-center gap-1 w-full h-full transition-all active:scale-95 ${
                isActive ? 'text-indigo-600' : 'text-slate-400'
              }`}
            >
              <div className={`p-1 rounded-xl transition-colors ${isActive ? 'bg-indigo-50' : ''}`}>
                <Icon className={`w-5 h-5 ${isActive ? 'fill-indigo-600/10' : ''}`} />
              </div>
              <span className="text-[10px] font-bold uppercase tracking-tighter">{label}</span>
              
              {badge !== undefined && badge > 0 && (
                <span className="absolute top-2 right-1/2 translate-x-4 flex h-4 min-w-4 items-center justify-center rounded-full bg-indigo-600 px-1 text-[9px] font-black text-white ring-2 ring-white">
                  {badge}
                </span>
              )}

              {isActive && (
                <div className="absolute -top-px left-1/2 -translate-x-1/2 w-8 h-1 bg-indigo-600 rounded-b-full" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};
