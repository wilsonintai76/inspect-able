import React, { useMemo } from 'react';
import { AuditSchedule, User, AuditPhase, KPITier, Department, Location, InstitutionKPITarget, AuditGroup, SystemActivity, KPITierTarget } from '@shared/types';
import { hasCapability, CAP_ADMIN_INSIGHTS, CAP_MY_WORKLOAD } from '../lib/pbacUtils';
import { AuditUploadModal } from './AuditUploadModal';
import { KPIStatsWidget } from './KPIStatsWidget';
import { SupervisorSection } from './dashboard/SupervisorSection';
import { AdminSection } from './dashboard/AdminSection';
import { StatCard } from './dashboard/Widgets';
import { Package, Calendar, CheckCircle2, Clock, AlertTriangle, LayoutDashboard, Trophy, History, Users, Shield, TrendingUp, UserX, MapPin } from 'lucide-react';

interface UnifiedDashboardProps {
  currentUser: User; schedules: AuditSchedule[]; phases: AuditPhase[]; kpiTiers: KPITier[];
  departments: Department[]; locations: Location[]; users: User[]; activities: SystemActivity[];
  buildings: any[]; institutionKPIs: InstitutionKPITarget[]; kpiTierTargets: KPITierTarget[];
  auditGroups: AuditGroup[]; openAuditThreshold: number; dashboardConfig: any;
  maxAssetsPerDay?: number;
  onApproveArchive?: (id: string) => void; onRejectArchive?: (id: string) => void;
  onApproveCert?: (u: User) => void; onSendEmail?: (id: string) => void;
  onRequestRenewal?: () => void; onUpdateDate?: (id: string, d: string) => void;
  onUpdateAudit?: (id: string, u: Partial<AuditSchedule>) => Promise<void>;
  setActiveView?: (v: string) => void;
}

export const UnifiedDashboard: React.FC<UnifiedDashboardProps> = ({
  currentUser, schedules, phases, kpiTiers, departments, locations, users, activities,
  buildings, institutionKPIs, kpiTierTargets, auditGroups, openAuditThreshold,
  dashboardConfig, maxAssetsPerDay,
  onApproveArchive, onRejectArchive, onApproveCert, onSendEmail,
  onRequestRenewal, onUpdateDate, onUpdateAudit, setActiveView,
}) => {
  const [uploadAudit, setUploadAudit] = React.useState<AuditSchedule | null>(null);

  // ── PBAC capability checks ───────────────────────────────────────────
  const isAdmin = hasCapability(currentUser, CAP_ADMIN_INSIGHTS);
  const showWorkload = hasCapability(currentUser, CAP_MY_WORKLOAD);
  const isSupervisor = hasCapability(currentUser, 'manage:locations') && !isAdmin;

  // ── Institution-wide data (core dashboard — no scoping) ─────────────
  const activeLocations = useMemo(() => locations.filter(l => l.status !== 'Archived'), [locations]);
  const activeLocationIds = useMemo(() => new Set(activeLocations.map(l => l.id)), [activeLocations]);

  const pendingDeletions = useMemo(() => activeLocations.filter(l => l.status === 'Pending_Delete'), [activeLocations]);
  const awaitingApprovals = useMemo(() => schedules.filter(s => s.status === 'Awaiting Approval' && activeLocationIds.has(s.locationId)), [schedules, activeLocationIds]);

  const certWatch = useMemo(() => {
    const n = new Date(), t = new Date();
    t.setDate(n.getDate() + 30);
    return {
      expired: users.filter(u => u.certificationExpiry && new Date(u.certificationExpiry) < n),
      expiringSoon: users.filter(u => u.certificationExpiry && new Date(u.certificationExpiry) >= n && new Date(u.certificationExpiry) <= t),
    };
  }, [users]);

  const auditGaps = useMemo(() => {
    const activeSchedules = schedules.filter(s => activeLocationIds.has(s.locationId));
    const md = activeSchedules.filter(s => !s.date), ma = activeSchedules.filter(s => !s.auditor1Id && !s.auditor2Id);
    return { date: md, auditors: ma, total: md.length + ma.length };
  }, [schedules, activeLocationIds]);

  const incompleteUsers = useMemo(() => users.filter(u => !u.departmentId || !u.designation || !u.contactNumber || u.status === 'Pending'), [users]);
  const renewalRequests = useMemo(() => users.filter(u => u.renewalRequested), [users]);

  // ── Pre-computed data (all widgets share these) ──────────────────────
  const myAudits = useMemo(() => showWorkload ? schedules.filter(s => s.auditor1Id === currentUser.id || s.auditor2Id === currentUser.id) : [], [schedules, currentUser.id, showWorkload]);

  const officerStats = useMemo(() => {
    const t = myAudits.length, c = myAudits.filter(s => s.status === 'Completed').length,
      ip = myAudits.filter(s => s.status === 'In Progress').length,
      pe = myAudits.filter(s => s.status === 'Pending').length,
      r = t > 0 ? Math.round((c / t) * 100) : 0,
      w = myAudits.reduce((s, a) => s + (locations.find(l => l.id === a.locationId)?.totalAssets || 0), 0);
    return { total: t, completed: c, inProgress: ip, pending: pe, completionRate: r, workload: w };
  }, [myAudits, locations]);

  const auditStats = useMemo(() => {
    const activeSchedules = schedules.filter(s => activeLocationIds.has(s.locationId));
    return {
      totalLocations: activeLocations.length,
      totalAssets: activeLocations.reduce((s, l) => s + (l.totalAssets || 0), 0),
      total: activeSchedules.length,
      assigned: activeSchedules.filter(s => s.auditor1Id && s.auditor2Id).length,
      inProgress: activeSchedules.filter(s => s.status === 'In Progress').length,
      completed: activeSchedules.filter(s => s.status === 'Completed').length,
      awaitingApproval: activeSchedules.filter(s => s.status === 'Awaiting Approval').length,
    };
  }, [schedules, activeLocations, activeLocationIds]);

  const approvalReminderAuditIds = useMemo(() => new Set(
    activities.filter(a => { const m = a.metadata as any; return m?.auditId && (m?.category === 'approval_email' || /approval/i.test(a.message)); })
      .map(a => String((a.metadata as any).auditId))
  ), [activities]);

  const canResendReminder = (d: string | null) => { if (!d) return true; const t = new Date(); t.setHours(0, 0, 0, 0); const i = new Date(d); i.setHours(0, 0, 0, 0); return Math.ceil((i.getTime() - t.getTime()) / 86400000) >= 2; };

  const inspectionStats = useMemo(() => {
    const s: Record<string, any> = {};
    departments.forEach(dept => {
      const locs = locations.filter(l => l.departmentId === dept.id && l.status !== 'Archived');
      const total = locs.reduce((sum, l) => sum + (l.totalAssets || 0), 0);
      const insp = locs.reduce((sum, l) => sum + (schedules.some(s2 => s2.locationId === l.id && s2.status === 'Completed') ? (l.totalAssets || 0) : 0), 0);
      s[dept.name] = { total, inspected: insp, progress: total > 0 ? (insp / total) * 100 : 0, locations: locs.length, noSupervisor: locs.filter(l => !l.supervisorId).length };
    });
    return s;
  }, [departments, locations, schedules]);

  const officerWorkloadStats = useMemo(() => {
    const today = new Date().toISOString().split('T')[0];
    const ids = new Set(users.filter(u => u.certificationExpiry && u.certificationExpiry >= today).map(u => u.id));
    const m = new Map<string, any>();
    schedules.forEach(s => {
      [s.auditor1Id, s.auditor2Id].forEach(aid => {
        if (!aid || !ids.has(aid)) return;
        const u = users.find(c => c.id === aid);
        const p = m.get(aid) ?? { name: u?.name || 'Unknown', assets: 0, slots: 0 };
        m.set(aid, { name: u?.name || p.name, assets: p.assets + (locations.find(l => l.id === s.locationId)?.totalAssets || 0), slots: p.slots + 1 });
      });
    });
    return Array.from(m.values()).sort((a: any, b: any) => b.assets - a.assets);
  }, [schedules, users, locations]);

  const supervisorLocationAudits = useMemo(() => {
    if (!isSupervisor) return [];
    const uid = currentUser.id;
    return schedules.filter(s => {
      // Check the schedule's own supervisorId field (matches AuditTable logic)
      if (s.supervisorId === uid || (s.supervisorId && s.supervisorId.split(',').map((id: string) => id.trim()).includes(uid))) {
        return true;
      }
      // Also check the location's supervisorId as fallback
      const loc = locations.find(l => l.id === s.locationId);
      return loc && (loc.supervisorId === uid || (loc.supervisorId && loc.supervisorId.split(',').map((id: string) => id.trim()).includes(uid)));
    });
  }, [schedules, locations, currentUser.id, isSupervisor]);

  const supervisorApprovals = useMemo(() => isSupervisor ? supervisorLocationAudits.filter(s => s.status === 'Awaiting Approval') : [], [supervisorLocationAudits, isSupervisor]);

  const departmentStaffingGaps = useMemo(() => {
    const today = new Date().toISOString().split('T')[0];
    return departments.map(d => {
      const officers = users.filter(u =>
        u.departmentId === d.id &&
        u.certificationExpiry && u.certificationExpiry >= today &&
        (u.roles?.includes('Coordinator') || u.roles?.includes('Supervisor') || u.roles?.includes('Staff'))
      );
      const count = officers.length;
      let gap = '';
      if (count === 0) gap = 'No certified officers';
      else if (count === 1) gap = 'Only 1 certified officer';
      else if (count < 3) gap = `${count} officers (low)`;
      return { name: d.name, officers: count, gap };
    }).filter(d => d.officers < 3); // only show departments with gaps
  }, [departments, users]);
  const getBuildingAbbr = (id?: string | null) => id ? buildings.find((b: any) => b.id === id)?.abbr || 'N/A' : 'N/A';

  const onNavigate = setActiveView ? (auditId?: string) => { setActiveView('schedule'); } : undefined;
  const overloadedCount = officerWorkloadStats.filter((o: any) => o.assets >= openAuditThreshold).length;

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-500">
      {/* 1. KPI Progress */}
      <div className="rounded-3xl border border-slate-200 bg-white shadow-sm p-6">
        <h3 className="text-sm font-black text-slate-900 mb-4 flex items-center gap-2">
          <Trophy className="w-4 h-4 text-amber-500" />KPI Progress
        </h3>
        <KPIStatsWidget
          schedules={schedules} phases={phases} kpiTiers={kpiTiers}
          departments={departments} locations={locations}
          kpiTierTargets={kpiTierTargets} institutionKPIs={institutionKPIs}
        />
      </div>

      {/* 2. Health Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard icon={Shield} label="Certified Officers" value={officerWorkloadStats.length} color="text-indigo-600" />
        <StatCard icon={TrendingUp} label="Overloaded Officers" value={overloadedCount} color="text-rose-600" />
        <StatCard icon={AlertTriangle} label="Depts With Gaps" value={departmentStaffingGaps.length} color="text-amber-600" />
        <StatCard icon={UserX} label="Unassigned Slots" value={auditGaps.auditors.length} color="text-orange-600" />
      </div>

      {/* 3. Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <StatCard icon={MapPin} label="Active Locations" value={auditStats.totalLocations.toLocaleString()} color="text-slate-700" />
        <StatCard icon={Package} label="Total Assets" value={auditStats.totalAssets.toLocaleString()} color="text-blue-600" />
        <StatCard icon={CheckCircle2} label="Assigned" value={auditStats.assigned} color="text-emerald-600" />
        <StatCard icon={Clock} label="In Progress" value={auditStats.inProgress} color="text-amber-600" />
        <StatCard icon={AlertTriangle} label="Awaiting Approval" value={auditStats.awaitingApproval} color="text-orange-500" />
        <StatCard icon={CheckCircle2} label="Completed" value={auditStats.completed} color="text-green-600" />
      </div>

      {/* 4. Inspection Status */}
      <div className="rounded-3xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="p-5 border-b border-slate-100 flex items-center justify-between">
          <h3 className="text-sm font-black text-slate-900 flex items-center gap-2">
            <LayoutDashboard className="w-4 h-4 text-indigo-500" />Institutional Inspection Status
          </h3>
          <span className="text-[10px] text-slate-400 font-bold">{Object.keys(inspectionStats).length} depts</span>
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
              {Object.entries(inspectionStats).map(([dn, s]: [string, any]) => (
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

      {/* 5. Officer Roster + Staffing Gaps */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-3xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <div className="p-5 border-b border-slate-100">
            <h3 className="text-sm font-black text-slate-900 flex items-center gap-2">
              <Users className="w-4 h-4 text-emerald-500" />Officer Workload Roster
            </h3>
            <p className="text-[10px] text-slate-400 mt-0.5">{officerWorkloadStats.length} certified · threshold: {openAuditThreshold.toLocaleString()} assets</p>
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
                {officerWorkloadStats.map((o: any) => {
                  const over = o.assets >= openAuditThreshold;
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
                {officerWorkloadStats.length === 0 && (
                  <tr><td colSpan={4} className="text-xs text-slate-400 italic text-center py-6">No certified officers assigned.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
        <div className="rounded-3xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <div className="p-5 border-b border-slate-100">
            <h3 className="text-sm font-black text-slate-900 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-500" />Department Staffing Gaps
            </h3>
            <p className="text-[10px] text-slate-400 mt-0.5">{departmentStaffingGaps.length} depts with staffing gaps</p>
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
                {departmentStaffingGaps.map(d => (
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
                {departmentStaffingGaps.length === 0 && (
                  <tr><td colSpan={3} className="text-xs text-slate-400 italic text-center py-6">All departments adequately staffed.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* 6. Supervisor Section */}
      {supervisorLocationAudits.length > 0 && (
        <SupervisorSection
          supervisorApprovals={supervisorApprovals}
          supervisorLocationAudits={supervisorLocationAudits}
          approvalReminderAuditIds={approvalReminderAuditIds}
          canResendReminder={canResendReminder}
          locations={locations}
          onSendEmail={onSendEmail}
          onNavigateToSchedule={onNavigate}
        />
      )}

      {/* 7. Admin Section */}
      <AdminSection
        awaitingApprovals={awaitingApprovals} pendingDeletions={pendingDeletions}
        certWatch={certWatch} auditGaps={auditGaps}
        incompleteUsers={incompleteUsers} renewalRequests={renewalRequests}
        approvalReminderAuditIds={approvalReminderAuditIds}
        canResendReminder={canResendReminder} locations={locations}
        departments={departments} onSendEmail={onSendEmail}
        onApproveArchive={onApproveArchive} onRejectArchive={onRejectArchive}
        onApproveCert={onApproveCert} getBuildingAbbr={getBuildingAbbr}
      />

      {/* 8. System Activity */}
      {activities.length > 0 && (
        <div className="rounded-3xl border border-slate-200 bg-white shadow-sm p-6">
          <h3 className="text-sm font-black text-slate-900 mb-4 flex items-center gap-2">
            <History className="w-4 h-4 text-blue-500" />System Activity
          </h3>
          <div className="space-y-3 max-h-80 overflow-y-auto">
            {activities.slice().reverse().slice(0, 30).map(a => (
              <div key={a.id} className="flex gap-3 text-xs">
                <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${a.type.includes('DELETE') ? 'bg-rose-500' : a.type.includes('CREATE') ? 'bg-emerald-500' : 'bg-blue-500'}`}></div>
                <div>
                  <span className="text-slate-500">{a.timestamp?.split('T')[0] || ''}</span>
                  <span className="mx-1">·</span>
                  <span className="text-slate-700 font-medium">{a.message}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {uploadAudit && <AuditUploadModal audit={uploadAudit} onClose={() => setUploadAudit(null)} locationName="" onComplete={async () => { setUploadAudit(null); }} />}
    </div>
  );
};
