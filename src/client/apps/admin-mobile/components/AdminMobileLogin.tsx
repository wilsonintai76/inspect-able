import React, { useState } from 'react';
import { BRANDING } from '../../../constants';

interface Props {
  onLogin?: () => void;
}

export const AdminMobileLogin: React.FC<Props> = () => {
  const [loading, setLoading] = useState(false);
  const googleUrl = `/api/auth/google?returnTo=${encodeURIComponent(window.location.href)}`;

  const handleGoogleSignIn = () => {
    setLoading(true);
    window.location.href = googleUrl;
  };

  return (
    <div className="min-h-dvh bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 flex flex-col items-center justify-center p-6">

      {/* Background blobs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-96 h-96 bg-blue-600/20 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 left-1/4 w-64 h-64 bg-indigo-600/15 rounded-full blur-3xl" />
      </div>

      <div className="relative w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-10">
          {BRANDING.logoBrand ? (
            <img
              src={BRANDING.logoBrand}
              alt="Inspect-able"
              className="h-12 mx-auto object-contain mb-4 drop-shadow-lg"
            />
          ) : (
            <div className="w-16 h-16 bg-blue-600 rounded-3xl flex items-center justify-center mx-auto mb-4 shadow-2xl shadow-blue-500/40">
              <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </div>
          )}
          <h1 className="text-3xl font-black text-white tracking-tight">Inspect-able</h1>
          <p className="text-blue-300 text-sm font-medium mt-1">Admin Mobile Panel</p>
        </div>

        {/* Card */}
        <div className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-3xl p-6 shadow-2xl">
          <h2 className="text-white font-bold text-lg text-center mb-1">Welcome back</h2>
          <p className="text-blue-200 text-xs text-center mb-6">Sign in with your institutional account</p>

          <a
            href={googleUrl}
            onClick={() => setLoading(true)}
            className={`w-full flex items-center justify-center gap-3 py-3.5 px-4 bg-white hover:bg-slate-50 active:scale-95 rounded-2xl text-sm font-bold text-slate-800 transition-all shadow-lg shadow-black/20 ${loading ? 'opacity-60 pointer-events-none' : ''}`}
          >
            {loading ? (
              <span className="w-5 h-5 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin" />
            ) : (
              <svg width="20" height="20" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
            )}
            {loading ? 'Redirecting…' : 'Sign in with Google'}
          </a>

          <p className="text-[10px] text-blue-300 text-center mt-4 font-medium">
            @poliku.edu.my accounts only · Secured via auth.inspect-able.com
          </p>
        </div>

        <p className="text-blue-400/60 text-[10px] text-center mt-8 font-medium">
          Politeknik Kuching Sarawak · Institutional Asset Audit System
        </p>
      </div>
    </div>
  );
};
