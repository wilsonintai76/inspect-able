import React from 'react';
import { ShieldOff } from 'lucide-react';

interface CertificationBannerProps {
  isSupervisor: boolean;
  isCoordinator: boolean;
}

export const CertificationBanner: React.FC<CertificationBannerProps> = ({ isSupervisor, isCoordinator }) => (
  <div className="bg-rose-600 text-white px-6 py-4 rounded-3xl shadow-xl shadow-rose-500/20 flex flex-col sm:flex-row items-center justify-between gap-4 animate-in fade-in slide-in-from-top-2">
    <div className="flex items-center gap-4">
      <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center text-xl">
        <ShieldOff className="w-6 h-6" />
      </div>
      <div>
        <h4 className="font-black text-sm uppercase tracking-widest">Self-Assignment Locked</h4>
        <p className="text-xs text-rose-100 font-medium">
          {isSupervisor || isCoordinator ? 'Management override disabled.' : 'Authorization revoked.'} Your inspector certification is expired.
        </p>
      </div>
    </div>
    <button
      onClick={() => { window.location.hash = '#profile'; }}
      className="px-4 py-2 bg-white text-rose-600 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-rose-50 transition-colors shrink-0"
    >
      Check Status
    </button>
  </div>
);
