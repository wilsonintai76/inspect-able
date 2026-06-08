import React, { useState } from 'react';
import { AuditFlow } from './docs/AuditFlow';
import { SetupGuide } from './docs/SetupGuide';
import { Network, Shield, Rocket, Headset, Route, Flag, Building, BookOpen, Users, UserCheck, UserCog, User, ShieldCheck, Check, X } from 'lucide-react';

import { AuditPhase } from '@shared/types';

type Section = 'workflow' | 'permissions' | 'setup';

interface KnowledgeBaseProps {
  phases?: AuditPhase[];
}

export const KnowledgeBase: React.FC<KnowledgeBaseProps> = ({ phases = [] }) => {
  const [activeSection, setActiveSection] = useState<Section>('workflow');

  const scrollToSection = (id: Section) => {
    setActiveSection(id);
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const activePhase = React.useMemo(() => {
    const today = new Date();
    return (phases || []).find(p => {
      const start = new Date(p.startDate);
      const end = new Date(p.endDate);
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
      return today >= start && today <= end;
    });
  }, [phases]);

  return (
    <div className="max-w-6xl mx-auto pb-20 w-full shrink-0 animate-in fade-in duration-500">
      <div className="flex flex-col lg:flex-row gap-12">
        {/* Sticky Internal Nav */}
        <aside className="lg:w-64 shrink-0">
          <div className="sticky top-24 space-y-2">
            <h4 className="px-4 mb-4 text-[10px] font-black uppercase text-slate-400 tracking-widest">Knowledge Nav</h4>
            {[
              { id: 'workflow', label: 'Inspection Workflow', icon: Network },
              { id: 'permissions', label: 'Access Matrix', icon: Shield },
              { id: 'setup', label: 'System Setup', icon: Rocket }
            ].map((item) => (
              <button
                key={item.id}
                onClick={() => scrollToSection(item.id as Section)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${
                  activeSection === item.id 
                    ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20' 
                    : 'text-slate-500 hover:bg-slate-100'
                }`}
              >
                <item.icon className="w-4 h-4" />
                <span className="text-xs font-bold">{item.label}</span>
              </button>
            ))}

            <div className="mt-10 p-5 bg-slate-900 rounded-3xl text-white relative overflow-hidden">
               <div className="relative z-10">
                  <p className="text-[10px] font-black uppercase text-blue-400 mb-2">Support</p>
                  <p className="text-xs leading-relaxed opacity-70 mb-4">Need help with pairing logic or phase setup?</p>
                  <button className="text-[10px] font-black uppercase tracking-widest bg-white/10 px-3 py-2 rounded-lg hover:bg-white/20 transition-all">Contact Admin</button>
               </div>
               <Headset className="absolute -right-4 -bottom-4 text-white/5 w-16 h-16" />
            </div>
          </div>
        </aside>

        {/* Content Area */}
        <div className="grow space-y-20">
          {/* WORKFLOW SECTION */}
          <section id="workflow" className="scroll-mt-32">
            <div className="flex items-center gap-4 mb-8">
              <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center text-xl shadow-inner">
                <Route className="w-6 h-6" />
              </div>
              <h3 className="text-2xl font-black text-slate-900">Inspection Lifecycle Workflow</h3>
            </div>
            <AuditFlow />
          </section>

          {/* PERMISSIONS SECTION */}
          <section id="permissions" className="scroll-mt-32">
            <div className="flex items-center gap-4 mb-8">
              <div className="w-12 h-12 bg-purple-50 text-purple-600 rounded-2xl flex items-center justify-center text-xl shadow-inner">
                <Shield className="w-6 h-6" />
              </div>
              <h3 className="text-2xl font-black text-slate-900">Policy-Based Access Control (PBAC)</h3>
            </div>

            {/* ── Designation vs Role ──────────────────────────────────── */}
            <div className="bg-white rounded-2xl border border-slate-200 p-6 mb-6">
              <h4 className="text-sm font-black text-slate-900 mb-3 flex items-center gap-2">
                <UserCheck className="w-4 h-4 text-blue-500" />
                Designation → Role Binding
              </h4>
              <p className="text-xs text-slate-500 mb-4">
                <strong>Designation</strong> is your organisational title (appointment). <strong>Role</strong> controls system access. Roles are auto-bound to designation. Only Admin can promote users to the Admin role.
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-slate-50">
                      <th className="px-4 py-2 text-left text-[10px] font-black uppercase text-slate-400">Designation (Org Title)</th>
                      <th className="px-4 py-2 text-center text-[10px] font-black uppercase text-slate-400">→</th>
                      <th className="px-4 py-2 text-left text-[10px] font-black uppercase text-slate-400">Auto-Bound Role</th>
                      <th className="px-4 py-2 text-left text-[10px] font-black uppercase text-slate-400">Admin can promote to</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {[
                      ['Coordinator', 'Coordinator', 'Admin'],
                      ['Supervisor', 'Supervisor', 'Admin'],
                      ['Head Of Department', 'Head Of Programme', 'Staff', 'Admin'],
                      ['Staff', 'Staff', 'Admin'],
                    ].map(([des, role, promote]) => (
                      <tr key={des} className="hover:bg-slate-50/30">
                        <td className="px-4 py-2.5 font-bold text-slate-800">{des}</td>
                        <td className="px-4 py-2.5 text-center text-slate-300">→</td>
                        <td className="px-4 py-2.5 font-bold text-indigo-600">{role}</td>
                        <td className="px-4 py-2.5 text-purple-600 font-medium">{promote}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-3 text-[10px] text-amber-600 bg-amber-50 rounded-lg px-3 py-2 border border-amber-100">
                ⚠️ Role changes between Staff/Supervisor/Coordinator are NOT allowed — roles are bound to designation. Only promotion to Admin (or demotion from Admin) is permitted.
              </p>
            </div>

            {/* ── Role Hierarchy ──────────────────────────────────────── */}
            <div className="bg-white rounded-2xl border border-slate-200 p-6 mb-6">
              <h4 className="text-sm font-black text-slate-900 mb-3 flex items-center gap-2">
                <Users className="w-4 h-4 text-purple-500" />
                Role Hierarchy
              </h4>
              <p className="text-xs text-slate-500 mb-4">
                Higher roles inherit ALL capabilities of lower roles. Each user has exactly ONE role (single selection).
              </p>
              <div className="flex flex-wrap gap-2 justify-center py-4">
                {[
                  { role: 'Admin', color: 'bg-purple-600', desc: 'Full system access' },
                  { role: 'Coordinator', color: 'bg-amber-500', desc: 'Department admin' },
                  { role: 'Supervisor', color: 'bg-indigo-500', desc: 'Location oversight' },
                  { role: 'Staff', color: 'bg-slate-400', desc: 'View only' },
                ].map((r, i) => (
                  <React.Fragment key={r.role}>
                    <div className={`${r.color} text-white rounded-xl px-4 py-3 text-center min-w-25`}>
                      <div className="text-sm font-black">{r.role}</div>
                      <div className="text-[9px] opacity-80 mt-0.5">{r.desc}</div>
                    </div>
                    {i < 3 && <div className="flex items-center text-slate-300 font-black text-lg">›</div>}
                  </React.Fragment>
                ))}
              </div>
            </div>

            {/* ── Capabilities per Role ────────────────────────────────── */}
            <div className="space-y-4">
              <h4 className="text-sm font-black text-slate-900 flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-500" />
                Capabilities by Role
              </h4>

              {/* Admin */}
              <div className="bg-white rounded-2xl border border-purple-200 p-5">
                <h5 className="text-sm font-black text-purple-700 mb-2 flex items-center gap-2">
                  <UserCog className="w-4 h-4" /> Admin <span className="text-[10px] text-purple-400 font-medium">(system:admin)</span>
                </h5>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-1.5 text-[11px]">
                  {['Full dashboard + Institutional widgets','Officer workload roster','Dept staffing gaps','Manage all schedules','Assign officers (any dept)','Create/delete inspections (all)','Manage users (all depts)','Manage departments','Manage locations & buildings','Manage inspection groups','Manage mappings','System settings','Backup & restore','Reset operations','Manage permissions'].map(c => (
                    <div key={c} className="flex items-start gap-1.5"><Check className="w-3 h-3 text-emerald-500 mt-0.5 shrink-0" /><span className="text-slate-700">{c}</span></div>
                  ))}
                </div>
              </div>

              {/* Coordinator */}
              <div className="bg-white rounded-2xl border border-amber-200 p-5">
                <h5 className="text-sm font-black text-amber-700 mb-2 flex items-center gap-2">
                  <UserCog className="w-4 h-4" /> Coordinator <span className="text-[10px] text-amber-400 font-medium">(manage:departments, own dept only)</span>
                </h5>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-1.5 text-[11px]">
                  {['Dashboard (dept-scoped)','View all schedules (own dept)','Assign officers (own dept)','Create/delete inspections (own dept)','Manage users (own dept)','Manage own department','Manage locations (own dept)','Manage inspection groups','Manage mappings'].map(c => (
                    <div key={c} className="flex items-start gap-1.5"><Check className="w-3 h-3 text-emerald-500 mt-0.5 shrink-0" /><span className="text-slate-700">{c}</span></div>
                  ))}
                </div>
                <h6 className="text-[10px] font-black text-red-500 mt-2 uppercase">Cannot</h6>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-1 text-[11px] mt-1">
                  {['System settings','KPI/Phase management','Manage permissions','Auto-assign','Reset operations','Access other depts'].map(c => (
                    <div key={c} className="flex items-start gap-1.5"><X className="w-3 h-3 text-red-400 mt-0.5 shrink-0" /><span className="text-slate-400">{c}</span></div>
                  ))}
                </div>
              </div>

              {/* Supervisor */}
              <div className="bg-white rounded-2xl border border-indigo-200 p-5">
                <h5 className="text-sm font-black text-indigo-700 mb-2 flex items-center gap-2">
                  <User className="w-4 h-4" /> Supervisor <span className="text-[10px] text-indigo-400 font-medium">(manage:locations)</span>
                </h5>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-1.5 text-[11px]">
                  {['Dashboard (basic)','View own schedules','Self-assign to slots','Manage locations (own)','View dept members'].map(c => (
                    <div key={c} className="flex items-start gap-1.5"><Check className="w-3 h-3 text-emerald-500 mt-0.5 shrink-0" /><span className="text-slate-700">{c}</span></div>
                  ))}
                </div>
              </div>

              {/* Staff */}
              <div className="bg-white rounded-2xl border border-slate-200 p-5">
                <h5 className="text-sm font-black text-slate-700 mb-2 flex items-center gap-2">
                  <User className="w-4 h-4" /> Staff <span className="text-[10px] text-slate-400 font-medium">(view:dashboard only)</span>
                </h5>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-1.5 text-[11px]">
                  {['View dashboard'].map(c => (
                    <div key={c} className="flex items-start gap-1.5"><Check className="w-3 h-3 text-emerald-500 mt-0.5 shrink-0" /><span className="text-slate-700">{c}</span></div>
                  ))}
                </div>
              </div>

              {/* Certified Inspector (cross-cutting) */}
              <div className="bg-white rounded-2xl border border-emerald-200 p-5">
                <h5 className="text-sm font-black text-emerald-700 mb-2 flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4" /> Certified Inspector <span className="text-[10px] text-emerald-400 font-medium">(cross-cutting — any role + valid cert)</span>
                </h5>
                <p className="text-xs text-slate-500 mb-2">
                  Not a role — a <strong>capability overlay</strong>. Any user with a valid <code>certificationExpiry</code> date automatically gains inspector capabilities regardless of their base role.
                </p>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-1.5 text-[11px]">
                  {['Self-assign to inspection slots','Access Personal Dashboard','Use Inspection Kiosk','Upload inspection reports','Toggle inspection status'].map(c => (
                    <div key={c} className="flex items-start gap-1.5"><Check className="w-3 h-3 text-emerald-500 mt-0.5 shrink-0" /><span className="text-slate-700">{c}</span></div>
                  ))}
                </div>
              </div>
            </div>
          </section>

          {/* SETUP GUIDE SECTION */}
          <section id="setup" className="scroll-mt-32">
            <div className="flex items-center gap-4 mb-8">
              <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center text-xl shadow-inner">
                <Flag className="w-6 h-6" />
              </div>
              <h3 className="text-2xl font-black text-slate-900">Institutional Setup Guide</h3>
            </div>
            <SetupGuide />
          </section>

          {/* Footer */}
          <footer className="pt-20 border-t border-slate-100 text-center">
             <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-6">
                <Building className="w-8 h-8 text-slate-300" />
             </div>
             <p className="text-slate-400 text-xs font-bold uppercase tracking-widest">© 2026 PKS Asset Management Unit • v2.5.0</p>
          </footer>
        </div>
      </div>
    </div>
  );
};
