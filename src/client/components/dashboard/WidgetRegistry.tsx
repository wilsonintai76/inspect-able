/**
 * Widget Registry — PBAC-gated dashboard widgets.
 * Each widget declares a required capability. The dashboard renders
 * only widgets the current user's capabilities unlock.
 *
 * The registry defines WHAT to render and WHO can see it.
 * UnifiedDashboard handles data computation and widget iteration.
 */
import React from 'react';
import { User, AuditSchedule, AuditPhase, KPITier, Department, Location, InstitutionKPITarget, AuditGroup, SystemActivity, KPITierTarget } from '@shared/types';

// ── Widget Definition ──────────────────────────────────────────────────────

export interface DashboardWidget {
  /** Unique widget identifier */
  id: string;
  /** Display order (lower = first) */
  priority: number;
  /** Required PBAC capability — widget only renders if user holds this */
  capability: string | null; // null = always shown (Guest minimum)
  /** Optional: invert the capability check (show if user does NOT hold it) */
  capabilityInvert?: boolean;
  /** Render the widget */
  render: (props: DashboardWidgetProps) => React.ReactNode;
}

// ── Shared Props passed to every widget ─────────────────────────────────────

export interface DashboardWidgetProps {
  currentUser: User;
  schedules: AuditSchedule[];
  scopedSchedules: AuditSchedule[];
  phases: AuditPhase[];
  kpiTiers: KPITier[];
  departments: Department[];
  locations: Location[];
  scopedLocations: Location[];
  users: User[];
  scopedUsers: User[];
  activities: SystemActivity[];
  buildings: any[];
  institutionKPIs: InstitutionKPITarget[];
  kpiTierTargets: KPITierTarget[];
  auditGroups: AuditGroup[];
  openAuditThreshold: number;
  maxAssetsPerDay: number;
  // Pre-computed data
  auditStats: { total: number; assigned: number; inProgress: number; completed: number; awaitingApproval: number; totalAssets: number };
  myAudits: AuditSchedule[];
  officerStats: { total: number; completed: number; inProgress: number; pending: number; completionRate: number; workload: number };
  pendingDeletions: Location[];
  awaitingApprovals: AuditSchedule[];
  certWatch: { expired: User[]; expiringSoon: User[] };
  auditGaps: { date: AuditSchedule[]; auditors: AuditSchedule[]; total: number };
  incompleteUsers: User[];
  renewalRequests: User[];
  approvalReminderAuditIds: Set<string>;
  canResendReminder: (d: string | null) => boolean;
  inspectionStats: Record<string, any>;
  officerWorkloadStats: any[];
  supervisorLocationAudits: AuditSchedule[];
  supervisorApprovals: AuditSchedule[];
  departmentStaffingGaps: { name: string; officers: number; gap: string }[];
  getBuildingAbbr: (id?: string | null) => string;
  // Callbacks
  onSendEmail?: (id: string) => void;
  onApproveArchive?: (id: string) => void;
  onRejectArchive?: (id: string) => void;
  onApproveCert?: (u: User) => void;
  onRequestRenewal?: () => void;
  onUpdateDate?: (id: string, d: string) => void;
  onUpdateAudit?: (id: string, u: Partial<AuditSchedule>) => Promise<void>;
  onNavigateToSchedule?: (auditId?: string) => void;
  setUploadAudit: (a: AuditSchedule | null) => void;
  dashboardConfig?: any;
}

// ── Widget Registry ─────────────────────────────────────────────────────────

import { StatCard } from './Widgets';
import { AdminSection } from './AdminSection';
import { SupervisorSection } from './SupervisorSection';
import { InstitutionalSection } from './InstitutionalSection';
import { KPIStatsWidget } from '../KPIStatsWidget';
import { Package, Calendar, CheckCircle2, Clock, AlertTriangle, LayoutDashboard, Trophy, History, Users, Shield, TrendingUp, UserX } from 'lucide-react';

export const WIDGET_REGISTRY: DashboardWidget[] = [

  // ── Guest (core dashboard — everyone sees these) ────────────────────
  {
    id: 'kpi-analytics',
    priority: 5,
    capability: null, // always shown
    render: (p) => (
      <div className="rounded-3xl border border-slate-200 bg-white shadow-sm p-6">
        <h3 className="text-sm font-black text-slate-900 mb-4 flex items-center gap-2">
          <Trophy className="w-4 h-4 text-amber-500" />KPI Progress
        </h3>
        <KPIStatsWidget
          schedules={p.schedules} phases={p.phases} kpiTiers={p.kpiTiers}
          departments={p.departments} locations={p.locations}
          kpiTierTargets={p.kpiTierTargets} institutionKPIs={p.institutionKPIs}
        />
      </div>
    ),
  },

  // ── Guest — Institutional Health Stats ──────────────────────────────
  {
    id: 'health-stats',
    priority: 7,
    capability: null,
    render: (p) => {
      const overloaded = p.officerWorkloadStats.filter((o: any) => o.assets >= p.openAuditThreshold).length;
      return (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard icon={Shield} label="Certified Officers" value={p.officerWorkloadStats.length} color="text-indigo-600" />
          <StatCard icon={TrendingUp} label="Overloaded Officers" value={overloaded} color="text-rose-600" />
          <StatCard icon={AlertTriangle} label="Depts With Gaps" value={p.departmentStaffingGaps.length} color="text-amber-600" />
          <StatCard icon={UserX} label="Unassigned Slots" value={p.auditGaps.auditors.length} color="text-orange-600" />
        </div>
      );
    },
  },

  // ── Admin Section ───────────────────────────────────────────────────
  {
    id: 'admin-section',
    priority: 40,
    capability: null,
    render: (p) => (
      <AdminSection
        awaitingApprovals={p.awaitingApprovals} pendingDeletions={p.pendingDeletions}
        certWatch={p.certWatch} auditGaps={p.auditGaps}
        incompleteUsers={p.incompleteUsers} renewalRequests={p.renewalRequests}
        approvalReminderAuditIds={p.approvalReminderAuditIds}
        canResendReminder={p.canResendReminder} locations={p.scopedLocations}
        departments={p.departments} onSendEmail={p.onSendEmail}
        onApproveArchive={p.onApproveArchive} onRejectArchive={p.onRejectArchive}
        onApproveCert={p.onApproveCert} getBuildingAbbr={p.getBuildingAbbr}
      />
    ),
  },

  // ── Guest — Stats Cards ─────────────────────────────────────────────
  {
    id: 'stats-cards',
    priority: 10,
    capability: null, // always shown
    render: (p) => (
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <StatCard icon={Package} label="Total Assets" value={p.auditStats.totalAssets.toLocaleString()} color="text-slate-700" />
        <StatCard icon={Calendar} label="Total Slots" value={p.auditStats.total} color="text-blue-600" />
        <StatCard icon={CheckCircle2} label="Assigned" value={p.auditStats.assigned} color="text-emerald-600" />
        <StatCard icon={Clock} label="In Progress" value={p.auditStats.inProgress} color="text-amber-600" />
        <StatCard icon={AlertTriangle} label="Awaiting Approval" value={p.auditStats.awaitingApproval} color="text-orange-500" />
        <StatCard icon={CheckCircle2} label="Completed" value={p.auditStats.completed} color="text-green-600" />
      </div>
    ),
  },

  // ── Supervisor Approvals + Location Inspections ─────────────────────
  {
    id: 'supervisor-section',
    priority: 20,
    capability: null,
    render: (p) => {
      if (p.supervisorLocationAudits.length === 0) return null;
      return (
        <SupervisorSection
          supervisorApprovals={p.supervisorApprovals}
          supervisorLocationAudits={p.supervisorLocationAudits}
          approvalReminderAuditIds={p.approvalReminderAuditIds}
          canResendReminder={p.canResendReminder}
          locations={p.locations}
          onSendEmail={p.onSendEmail}
          onNavigateToSchedule={p.onNavigateToSchedule}
        />
      );
    },
  },

  // ── Guest — Inspection Status + Officer Workload ────────────────────
  {
    id: 'inspection-status',
    priority: 15,
    capability: null, // always shown
    render: (p) => (
      <div className="rounded-3xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="p-5 border-b border-slate-100 flex items-center justify-between">
          <h3 className="text-sm font-black text-slate-900 flex items-center gap-2">
            <LayoutDashboard className="w-4 h-4 text-indigo-500" />Institutional Inspection Status
          </h3>
          <span className="text-[10px] text-slate-400 font-bold">{Object.keys(p.inspectionStats).length} depts</span>
        </div>
        <div className="overflow-x-auto max-h-96 overflow-y-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 sticky top-0">
              <tr>
                <th className="px-4 py-3 text-[10px] font-black uppercase text-slate-400">Department</th>
                <th className="px-3 py-3 text-[10px] font-black uppercase text-slate-400 text-center">Assets</th>
                <th className="px-3 py-3 text-[10px] font-black uppercase text-emerald-600 text-center">Inspected</th>
                <th className="px-3 py-3 text-[10px] font-black uppercase text-slate-400 text-center">Locs</th>
                <th className="px-3 py-3 text-[10px] font-black uppercase text-slate-400 text-center">No Supv</th>
                <th className="px-4 py-3 text-[10px] font-black uppercase text-slate-400 text-right">Progress</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {Object.entries(p.inspectionStats).map(([dn, s]: [string, any]) => (
                <tr key={dn} className="hover:bg-slate-50/30">
                  <td className="px-4 py-2.5 font-bold text-slate-800">{dn}</td>
                  <td className="px-3 py-2.5 text-center font-medium text-slate-600">{s.total.toLocaleString()}</td>
                  <td className="px-3 py-2.5 text-center font-bold text-emerald-600">{s.inspected.toLocaleString()}</td>
                  <td className="px-3 py-2.5 text-center font-medium text-slate-600">{s.locations}</td>
                  <td className="px-3 py-2.5 text-center">
                    {s.noSupervisor > 0
                      ? <span className="inline-flex px-2 py-0.5 bg-red-50 text-red-600 rounded-lg text-[10px] font-bold">{s.noSupervisor}</span>
                      : <span className="text-slate-300">—</span>}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <div className="w-16 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full ${s.progress >= 100 ? 'bg-emerald-500' : s.progress > 50 ? 'bg-indigo-500' : 'bg-rose-400'}`} style={{ width: `${Math.min(100, s.progress)}%` }}></div>
                      </div>
                      <span className="text-[10px] font-black text-slate-700 w-10 text-right">{s.progress.toFixed(1)}%</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    ),
  },

  // ── Guest — Officer Workload Roster (full-width) ─────────────────────
  {
    id: 'officer-roster',
    priority: 17,
    capability: null,
    render: (p) => (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* LEFT: Officer Workload Roster */}
        <div className="rounded-3xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <div className="p-5 border-b border-slate-100">
            <h3 className="text-sm font-black text-slate-900 flex items-center gap-2">
              <Users className="w-4 h-4 text-emerald-500" />Officer Workload Roster
            </h3>
            <p className="text-[10px] text-slate-400 mt-0.5">{p.officerWorkloadStats.length} certified · threshold: {p.openAuditThreshold.toLocaleString()} assets</p>
          </div>
          <div className="overflow-x-auto max-h-112 overflow-y-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 sticky top-0">
                <tr>
                  <th className="px-4 py-3 text-[10px] font-black uppercase text-slate-400">Officer</th>
                  <th className="px-3 py-3 text-[10px] font-black uppercase text-slate-400 text-center w-16">Slots</th>
                  <th className="px-3 py-3 text-[10px] font-black uppercase text-slate-400 text-right w-24">Assets</th>
                  <th className="px-3 py-3 text-[10px] font-black uppercase text-slate-400 text-right w-18">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {p.officerWorkloadStats.map((o: any) => {
                  const over = o.assets >= p.openAuditThreshold;
                  return (
                    <tr key={o.name} className={`hover:bg-slate-50/30 ${over ? 'bg-rose-50/40' : ''}`}>
                      <td className="px-4 py-2.5 font-bold text-slate-800">{o.name}</td>
                      <td className="px-3 py-2.5 text-center font-medium text-slate-600">{o.slots}</td>
                      <td className="px-3 py-2.5 text-right font-bold text-slate-700">{o.assets.toLocaleString()}</td>
                      <td className="px-3 py-2.5 text-right">
                        {over
                          ? <span className="px-2 py-0.5 bg-rose-100 text-rose-600 rounded text-[9px] font-black uppercase">Over</span>
                          : <span className="px-2 py-0.5 bg-emerald-50 text-emerald-600 rounded text-[9px] font-black uppercase">OK</span>}
                      </td>
                    </tr>
                  );
                })}
                {p.officerWorkloadStats.length === 0 && (
                  <tr><td colSpan={4} className="text-xs text-slate-400 italic text-center py-6">No certified officers assigned.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* RIGHT: Department Staffing Gaps */}
        <div className="rounded-3xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <div className="p-5 border-b border-slate-100">
            <h3 className="text-sm font-black text-slate-900 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-500" />Department Staffing Gaps
            </h3>
            <p className="text-[10px] text-slate-400 mt-0.5">{p.departmentStaffingGaps.length} depts with staffing gaps</p>
          </div>
          <div className="overflow-x-auto max-h-112 overflow-y-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 sticky top-0">
                <tr>
                  <th className="px-4 py-3 text-[10px] font-black uppercase text-slate-400">Department</th>
                  <th className="px-3 py-3 text-[10px] font-black uppercase text-slate-400 text-center w-16">Officers</th>
                  <th className="px-3 py-3 text-[10px] font-black uppercase text-slate-400">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {p.departmentStaffingGaps.map(d => (
                  <tr key={d.name} className="hover:bg-slate-50/30">
                    <td className="px-4 py-2.5 font-bold text-slate-800">{d.name}</td>
                    <td className="px-3 py-2.5 text-center">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-black ${d.officers === 0 ? 'bg-red-50 text-red-600' : 'bg-amber-50 text-amber-600'}`}>{d.officers}</span>
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="text-[10px] font-medium text-slate-500">{d.gap}</span>
                    </td>
                  </tr>
                ))}
                {p.departmentStaffingGaps.length === 0 && (
                  <tr><td colSpan={3} className="text-xs text-slate-400 italic text-center py-6">All departments adequately staffed.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    ),
  },

  // ── Institutional Health ────────────────────────────────────────────
  {
    id: 'institutional-section',
    priority: 70,
    capability: null,
    render: (p) => (
      <InstitutionalSection
        users={p.users} departments={p.departments}
        locations={p.locations} schedules={p.schedules}
        openAuditThreshold={p.openAuditThreshold}
        onSendEmail={p.onSendEmail}
      />
    ),
  },

  // ── System Activity ─────────────────────────────────────────────────
  {
    id: 'system-activity',
    priority: 80,
    capability: null,
    render: (p) => {
      if (p.activities.length === 0) return null;
      return (
        <div className="rounded-3xl border border-slate-200 bg-white shadow-sm p-6">
          <h3 className="text-sm font-black text-slate-900 mb-4 flex items-center gap-2">
            <History className="w-4 h-4 text-blue-500" />System Activity
          </h3>
          <div className="space-y-3 max-h-80 overflow-y-auto">
            {p.activities.slice().reverse().slice(0, 30).map(a => (
              <div key={a.id} className="flex gap-3 text-xs">
                <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${a.type.includes('DELETE') ? 'bg-rose-500' : a.type.includes('CREATE') ? 'bg-emerald-500' : 'bg-blue-500'}`}></div>
                <div>
                  <p className="font-bold text-slate-800">{a.message}</p>
                  <p className="text-[10px] text-slate-400 mt-0.5">{a.timestamp ? new Date(a.timestamp).toLocaleString() : ''} · {a.type}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      );
    },
  },

];
