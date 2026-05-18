import React, { useEffect, useState, useCallback } from 'react';
import { RefreshCw, LogOut, Sparkles } from 'lucide-react';
import { authService } from '../services/auth';

const COUNTDOWN_SEC = 30;
const KIOSK_COUNTDOWN_SEC = 10;

export const AutoUpdater: React.FC = () => {
  const [newVersion, setNewVersion] = useState<string | null>(null);
  
  const isKiosk = typeof window !== 'undefined' && window.location.hostname.startsWith('kiosk.');
  const [countdown, setCountdown] = useState(isKiosk ? KIOSK_COUNTDOWN_SEC : COUNTDOWN_SEC);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const doAction = useCallback(async () => {
    setIsLoggingOut(true);
    
    // Clear modern Cache Storage API to remove cached assets
    if (typeof window !== 'undefined' && 'caches' in window) {
      try {
        const cacheNames = await caches.keys();
        await Promise.all(cacheNames.map(name => caches.delete(name)));
        console.log('[AutoUpdater] Cache Storage cleared successfully.');
      } catch (err) {
        console.error('[AutoUpdater] Failed to clear Cache Storage:', err);
      }
    }

    // Unregister any active Service Workers
    if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
      try {
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.all(registrations.map(reg => reg.unregister()));
        console.log('[AutoUpdater] Service workers unregistered successfully.');
      } catch (err) {
        console.error('[AutoUpdater] Failed to unregister service workers:', err);
      }
    }

    if (isKiosk) {
      // Hard reload by appending a timestamp to bypass browser and CDN cache
      const cleanUrl = window.location.origin + window.location.pathname;
      window.location.href = `${cleanUrl}?u=${Date.now()}`;
    } else {
      await authService.logout();
      window.location.href = `/?u=${Date.now()}`;
    }
  }, [isKiosk]);

  // Countdown timer — fires once newVersion is set
  useEffect(() => {
    if (!newVersion) return;
    if (countdown <= 0) { doAction(); return; }
    const t = setTimeout(() => setCountdown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [newVersion, countdown, doAction]);

  // Version poller
  useEffect(() => {
    const currentVersion = import.meta.env.VITE_APP_VERSION;

    const checkVersion = async () => {
      try {
        if (newVersion) return; // already detected — don't re-check
        const res = await fetch(`/version.json?t=${Date.now()}`);
        if (!res.ok) return;
        const data = await res.json() as { version: string };
        if (data.version && data.version !== currentVersion) {
          console.log(`[AutoUpdater] New version: ${data.version} (was ${currentVersion})`);
          setNewVersion(data.version);
        }
      } catch {
        // Offline — silently ignore
      }
    };

    const intervalId = setInterval(checkVersion, 5 * 60 * 1000);
    window.addEventListener('focus', checkVersion);
    setTimeout(checkVersion, 2000);

    return () => {
      clearInterval(intervalId);
      window.removeEventListener('focus', checkVersion);
    };
  }, [newVersion]);

  if (!newVersion) return null;

  const currentVersion = import.meta.env.VITE_APP_VERSION;

  return (
    <div className="fixed inset-0 z-[9999] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-2xl max-w-sm w-full overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-br from-blue-600 to-blue-700 px-8 pt-8 pb-6 text-center">
          <div className="w-14 h-14 bg-white/20 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Sparkles className="w-7 h-7 text-white" />
          </div>
          <h3 className="text-xl font-bold text-white mb-1">New Update Available</h3>
          <p className="text-blue-200 text-xs font-medium">
            v{currentVersion} &rarr; v{newVersion}
          </p>
        </div>

        {/* Body */}
        <div className="px-8 py-6 text-center">
          <p className="text-slate-600 text-sm mb-1">
            {isKiosk 
              ? "A new version has been deployed. The kiosk will refresh automatically to apply the update."
              : "A new version has been deployed. Sign out to apply the update — you'll be redirected to log back in."
            }
          </p>
          <p className="text-slate-400 text-xs mt-3">
            {isKiosk ? "Auto refresh in " : "Auto sign-out in "}
            <span className="font-bold text-blue-600 tabular-nums">{countdown}s</span>
          </p>
        </div>

        {/* Actions */}
        <div className="px-8 pb-8 flex flex-col gap-3">
          <button
            onClick={doAction}
            disabled={isLoggingOut}
            className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-bold text-sm rounded-xl transition-colors"
          >
            {isLoggingOut
              ? <RefreshCw className="w-4 h-4 animate-spin" />
              : (isKiosk ? <RefreshCw className="w-4 h-4" /> : <LogOut className="w-4 h-4" />)
            }
            {isLoggingOut 
              ? (isKiosk ? 'Refreshing…' : 'Signing out…') 
              : (isKiosk ? 'Refresh Now' : 'Sign out & update now')
            }
          </button>
          {!isKiosk && (
            <p className="text-center text-[10px] text-slate-400 font-medium uppercase tracking-widest">
              Your session will end — please sign back in
            </p>
          )}
        </div>
      </div>
    </div>
  );
};
