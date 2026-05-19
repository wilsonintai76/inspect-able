import React from 'react';
import { Smartphone, X } from 'lucide-react';

interface Props {
  isIOS: boolean;
  isStandalone: boolean;
  showIOSBanner: boolean;
  onClose: () => void;
}

export const KioskIOSBanner: React.FC<Props> = ({
  isIOS,
  isStandalone,
  showIOSBanner,
  onClose,
}) => {
  if (!isIOS || isStandalone || !showIOSBanner) return null;

  return (
    <div className="bg-indigo-600 text-white px-4 py-3 shadow-md relative animate-in fade-in slide-in-from-top-4 duration-300">
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-3 text-[11px] sm:text-xs font-bold pr-8">
        <div className="flex items-center gap-2">
          <Smartphone className="w-4 h-4 shrink-0 text-indigo-200" />
          <span>
            Install Standalone Kiosk: Tap the <span className="bg-indigo-700 px-1.5 py-0.5 rounded text-white font-extrabold">Share button</span> ↗️ in Safari, then scroll down and select <span className="bg-indigo-700 px-1.5 py-0.5 rounded text-white font-extrabold">Add to Home Screen</span>.
          </span>
        </div>
        <button 
          title="Close banner"
          onClick={onClose}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-indigo-200 hover:text-white transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
