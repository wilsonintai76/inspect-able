import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  CalendarCheck,
  Network,
  Stamp,
  UserPlus,
  PieChart,
  ShieldCheck,
  BookOpen,
  ArrowRight,
  X,
  ArrowLeft,
  Check,
  Clock,
  ChevronDown,
  Trophy,
  History,
  Zap,
  Lock,
  Mail,
  User as UserIcon,
  Loader2
} from 'lucide-react';
import { AuditPhase, SystemActivity, UserRole, AppView } from '@shared/types';
import { BRANDING } from '../constants';
import { authService } from '../services/auth';

interface LandingPageProps {
  onEnter: () => void;
  onShowKnowledgeBase: () => void;
  totalAssets?: number;
  totalPhases?: number;
  complianceProgress?: number;
  phases?: AuditPhase[];
  activities?: SystemActivity[];
  topDepartments?: { name: string, compliance: number }[];
}

function DeptComplianceBar({ compliance }: { compliance: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.style.setProperty('--w', `${compliance}%`);
  }, [compliance]);
  return <div ref={ref} className="h-full bg-emerald-500 w-(--w)"></div>;
}

export const LandingPage: React.FC<LandingPageProps> = ({ 
  onEnter, 
  onShowKnowledgeBase,
  totalAssets,
  totalPhases,
  complianceProgress,
  phases = [],
  activities = [],
  topDepartments = []
}) => {
  const [isTourOpen, setIsTourOpen] = useState(false);
  const [tourStep, setTourStep] = useState(0);
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'register' | 'forgot-password'>('login');
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  // Form State
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [name, setName] = useState('');

  const blob1Ref = useRef<HTMLDivElement>(null);
  const blob2Ref = useRef<HTMLDivElement>(null);
  const progressRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      const x = (e.clientX / window.innerWidth - 0.5) * 20;
      const y = (e.clientY / window.innerHeight - 0.5) * 20;
      blob1Ref.current?.style.setProperty('transform', `translate(${x}px, ${y}px)`);
      blob2Ref.current?.style.setProperty('transform', `translate(${-x * 1.5}px, ${-y * 1.5}px)`);
    };
    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  useEffect(() => {
    progressRef.current?.style.setProperty('--w', `${complianceProgress ?? 0}%`);
  }, [complianceProgress]);

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthLoading(true);
    setAuthError(null);

    if (authMode === 'forgot-password') {
      try {
        const { gateway } = await import('../services/dataGateway');
        await gateway.requestPasswordReset(email);
        setAuthError(null);
        setAuthMode('login');
        // We use a temporary hack to show success in error box or just a toast if we had access to props
        alert("Reset Request Sent. If your email is registered, the institutional admin will be notified to reset your password.");
      } catch (err: any) {
        setAuthError(err.message || 'Request failed.');
      } finally {
        setAuthLoading(false);
      }
      return;
    }

    if (authMode === 'register' && password !== confirmPassword) {
      setAuthError('Passwords do not match.');
      setAuthLoading(false);
      return;
    }

    try {
      if (authMode === 'login') {
        await authService.login(email, password);
      } else {
        await authService.register(email, password, name);
      }
      setIsAuthModalOpen(false);
      onEnter();
    } catch (err: any) {
      // Use the specific error message from the server if available
      setAuthError(err.message || 'Authentication failed. Please check your credentials.');
    } finally {
      setAuthLoading(false);
    }
  };

  const faqs = [
    {
      q: "How do I get my Auditor Certification?",
      a: "Certification ensures you remain compliant with JKE and Kamsis institutional inspection standards. Certifications are issued by the Institutional Admin after you complete the mandatory audit training module. Once issued, your Staff ID will be unlocked for audit assignments."
    },
    {
      q: "What is the Conflict-of-Interest (COI) Engine?",
      a: "Our system automatically prevents staff from auditing assets within their own department. It uses a neutral pairing matrix to ensure maximum objectivity during every audit phase."
    },
    {
      q: "Can I perform audits outside the active phase?",
      a: "No. The system only permits data entry and scheduling within the authorized window for Phase 1, 2, or 3. All other periods are read-only to maintain data integrity."
    }
  ];

  const isActivePhase = (phase: AuditPhase) => {
    const today = new Date().toISOString().split('T')[0];
    return today >= phase.startDate && today <= phase.endDate;
  };

  const tourSteps = [
    {
      title: "Strategic Phase Planning",
      desc: "Audit operations are locked to institutional phases. No date can be selected outside of an authorized window.",
      icon: CalendarCheck,
      color: "text-blue-500"
    },
    {
      title: "Conflict-of-Interest Engine",
      desc: "Our Matrix Engine ensures JKE staff never audit JKE assets. It automatically pairs departments based on asset counts and staff strength.",
      icon: Network,
      color: "text-indigo-500"
    },
    {
      title: "Auditor Certification Lock",
      desc: "Only staff with an active, Admin-issued certificate can self-assign to audits. If your cert expires, you are automatically locked out.",
      icon: Stamp,
      color: "text-emerald-500"
    },
    {
      title: "Self-Assignment Slots",
      desc: "Auditors pick their own slots from the available pool, reducing administrative workload for coordinators.",
      icon: UserPlus,
      color: "text-amber-500"
    },
    {
      title: "Live KPI Monitoring",
      desc: "Real-time tracking of completion percentages against institutional targets, weighted by asset complexity.",
      icon: PieChart,
      color: "text-rose-500"
    }
  ];

  return (
    <div className="min-h-[100dvh] bg-slate-50 overflow-x-hidden relative">
      {/* Background Decor */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        <div 
          ref={blob1Ref}
          className="absolute -top-[10%] -left-[10%] w-[40%] h-[40%] bg-blue-400/10 rounded-full blur-[120px] transition-transform duration-700 ease-out"
        ></div>
        <div 
          ref={blob2Ref}
          className="absolute top-[20%] -right-[5%] w-[30%] h-[30%] bg-indigo-400/10 rounded-full blur-[100px] transition-transform duration-1000 ease-out"
        ></div>
        <div className="absolute inset-0 opacity-[0.03] bg-dot-pattern"></div>
      </div>

      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-100 bg-white/80 backdrop-blur-md border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
            <div className="h-10 flex items-center justify-center">
               <img 
                 src={BRANDING.logoHorizontal} 
                 alt="Institutional Logo" 
                 className="h-8 w-auto object-contain" 
               />
            </div>
            <span className="text-xl font-black text-slate-900 tracking-tight">Inspect-<span className="text-blue-600">able</span></span>

          <div className="flex items-center gap-8">
            <button
              onClick={onShowKnowledgeBase}
              className="text-[10px] font-black uppercase text-slate-500 tracking-widest hover:text-blue-600 transition-colors flex items-center gap-2"
            >
              <BookOpen className="w-3 h-3" />
              Knowledge Base
            </button>
            <div className="hidden lg:block h-6 w-px bg-slate-200"></div>
            <span className="hidden lg:block text-[10px] font-black uppercase text-slate-400 tracking-widest">v{import.meta.env.VITE_APP_VERSION || '1.0.0'} Institutional Edition</span>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <main className="relative z-10 max-w-7xl mx-auto px-6 pt-32 md:pt-48 pb-20">
        <div className="grid lg:grid-cols-2 gap-16 items-start">
          <div className="animate-in fade-in slide-in-from-left-4 duration-1000">
            {/* Phase Timeline (Feature 1) */}
            {phases.length > 0 && (
              <div className="mb-12 flex flex-wrap gap-4 items-center">
                {phases.map((p, i) => {
                  const active = isActivePhase(p);
                  return (
                    <div key={p.id} className="flex items-center gap-2">
                      <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full border text-[10px] font-black uppercase transition-all duration-500 ${
                        active 
                          ? 'bg-blue-600 text-white border-blue-600 shadow-lg shadow-blue-500/30 scale-110' 
                          : 'bg-white text-slate-400 border-slate-200'
                      }`}>
                        {active && <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse"></span>}
                        {p.name}
                      </div>
                      {i < phases.length - 1 && <div className="w-4 h-px bg-slate-200"></div>}
                    </div>
                  );
                })}
              </div>
            )}

            <div className="flex items-center gap-4 mb-6">
              <div className="inline-flex items-center gap-2 px-3 py-1 bg-blue-50 text-blue-600 text-[10px] font-black uppercase rounded-full border border-blue-100">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse"></span>
                Secure Institutional Access
              </div>
            </div>
            <h1 className="text-5xl md:text-7xl font-black text-slate-900 leading-[1.1] mb-6 tracking-tight">
              Eliminate <span className="text-transparent bg-clip-text bg-linear-to-r from-blue-600 to-indigo-600">Bias</span> in Auditing.
            </h1>
            <p className="text-lg text-slate-500 mb-10 leading-relaxed max-w-lg font-medium">
              The central source of truth for Inspect-able operations. Understand how our anti-bias pairing works and how to manage institutional compliance.
            </p>

            <div className="flex flex-col sm:flex-row gap-4">
              <div className="space-y-4">
                <button
                  onClick={() => setIsAuthModalOpen(true)}
                  className="group flex items-center justify-center gap-4 px-10 py-5 bg-slate-900 text-white rounded-2xl text-lg font-bold hover:bg-slate-800 transition-all shadow-xl shadow-slate-900/10 active:scale-95"
                >
                  Enterprise Login
                  <ArrowRight className="w-6 h-6 group-hover:translate-x-1 transition-transform" />
                </button>
                <p className="text-xs text-slate-400 text-center">
                  Sign in with your <span className="font-bold text-slate-500">Institutional ID</span>
                </p>

              </div>
              <button
                onClick={() => setIsTourOpen(true)}
                className="flex items-center justify-center gap-2 px-8 py-5 bg-white border border-slate-200 text-slate-600 rounded-2xl text-lg font-bold hover:bg-slate-50 transition-all"
              >
                Take System Tour
              </button>
            </div>
          </div>


          <div className="relative animate-in fade-in slide-in-from-right-8 duration-1000 delay-200 hidden lg:block">
            <div className="relative bg-white rounded-[56px] shadow-2xl border border-slate-100 p-4">
              <div className="bg-slate-900 rounded-[44px] p-8 text-white min-h-100">
                <div className="flex items-center justify-between mb-8">
                  <div className="flex gap-2">
                    <div className="w-3 h-3 rounded-full bg-rose-500"></div>
                    <div className="w-3 h-3 rounded-full bg-amber-500"></div>
                    <div className="w-3 h-3 rounded-full bg-emerald-500"></div>
                  </div>
                  <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Live Dashboard Preview</span>
                </div>

                <div className="space-y-6">
                  {/* Department Spotlight (Feature 2) */}
                  {topDepartments.length > 0 && (
                    <div className="bg-white/5 p-4 rounded-2xl border border-white/10">
                      <div className="flex items-center gap-2 mb-3">
                        <Trophy className="w-4 h-4 text-amber-400" />
                        <span className="text-[10px] whitespace-nowrap font-black uppercase tracking-widest text-slate-300">Live Top Performers</span>
                      </div>
                      <div className="space-y-3">
                        {topDepartments.map((dept, idx) => (
                          <div key={dept.name} className="flex items-center justify-between group">
                            <div className="flex items-center gap-3">
                              <span className="text-[10px] font-black text-slate-500">0{idx + 1}</span>
                              <span className="text-xs font-bold text-slate-200 group-hover:text-white transition-colors">{dept.name}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <div className="h-1 w-12 bg-white/10 rounded-full overflow-hidden">
                                <DeptComplianceBar compliance={dept.compliance} />
                              </div>
                              <span className="text-[10px] font-mono text-emerald-400">{dept.compliance}%</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="bg-white/5 p-4 rounded-2xl border border-white/10">
                    <div className="flex justify-between items-end mb-2">
                      <span className="text-xs font-bold">Overall Compliance Progress</span>
                      <span className="text-[10px] font-mono text-emerald-400">
                        {complianceProgress !== undefined ? `${complianceProgress}%` : '---'}
                      </span>
                    </div>
                    <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                      <div 
                        ref={progressRef}
                        className="h-full bg-blue-500 rounded-full transition-all duration-1000 w-(--w)" 
                      ></div>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-white/5 p-4 rounded-2xl border border-white/10 text-center">
                      <p className="text-[10px] text-slate-500 font-bold uppercase mb-1">Total Assets</p>
                      <p className="text-2xl font-black">
                        {totalAssets !== undefined ? totalAssets.toLocaleString() : '---'}
                      </p>
                    </div>
                    <div className="bg-white/5 p-4 rounded-2xl border border-white/10 text-center">
                      <p className="text-[10px] text-slate-500 font-bold uppercase mb-1">Active Phases</p>
                      <p className="text-2xl font-black text-amber-500">
                        {totalPhases !== undefined ? String(totalPhases).padStart(2, '0') : '---'}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Live Activity Ticker (Feature 3) */}
        {activities.length > 0 && (
          <div className="mt-20 py-4 border-y border-slate-200 bg-white/50 backdrop-blur-sm overflow-hidden flex items-center gap-8 group">
            <div className="flex items-center gap-2 px-6 border-r border-slate-200 shrink-0">
              <History className="w-4 h-4 text-blue-600" />
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-900">Activity</span>
            </div>
            <div className="flex gap-12 animate-marquee-slower whitespace-nowrap">
              {activities.slice(0, 5).map((act, i) => (
                <div key={i} className="flex items-center gap-3">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{act.message}</span>
                </div>
              ))}
              {/* Duplicate for seamless scroll */}
              {activities.slice(0, 5).map((act, i) => (
                <div key={`dup-${i}`} className="flex items-center gap-3">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{act.message}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* FAQ Section (Feature 4) */}
        <section className="mt-40 max-w-3xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-black text-slate-900 mb-4">Staff FAQ</h2>
            <p className="text-slate-500 text-lg mt-1">Real-time status of your institutional asset inspection operations.</p>
          </div>
          <div className="space-y-4">
            {faqs.map((faq, i) => (
              <div 
                key={i}
                className="bg-white border border-slate-200 rounded-3xl overflow-hidden transition-all duration-300 hover:shadow-lg hover:shadow-slate-200/50"
              >
                <button
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  className="w-full px-8 py-6 flex items-center justify-between text-left"
                >
                  <span className="font-bold text-slate-900">{faq.q}</span>
                  <ChevronDown className={`w-5 h-5 text-slate-400 transition-transform duration-300 ${openFaq === i ? 'rotate-180' : ''}`} />
                </button>
                <div className={`transition-all duration-300 ease-in-out px-8 overflow-hidden ${openFaq === i ? 'max-h-40 pb-6 opacity-100' : 'max-h-0 opacity-0'}`}>
                  <p className="text-slate-500 leading-relaxed">{faq.a}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      </main>

      {/* AUTH MODAL */}
      {isAuthModalOpen && (
        <div className="fixed inset-0 z-1000 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm animate-in fade-in" onClick={() => setIsAuthModalOpen(false)}></div>
          <div className="relative bg-white w-full max-w-md rounded-[32px] shadow-2xl border border-slate-200 overflow-hidden animate-in zoom-in duration-300">
            <div className="p-8">
              <div className="flex justify-between items-center mb-8">
                <div>
                  <h3 className="text-2xl font-black text-slate-900">
                    {authMode === 'login' ? 'Enterprise Login' : authMode === 'register' ? 'Staff Registration' : 'Recover Access'}
                  </h3>
                  <p className="text-slate-500 text-sm">
                    {authMode === 'login' ? 'Welcome back, Auditor.' : authMode === 'register' ? 'Request your digital identity.' : 'Notify admin to reset your credentials.'}
                  </p>
                </div>
                <button onClick={() => setIsAuthModalOpen(false)} className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-400">
                  <X className="w-6 h-6" />
                </button>
              </div>

              {authError && (
                <div className="mb-6 p-4 bg-rose-50 border border-rose-100 rounded-2xl flex items-start gap-3">
                  <div className="p-1 px-1.5 bg-rose-500 text-white text-[10px] font-black rounded-lg shrink-0 mt-0.5">ERROR</div>
                  <p className="text-xs font-bold text-rose-600 leading-tight">{authError}</p>
                </div>
              )}

              <form onSubmit={handleAuthSubmit} className="space-y-4">
                {authMode === 'register' && (
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest px-1">Full Name</label>
                    <div className="relative">
                      <UserIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <input 
                        type="text" 
                        required
                        value={name}
                        onChange={e => setName(e.target.value)}
                        placeholder="John Doe"
                        className="w-full pl-12 pr-4 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                      />
                    </div>
                  </div>
                )}

                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest px-1">Institutional Email</label>
                  <div className="relative">
                    <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input 
                      type="email" 
                      required
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      placeholder="user@poliku.edu.my"
                      className="w-full pl-12 pr-4 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                    />
                  </div>
                </div>

                {authMode !== 'forgot-password' && (
                  <div className="space-y-1.5">
                    <div className="flex justify-between items-center px-1">
                      <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest">
                        {authMode === 'login' ? 'Access Password' : 'Create Password'}
                      </label>
                      {authMode === 'login' && (
                        <button 
                          type="button"
                          onClick={() => setAuthMode('forgot-password')}
                          className="text-[10px] font-bold text-blue-600 hover:text-blue-700"
                        >
                          Forgot Password?
                        </button>
                      )}
                    </div>
                    <div className="relative">
                      <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <input 
                        type="password" 
                        required={authMode !== 'forgot-password'}
                        value={password}
                        onChange={e => setPassword(e.target.value)}
                        placeholder="••••••••"
                        className="w-full pl-12 pr-4 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                      />
                    </div>
                  </div>
                )}

                {authMode === 'register' && (
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest px-1">Confirm Password</label>
                    <div className="relative">
                      <ShieldCheck className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <input 
                        type="password" 
                        required
                        value={confirmPassword}
                        onChange={e => setConfirmPassword(e.target.value)}
                        placeholder="••••••••"
                        className="w-full pl-12 pr-4 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                      />
                    </div>
                  </div>
                )}

                <button 
                  type="submit" 
                  disabled={authLoading}
                  className="w-full py-4 bg-slate-900 text-white rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-slate-800 transition-all active:scale-[0.98] disabled:opacity-50"
                >
                  {authLoading ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <>
                      {authMode === 'login' ? 'Authenticate' : authMode === 'register' ? 'Request Access' : 'Send Reset Request'}
                      <ArrowRight className="w-5 h-5" />
                    </>
                  )}
                </button>
              </form>

              <div className="mt-8 pt-6 border-t border-slate-100 text-center flex flex-col gap-3">
                <button 
                  onClick={() => setAuthMode(authMode === 'login' ? 'register' : 'login')}
                  className="text-xs font-bold text-slate-500 hover:text-blue-600 transition-colors"
                >
                  {authMode === 'login' ? "Don't have an account? Request Access" : "Already have an account? Sign In"}
                </button>
                {authMode === 'forgot-password' && (
                  <button 
                    onClick={() => setAuthMode('login')}
                    className="text-xs font-bold text-blue-600 hover:text-blue-700 transition-colors"
                  >
                    Back to Login
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TOUR OVERLAY */}
      {isTourOpen && (
        <div className="fixed inset-0 z-1000 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/90 backdrop-blur-xl animate-in fade-in" onClick={() => setIsTourOpen(false)}></div>
          <div className="relative bg-white w-full max-w-2xl rounded-[48px] shadow-2xl overflow-hidden animate-in zoom-in duration-300">
            <div className="p-8 md:p-12 text-center">
              <button
                onClick={() => setIsTourOpen(false)}
                title="Close tour"
                className="absolute top-8 right-8 text-slate-400 hover:text-slate-600"
              >
                <X className="w-8 h-8" />
              </button>

              <div className={`w-24 h-24 rounded-[32px] bg-slate-50 flex items-center justify-center text-4xl mx-auto mb-8 shadow-inner ${tourSteps[tourStep].color}`}>
                {React.createElement(tourSteps[tourStep].icon, { className: "w-12 h-12" })}
              </div>

              <div className="text-[10px] font-black uppercase text-blue-600 tracking-widest mb-4">Core Feature {tourStep + 1} of 5</div>
              <h3 className="text-3xl font-black text-slate-900 mb-6">{tourSteps[tourStep].title}</h3>
              <p className="text-slate-500 text-lg leading-relaxed max-w-md mx-auto mb-12">
                {tourSteps[tourStep].desc}
              </p>

              <div className="flex items-center justify-center gap-6">
                <button
                  onClick={() => setTourStep(prev => Math.max(0, prev - 1))}
                  disabled={tourStep === 0}
                  title="Previous"
                  className="w-12 h-12 rounded-full border border-slate-200 text-slate-400 hover:text-blue-600 hover:border-blue-200 transition-all disabled:opacity-30 flex items-center justify-center"
                >
                  <ArrowLeft className="w-5 h-5" />
                </button>

                <div className="flex gap-2">
                  {tourSteps.map((_, i) => (
                    <div key={i} className={`h-1.5 rounded-full transition-all ${i === tourStep ? 'w-8 bg-blue-600' : 'w-2 bg-slate-200'}`}></div>
                  ))}
                </div>

                <button
                  onClick={() => tourStep === 4 ? setIsTourOpen(false) : setTourStep(prev => prev + 1)}
                  title="Next"
                  className="w-12 h-12 rounded-full bg-blue-600 text-white hover:bg-blue-700 transition-all shadow-lg shadow-blue-500/20 flex items-center justify-center"
                >
                  {tourStep === 4 ? <Check className="w-5 h-5" /> : <ArrowRight className="w-5 h-5" />}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="border-t border-slate-200 py-16 bg-white relative z-10">
        <div className="max-w-7xl mx-auto px-6 text-center">
            <div className="h-8 flex items-center justify-center">
              <img 
                src={BRANDING.logoHorizontal} 
                alt="Institutional Logo" 
                className="h-6 w-auto object-contain" 
              />
            </div>
            <span className="text-sm font-black text-slate-900 tracking-tight">Inspect-<span className="text-blue-600">able</span></span>
          <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mb-4">© 2026 PKS Asset Management Unit</p>
          <a
            href="/privacy_policy.html"
            className="text-[10px] font-black uppercase text-blue-600/60 hover:text-blue-600 tracking-[0.2em] transition-colors"
          >
            Privacy Policy
          </a>
        </div>
      </footer>
    </div>
  );
};
