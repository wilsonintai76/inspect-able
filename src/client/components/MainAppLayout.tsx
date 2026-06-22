import React from 'react';
import { Menu, BookOpen, AlertCircle, ShieldCheck, FileText } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from './ui/dialog';
import { User, AppView, SystemActivity, AppNotification } from '@shared/types';
import { Sidebar } from './Sidebar';
import { NotificationCenter } from './NotificationCenter';
import { MobileBottomNav } from './MobileBottomNav';

const VIEW_TITLES: Record<string, string> = {
  dashboard: 'Institutional Dashboard',
  schedule: 'Inspection Schedule',
  team: 'User Management',
  departments: 'Department Registry',
  locations: 'Asset Locations',
  buildings: 'Building Registry',
  settings: 'System Settings',
  profile: 'User Profile',
  'knowledge-base': 'Knowledge Base',
};

interface MainAppLayoutProps {
  currentUser: User;
  isSidebarOpen: boolean;
  setIsSidebarOpen: (open: boolean) => void;
  activeView: AppView;
  handleViewChange: (view: AppView) => void;
  handleLogout: () => void;
  checkProfileComplete: (u: User) => boolean;
  notifications: AppNotification[];
  setNotifications: React.Dispatch<React.SetStateAction<AppNotification[]>>;
  connectionErrorMessage: string | null;
  isProcessing?: boolean;
  children: React.ReactNode;
}

export const MainAppLayout: React.FC<MainAppLayoutProps> = ({
  currentUser,
  isSidebarOpen,
  setIsSidebarOpen,
  activeView,
  handleViewChange,
  handleLogout,
  checkProfileComplete,
  notifications,
  setNotifications,
  connectionErrorMessage,
  isProcessing,
  children
}) => {
  return (
    <div className="flex flex-col h-screen bg-slate-50 overflow-hidden select-none">
      <div className="flex flex-1 overflow-hidden">
        <Sidebar
          isOpen={isSidebarOpen}
          onClose={() => setIsSidebarOpen(false)}
          activeView={activeView}
          onViewChange={handleViewChange}
          onLogout={handleLogout}
          userRoles={currentUser.roles}
          isCertified={!!(currentUser.certificationExpiry && currentUser.certificationExpiry >= new Date().toISOString().split('T')[0])}
          userStatus={currentUser.status}
          isProfileComplete={checkProfileComplete(currentUser)}
          qualifications={currentUser.qualifications}
        />

        <div className="grow lg:pl-72 flex flex-col h-full min-w-0">
          <header className="bg-white/80 backdrop-blur-md border-b border-slate-200 sticky top-0 z-40 px-4 md:px-8 py-3 md:py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button 
                onClick={() => setIsSidebarOpen(true)} 
                title="Open sidebar" 
                className="lg:hidden w-9 h-9 flex items-center justify-center rounded-xl bg-slate-100 text-slate-600"
              >
                <Menu className="w-5 h-5" />
              </button>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-bold text-slate-900 capitalize leading-none">{VIEW_TITLES[activeView] || activeView}</h1>
                <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[8px] font-black uppercase border bg-indigo-50 text-indigo-600 border-indigo-100">
                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse"></span>
                  Secure Session
                </span>
              </div>
            </div>
            <div className="flex items-center gap-4">
              {checkProfileComplete(currentUser) && (
                <>
                  <Dialog>
                    <DialogTrigger render={<button className="w-10 h-10 flex items-center justify-center rounded-xl transition-all bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-rose-600" title="SPPA Manual"><FileText className="w-5 h-5" /></button>} />
                    <DialogContent className="max-w-[90vw] w-full h-[90vh] p-0 overflow-hidden bg-slate-900 border-none rounded-2xl flex flex-col">
                      <DialogHeader className="px-6 py-4 bg-slate-900 border-b border-slate-800 flex flex-row items-center justify-between shrink-0">
                        <DialogTitle className="text-white flex items-center gap-3">
                          <FileText className="w-5 h-5 text-rose-500" />
                          Manual Pemeriksaan Aset Alih Kerajaan (SPPA)
                        </DialogTitle>
                      </DialogHeader>
                      <div className="grow w-full h-full relative bg-slate-950">
                        <iframe 
                          src="/manuals/sppa-manual.pdf#toolbar=0" 
                          className="absolute inset-0 w-full h-full border-0"
                          title="SPPA Manual"
                        />
                      </div>
                    </DialogContent>
                  </Dialog>

                  <button
                    onClick={() => handleViewChange('knowledge-base')}
                    className={`w-10 h-10 flex items-center justify-center rounded-xl transition-all ${activeView === 'knowledge-base' ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                    title="Knowledge Base"
                  >
                    <BookOpen className="w-5 h-5" />
                  </button>
                  <NotificationCenter 
                    notifications={notifications} 
                    onMarkAsRead={(id) => setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n))} 
                    onClearAll={() => setNotifications([])} 
                  />
                  <div className="h-8 w-px bg-slate-200"></div>
                </>
              )}
              <button onClick={() => handleViewChange('profile')} className="flex items-center gap-2 p-1 pr-3 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-all">
                <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center font-bold text-sm">{currentUser.name?.[0] || '?'}</div>
                <span className="text-xs font-bold text-slate-700 hidden sm:block">{currentUser.name}</span>
              </button>
            </div>
          </header>

          <main className="grow p-4 md:p-8 w-full flex flex-col min-h-0 overflow-y-auto pb-20 lg:pb-8">
            {connectionErrorMessage && (
              <div className="mb-6 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl flex items-center gap-3 animate-in fade-in slide-in-from-top-2">
                <AlertCircle className="w-5 h-5 shrink-0" />
                <span className="font-medium text-sm flex-1">{connectionErrorMessage}</span>
                <button
                  onClick={() => window.location.reload()}
                  className="px-4 py-1.5 bg-red-600 text-white rounded-lg text-xs font-bold hover:bg-red-700 transition-colors shrink-0"
                >
                  Retry
                </button>
              </div>
            )}

            {(!checkProfileComplete(currentUser) || currentUser.mustChangePIN) && (
              <div className="mb-6 bg-amber-500/10 border border-amber-500/20 text-amber-800 px-6 py-4 rounded-2xl flex flex-wrap items-center justify-between gap-4 backdrop-blur-sm animate-in fade-in slide-in-from-top-2 shadow-sm">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-amber-500/20 flex items-center justify-center text-amber-700 shrink-0">
                    <AlertCircle className="w-5 h-5 animate-pulse" />
                  </div>
                  <div>
                    <h4 className="font-bold text-sm text-slate-800">Complete Secure Access Setup</h4>
                    <p className="text-xs text-slate-600 mt-0.5">
                      {currentUser.mustChangePIN 
                        ? "You are using a temporary password. Please set your secure password and complete your profile."
                        : "Some important profile details (Department or Contact Number) are currently missing."}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => handleViewChange('profile')}
                  className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs rounded-xl shadow-md shadow-amber-200 active:scale-95 transition-all cursor-pointer"
                >
                  Configure Profile & Password
                </button>
              </div>
            )}

            {children}
          </main>

          <footer className="shrink-0 border-t border-slate-100 bg-white/80 backdrop-blur-sm px-6 py-3 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-3.5 h-3.5 text-blue-400" />
              <span className="font-semibold text-slate-500">Inspect-<span className="text-blue-500">able</span></span>
              <span className="hidden sm:inline">— Institutional Asset Inspection Platform</span>
            </div>
            <div className="flex items-center gap-4">
              <span className="font-mono">v{import.meta.env.VITE_APP_VERSION || '1.0.0'}</span>
              <span>© {new Date().getFullYear()} Politeknik Kuching Sarawak. All rights reserved.</span>
            </div>
          </footer>
        </div>
      </div>

      {/* ─── Mobile Bottom Nav ─── */}
      <MobileBottomNav
        activeView={activeView}
        onViewChange={handleViewChange}
        userRoles={currentUser.roles}
        isCertified={!!(currentUser.certificationExpiry && currentUser.certificationExpiry >= new Date().toISOString().split('T')[0])}
        qualifications={currentUser.qualifications}
      />

      {/* ─── Global Processing Overlay ─── */}
      {isProcessing && (
        <div className="fixed inset-0 z-300 flex items-center justify-center bg-slate-900/30 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl px-8 py-6 shadow-2xl flex items-center gap-4 animate-in zoom-in-95 duration-200">
            <div className="w-8 h-8 border-3 border-slate-200 border-t-blue-600 rounded-full animate-spin"></div>
            <div>
              <p className="text-sm font-bold text-slate-900">Processing...</p>
              <p className="text-xs text-slate-400">Please wait while your request is handled</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
