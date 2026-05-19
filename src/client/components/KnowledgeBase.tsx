import React, { useState } from 'react';
import { AuditFlow } from './docs/AuditFlow';
import { RBACMatrix } from './RBACMatrix';
import { SetupGuide } from './docs/SetupGuide';
import { Network, Shield, Rocket, Headset, Route, Flag, Building, BookOpen } from 'lucide-react';

import { PageHeader } from './PageHeader';
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
              { id: 'workflow', label: 'Audit Workflow', icon: Network },
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
        <div className="flex-grow space-y-20">
          <PageHeader
            title="Knowledge Base"
            icon={BookOpen}
            activePhase={activePhase}
            description="The central source of truth for Inspect-able operations. Understand how our anti-bias pairing works and how to manage institutional compliance."
          />

          {/* WORKFLOW SECTION */}
          <section id="workflow" className="scroll-mt-32">
            <div className="flex items-center gap-4 mb-8">
              <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center text-xl shadow-inner">
                <Route className="w-6 h-6" />
              </div>
              <h3 className="text-2xl font-black text-slate-900">Audit Lifecycle Workflow</h3>
            </div>
            <AuditFlow />
          </section>

          {/* PERMISSIONS SECTION */}
          <section id="permissions" className="scroll-mt-32">
            <div className="flex items-center gap-4 mb-8">
              <div className="w-12 h-12 bg-purple-50 text-purple-600 rounded-2xl flex items-center justify-center text-xl shadow-inner">
                <Shield className="w-6 h-6" />
              </div>
              <h3 className="text-2xl font-black text-slate-900">Access Control Matrix</h3>
            </div>
            <RBACMatrix hideHeader />
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
