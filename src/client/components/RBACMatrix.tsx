import React from 'react';
import { Lock, ShieldCheck, Eye, Calendar, UserCheck, Users, UserPlus, Edit, ShieldAlert, Network, CheckCircle2, XCircle, Info } from 'lucide-react';
import { useRBAC } from '../contexts/RBACContext';
import { UserRole } from '@shared/types';

interface RBACMatrixProps {
  showToast?: (message: string, type?: 'success' | 'warning' | 'error' | 'info') => void;
}

const Zap = ({ className }: { className?: string }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <path d="M4 14.71 13 4v6.29L20 9.29 11 20v-6.29L4 14.71z" />
  </svg>
);

const ROLES_MATRIX: { id: UserRole; label: string; icon: any; color: string; bg: string }[] = [
  { id: 'Admin',       label: 'Admin',       icon: ShieldCheck, color: 'text-rose-600',    bg: 'bg-rose-50 border-rose-100' },
  { id: 'Coordinator', label: 'Coordinator', icon: Network,     color: 'text-indigo-600',  bg: 'bg-indigo-50 border-indigo-100' },
  { id: 'Supervisor',  label: 'Supervisor',  icon: Eye,         color: 'text-amber-600',   bg: 'bg-amber-50 border-amber-100' },
  { id: 'Auditor',     label: 'Officer',     icon: UserCheck,   color: 'text-emerald-600', bg: 'bg-emerald-50 border-emerald-100' },
  { id: 'Staff',       label: 'Staff',       icon: Users,       color: 'text-slate-500',   bg: 'bg-slate-50 border-slate-100' },
];

// Mirrors RBAC_ROLE_MATRIX.md row-by-row
const PERMISSIONS_LIST = [
  {
    id: 'general',
    label: 'General',
    actions: [
      { id: 'view:overview', label: 'Institutional Overview', icon: Eye },
    ]
  },
  {
    id: 'inspection:schedule',
    label: 'Inspection Schedule',
    actions: [
      { id: 'view:schedule:all',        label: 'View All Dept Schedules',         icon: Eye },
      { id: 'view:schedule:own',        label: 'View Own Dept Schedule',          icon: Eye },
      { id: 'view:schedule:matrix',     label: 'View Cross-Audit Dept Schedules', icon: Eye,       hint: 'Includes Audit Matrix' },
      { id: 'edit:audit:date',          label: 'Set Audit Dates',                 icon: Calendar,  hint: 'Supervisor has priority; Coordinator if Supervisor has not yet set' },
      { id: 'edit:audit:assign',        label: 'Self-Assign (Internal Audit)',    icon: UserCheck, hint: 'COI & matrix rules enforced' },
      { id: 'edit:audit:assign',        label: 'Self-Assign (Cross-Audit)',       icon: UserCheck, hint: 'COI & matrix rules enforced' },
      { id: 'edit:audit:assign:others', label: 'Assign Others (Schedule)',        icon: Users },
      { id: 'edit:audit:auto_assign',   label: 'Auto-Assign',                     icon: Zap },
    ]
  },
  {
    id: 'officer:hub',
    label: 'Officer Hub',
    actions: [
      { id: 'view:audit:assigned', label: 'Access Officer Hub', icon: Eye, hint: 'Requires active institutional certificate' },
    ]
  },
  {
    id: 'user:management',
    label: 'User Management',
    actions: [
      { id: 'view:team:all', label: 'View All Members',  icon: Eye },
      { id: 'view:team:own', label: 'View Dept Members', icon: Users },
      { id: 'edit:team',     label: 'Add / Edit Team',   icon: UserPlus },
    ]
  },
  {
    id: 'data',
    label: 'Data Registries',
    actions: [
      { id: 'manage:departments', label: 'Department Registry', icon: Edit, hint: 'Coordinator: HOD assign only; name/abbr/assets locked' },
      { id: 'manage:locations',   label: 'Location Registry',   icon: Edit, hint: 'Supervisor: self-assign as Supervisor only; cannot assign others' },
    ]
  },
  {
    id: 'system',
    label: 'System',
    actions: [
      { id: 'view:admin:dashboard', label: 'Admin Hub',       icon: ShieldAlert, hint: 'Coordinator: own department only' },
      { id: 'manage:system',        label: 'System Settings', icon: Lock },
    ]
  },
];

export const RBACMatrix: React.FC<RBACMatrixProps> = () => {
  const { rbacMatrix } = useRBAC();

  if (!rbacMatrix) return null;

  return (
    <div className="bg-white rounded-[40px] p-8 md:p-12 border border-slate-200 shadow-xl animate-in fade-in slide-in-from-bottom-5 overflow-hidden">

      {/* ── Header ─────────────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-10">
        <div className="flex items-center gap-5">
          <div className="w-14 h-14 bg-indigo-600 rounded-[20px] flex items-center justify-center text-white shadow-2xl shadow-indigo-500/40">
            <Lock className="w-7 h-7" />
          </div>
          <div>
            <h3 className="text-2xl font-black text-slate-900 tracking-tight">Institutional RBAC Matrix</h3>
            <p className="text-sm text-slate-500 font-medium">Full horizontal visibility across all roles and permissions.</p>
          </div>
        </div>
        <div className="flex items-center gap-2 px-4 py-2 bg-slate-100 rounded-full border border-slate-200 shrink-0">
          <Info className="w-3.5 h-3.5 text-slate-400" />
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Read-only view</span>
        </div>
      </div>

      {/* ── Matrix Table ────────────────────────────────────────── */}
      <div className="relative overflow-auto border border-slate-100 rounded-[32px] bg-slate-50/30 max-h-[680px] scrollbar-thin scrollbar-thumb-slate-200">
        <table className="w-full text-left border-collapse" style={{ minWidth: '780px' }}>
          <thead className="sticky top-0 z-20 bg-white border-b border-slate-100 shadow-sm">
            <tr className="bg-slate-50">
              <th className="py-5 px-8 text-[10px] font-black uppercase text-slate-400 tracking-widest w-2/5">
                Permissions &amp; Actions
              </th>
              {ROLES_MATRIX.map(role => (
                <th key={role.id} className="py-5 px-3 text-center">
                  <div className="flex flex-col items-center gap-2">
                    <div className={`p-2 rounded-xl border ${role.bg} ${role.color}`}>
                      <role.icon className="w-4 h-4" />
                    </div>
                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-600">
                      {role.label}
                    </span>
                  </div>
                </th>
              ))}
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-100">
            {PERMISSIONS_LIST.map((section) => (
              <React.Fragment key={section.id}>
                {/* Section header row */}
                <tr>
                  <td
                    colSpan={6}
                    className="py-2.5 px-8 text-[10px] font-black uppercase tracking-[0.2em] text-indigo-500 bg-indigo-50/40 border-y border-indigo-100/40"
                  >
                    {section.label}
                  </td>
                </tr>

                {/* Action rows */}
                {section.actions.map((action, actionIdx) => {
                  const allowedRoles = rbacMatrix[action.id] || [];
                  return (
                    <tr
                      key={`${action.id}-${actionIdx}`}
                      className="hover:bg-slate-50/60 transition-colors group"
                    >
                      {/* Action label */}
                      <td className="py-4 px-8">
                        <div className="flex items-center gap-3">
                          <div className="w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center text-slate-400 group-hover:bg-indigo-50 group-hover:text-indigo-500 transition-all shrink-0">
                            <action.icon className="w-3.5 h-3.5" />
                          </div>
                          <div className="flex flex-col min-w-0">
                            <span className="text-sm font-semibold text-slate-800 leading-tight">
                              {action.label}
                            </span>
                            {action.hint && (
                              <span className="text-[9px] text-slate-400 font-medium mt-0.5 leading-tight">
                                {action.hint}
                              </span>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Role cells — read-only */}
                      {ROLES_MATRIX.map(role => {
                        const isAllowed = allowedRoles.includes(role.id);
                        return (
                          <td key={role.id} className="py-4 px-3 text-center">
                            <div className="flex justify-center">
                              {isAllowed ? (
                                <CheckCircle2
                                  className={`w-5 h-5 ${role.color} drop-shadow-sm`}
                                  aria-label={`${role.label}: allowed`}
                                />
                              ) : (
                                <XCircle
                                  className="w-5 h-5 text-slate-200"
                                  aria-label={`${role.label}: not allowed`}
                                />
                              )}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── Legend ──────────────────────────────────────────────── */}
      <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="p-5 bg-indigo-50/50 rounded-2xl flex items-start gap-3 border border-indigo-100/50">
          <ShieldCheck className="w-4 h-4 text-indigo-500 shrink-0 mt-0.5" />
          <p className="text-[11px] text-slate-600 font-medium leading-relaxed">
            <span className="font-black text-indigo-700 uppercase tracking-widest mr-1.5">Note:</span>
            Administrators are permanently granted access to all critical system functions.
            Self-assignment is strictly limited to users holding an active institutional certificate.
            Coordinator and Supervisor scheduling permissions follow a priority order defined in the matrix.
          </p>
        </div>
        <div className="p-5 bg-amber-50/40 rounded-2xl flex items-start gap-3 border border-amber-100/50">
          <Info className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
          <p className="text-[11px] text-slate-600 font-medium leading-relaxed">
            <span className="font-black text-amber-700 uppercase tracking-widest mr-1.5">Read-only:</span>
            This matrix reflects the current system policy as defined in RBAC_ROLE_MATRIX.md.
            Changes to role permissions require a system-level configuration update by an administrator.
          </p>
        </div>
      </div>

    </div>
  );
};
