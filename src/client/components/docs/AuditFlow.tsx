
import React from 'react';
import { Shield, CalendarCheck, Bot, Network, UserRoundPen, MousePointer2, PieChart, ClipboardCheck, GitBranch } from 'lucide-react';

export const AuditFlow: React.FC = () => {
  const steps = [
    {
      id: 1,
      title: "Strategic Phase Planning",
      role: "Admin Action",
      roleIcon: Shield,
      color: "blue",
      icon: CalendarCheck,
      desc: "The lifecycle begins with the definition of temporal 'Audit Phases'. This creates a bounded timeframe (e.g., 'Q1 2026') used to validate all subsequent scheduling actions.",
      logic: "System locks all date pickers to the defined start/end range. Audits cannot be created outside an active phase."
    },
    {
      id: 2,
      title: "KPI Pairing Simulator",
      role: "System Automation",
      roleIcon: Bot,
      color: "indigo",
      icon: Network,
      desc: "The intelligent Pairing Engine calculates Audit load mathematically based on '2-Person Teams'. It drafts a conflict-free projected matrix to hit Institutional KPI percentages.",
      logic: "Teams = Floor(Auditors/2) -> Matches high-asset targets to available teams -> Stops exactly at KPI % -> Admin visualizes and refines -> Commits Draft."
    },
    {
      id: 3,
      title: "Auditor Self-Assignment",
      role: "Auditor Action",
      roleIcon: UserRoundPen,
      color: "emerald",
      icon: MousePointer2,
      desc: "Certified staff log in to view open slots. They use the 'Department', 'Block', and 'Level' filters to quickly locate specific audit targets authorized by the Matrix.",
      logic: "Validates User Role + Certification Expiry + Matrix Permission before allowing a write to the 'AuditSchedule' table."
    },
    {
      id: 4,
      title: "Execution & KPI Tracking",
      role: "System & Admin",
      roleIcon: PieChart,
      color: "rose",
      icon: ClipboardCheck,
      desc: "As audits are marked 'Completed', the system updates live dashboards. Progress is tracked against specific 'Asset Tiers' defined for the phase.",
      logic: "Aggregates completion status -> Updates 'KPIStatsWidget' -> Calculates percentage vs. Tier Target."
    }
  ];

  return (
    <div className="relative py-8">
      {/* Central Timeline Line (Hidden on mobile) */}
      <div className="absolute left-8 top-4 bottom-4 w-0.5 bg-slate-200 hidden md:block"></div>

      <div className="space-y-16">
        {steps.map((step, idx) => {
          const isLast = idx === (steps?.length || 0) - 1;
          
          // Color mappings
          const colorStyles = {
            blue: { bg: 'bg-blue-50', text: 'text-blue-600', border: 'border-blue-200', iconBg: 'bg-blue-600' },
            indigo: { bg: 'bg-indigo-50', text: 'text-indigo-600', border: 'border-indigo-200', iconBg: 'bg-indigo-600' },
            emerald: { bg: 'bg-emerald-50', text: 'text-emerald-600', border: 'border-emerald-200', iconBg: 'bg-emerald-600' },
            rose: { bg: 'bg-rose-50', text: 'text-rose-600', border: 'border-rose-200', iconBg: 'bg-rose-600' },
          }[step.color] || { bg: 'bg-slate-50', text: 'text-slate-600', border: 'border-slate-200', iconBg: 'bg-slate-600' };

          return (
            <div key={step.id} className="relative flex flex-col md:flex-row gap-8 group">
              
              {/* Timeline Node */}
              <div className="hidden md:flex flex-col items-center absolute left-0 w-16 h-full pointer-events-none">
                <div className={`w-16 h-16 rounded-2xl flex items-center justify-center text-2xl text-white shadow-xl z-10 transition-transform group-hover:scale-110 duration-300 ${colorStyles.iconBg}`}>
                  <step.icon className="w-8 h-8" />
                </div>
                {!isLast && <div className="grow w-0.5 bg-slate-200 my-2"></div>}
              </div>

              {/* Mobile Icon (Visible only on small screens) */}
              <div className="md:hidden flex items-center gap-4 mb-2">
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-xl text-white shadow-lg ${colorStyles.iconBg}`}>
                  <step.icon className="w-6 h-6" />
                </div>
                <div className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border ${colorStyles.bg} ${colorStyles.text} ${colorStyles.border}`}>
                  Step 0{step.id}
                </div>
              </div>

              {/* Content Card */}
              <div className="grow md:pl-24">
                <div className="bg-white rounded-[32px] border border-slate-200 p-8 shadow-sm hover:shadow-md transition-shadow relative overflow-hidden">
                  
                  {/* Decorative Background Number */}
                  <div className="absolute -right-4 -top-6 text-[120px] font-black text-slate-50 opacity-50 pointer-events-none select-none">
                    {step.id}
                  </div>

                  <div className="relative z-10">
                    <div className="flex items-center gap-3 mb-4">
                      <div className={`hidden md:inline-flex items-center gap-2 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border ${colorStyles.bg} ${colorStyles.text} ${colorStyles.border}`}>
                        Step 0{step.id}
                      </div>
                      <div className="flex items-center gap-2 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                        <step.roleIcon className="w-3 h-3" />
                        {step.role}
                      </div>
                    </div>

                    <h3 className="text-2xl font-black text-slate-900 mb-4 tracking-tight">{step.title}</h3>
                    
                    <p className="text-slate-500 font-medium leading-relaxed mb-6 max-w-2xl">
                      {step.desc}
                    </p>

                    {/* System Logic Box */}
                    <div className="bg-slate-50 rounded-2xl p-5 border border-slate-100 flex gap-4">
                      <div className="shrink-0 mt-1">
                        <GitBranch className="w-5 h-5 text-slate-300" />
                      </div>
                      <div>
                        <h5 className="text-xs font-black text-slate-700 uppercase mb-1">Under the Hood</h5>
                        <p className="text-xs text-slate-500 font-mono leading-relaxed">
                          {step.logic}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Final Success State */}
      <div className="relative flex flex-col md:flex-row gap-8 mt-16 group opacity-60 hover:opacity-100 transition-opacity">
         <div className="hidden md:flex flex-col items-center absolute left-0 w-16 h-16 pointer-events-none">
            <div className="w-4 h-4 rounded-full bg-slate-200 mt-6 group-hover:bg-emerald-400 transition-colors"></div>
         </div>
         <div className="grow md:pl-24 text-center md:text-left">
            <p className="text-sm font-bold text-slate-400 uppercase tracking-widest">Workflow Complete</p>
         </div>
      </div>
    </div>
  );
};
