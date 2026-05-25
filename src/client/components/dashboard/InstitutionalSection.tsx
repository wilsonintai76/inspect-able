import React from 'react';
import { Users, UserX, UserCheck, ShieldAlert, Package, Building2, Clock, AlertTriangle, CalendarDays, ArrowRight, Trophy, LayoutDashboard, MapPin, CheckCircle2, History } from 'lucide-react';
import { User, Department, Location, AuditSchedule, AuditPhase, KPITier, KPITierTarget, InstitutionKPITarget, SystemActivity } from '@shared/types';
import { StatCard } from './Widgets';
import { KPIStatsWidget } from '../KPIStatsWidget';

interface InstitutionalSectionProps {
  users: User[];
  departments: Department[];
  locations: Location[];
  schedules: AuditSchedule[];
  phases: AuditPhase[];
  kpiTiers: KPITier[];
  kpiTierTargets: KPITierTarget[];
  institutionKPIs: InstitutionKPITarget[];
  activities: SystemActivity[];
  buildings: any[];
  openAuditThreshold: number;
  onSendEmail?: (id: string) => void;
}

interface OfficerWorkload {
  name: string;
  id: string;
  deptName: string;
  assets: number;
  slots: number;
  certExpiry: string | null;
  isOverloaded: boolean;
}

export const InstitutionalSection: React.FC<InstitutionalSectionProps> = ({
  users, departments, locations, schedules, phases, kpiTiers, kpiTierTargets,
  institutionKPIs, activities, buildings, openAuditThreshold, onSendEmail,
}) => {
  const today = new Date().toISOString().split('T')[0];

  // ── All Officers Workload ───────────────────────────────────────────
  const allOfficers = React.useMemo(() => {
    const certified = users.filter(u => u.certificationExpiry && u.certificationExpiry >= today);
    const map = new Map<string, OfficerWorkload>();
    certified.forEach(u => {
      const dept = departments.find(d => d.id === u.departmentId);
      map.set(u.id, {
        name: u.name || 'Unknown',
        id: u.id,
        deptName: dept?.abbr || dept?.name || 'N/A',
        assets: 0,
        slots: 0,
        certExpiry: u.certificationExpiry,
        isOverloaded: false,
      });
    });
    schedules.forEach(s => {
      [s.auditor1Id, s.auditor2Id].forEach(aid => {
        if (!aid) return;
        const o = map.get(aid);
        if (o) {
          const loc = locations.find(l => l.id === s.locationId);
          o.assets += loc?.totalAssets || 0;
          o.slots += 1;
        }
      });
    });
    const result = Array.from(map.values());
    result.forEach(o => { o.isOverloaded = o.assets >= openAuditThreshold; });
    result.sort((a, b) => b.assets - a.assets);
    return result;
  }, [users, schedules, locations, departments, openAuditThreshold, today]);

  // ── Department Staffing Gaps ─────────────────────────────────────────
  const staffingGaps = React.useMemo(() => {
    const todayStr = today;
    return departments
      .filter(d => !d.isArchived && (d.totalAssets || 0) > 0)
      .map(d => {
        const deptUsers = users.filter(u => u.departmentId === d.id);
        const certified = deptUsers.filter(u => u.certificationExpiry && u.certificationExpiry >= todayStr);
        const hasHod = !!d.headOfDeptId;
        return {
          id: d.id,
          name: d.name,
          abbr: d.abbr,
          totalUsers: deptUsers.length,
          certifiedOfficers: certified.length,
          hasHod,
          totalAssets: d.totalAssets || 0,
          gaps: [
            !hasHod && 'No HOD',
            certified.length === 0 && 'No certified officers',
            certified.length === 1 && 'Only 1 certified officer',
          ].filter(Boolean) as string[],
        };
      })
      .filter(d => d.gaps.length > 0)
      .sort((a, b) => b.gaps.length - a.gaps.length);
  }, [departments, users, today]);

  // ── Pending Approvals Pipeline ──────────────────────────────────────
  const pendingApprovals = React.useMemo(() => {
    return schedules
      .filter(s => s.status === 'Awaiting Approval')
      .map(s => {
        const dept = departments.find(d => d.id === s.departmentId);
        const loc = locations.find(l => l.id === s.locationId);
        return { ...s, deptName: dept?.abbr || 'N/A', locName: loc?.name || 'N/A' };
      })
      .sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  }, [schedules, departments, locations]);

  // ── Upcoming Schedule (locked slots, not yet in progress) ───────────
  const upcomingSchedules = React.useMemo(() => {
    return schedules
      .filter(s => s.status === 'Pending' && s.auditor1Id && s.auditor2Id)
      .map(s => {
        const loc = locations.find(l => l.id === s.locationId);
        const dept = departments.find(d => d.id === s.departmentId);
        const a1 = users.find(u => u.id === s.auditor1Id);
        const a2 = users.find(u => u.id === s.auditor2Id);
        return {
          ...s,
          locationName: loc?.name || 'Unknown',
          deptAbbr: dept?.abbr || dept?.name || 'N/A',
          auditor1Name: a1?.name || '—',
          auditor2Name: a2?.name || '—',
          totalAssets: loc?.totalAssets || 0,
        };
      })
      .sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  }, [schedules, locations, departments, users]);

  // ── Audit Stats ────────────────────────────────────────────────────
  const activeLocationIds = React.useMemo(() => new Set(locations.filter(l => l.status !== 'Archived').map(l => l.id)), [locations]);
  const activeLocations = React.useMemo(() => locations.filter(l => l.status !== 'Archived'), [locations]);

  const auditStats = React.useMemo(() => {
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

  // ── Inspection Status by Department ─────────────────────────────────
  const inspectionStats = React.useMemo(() => {
    const s: Record<string, any> = {};
    departments.forEach(dept => {
      const locs = locations.filter(l => l.departmentId === dept.id && l.status !== 'Archived');
      const total = locs.reduce((sum, l) => sum + (l.totalAssets || 0), 0);
      const insp = locs.reduce((sum, l) => sum + (schedules.some(s2 => s2.locationId === l.id && s2.status === 'Completed') ? (l.totalAssets || 0) : 0), 0);
      s[dept.name] = { total, inspected: insp, progress: total > 0 ? (insp / total) * 100 : 0, locations: locs.length, noSupervisor: locs.filter(l => !l.supervisorId).length };
    });
    return s;
  }, [departments, locations, schedules]);

  const activeSchedules = schedules.filter(s => s.status !== 'Completed');
  const unassignedSlots = activeSchedules.filter(s => !s.auditor1Id || !s.auditor2Id).length;
  const totalOfficers = allOfficers.length;
  const overloadedOfficers = allOfficers.filter(o => o.isOverloaded).length;
  const deptsWithGaps = staffingGaps.length;

  return (
    <div className="space-y-6">
      {/* ── KPI Progress ──────────────────────────────────────────── */}
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

      {/* ── Stats Cards ────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <StatCard icon={MapPin} label="Active Locations" value={auditStats.totalLocations.toLocaleString()} color="text-slate-700" />
        <StatCard icon={Package} label="Total Assets" value={auditStats.totalAssets.toLocaleString()} color="text-blue-600" />
        <StatCard icon={CheckCircle2} label="Assigned" value={auditStats.assigned} color="text-emerald-600" />
        <StatCard icon={Clock} label="In Progress" value={auditStats.inProgress} color="text-amber-600" />
        <StatCard icon={AlertTriangle} label="Awaiting Approval" value={auditStats.awaitingApproval} color="text-orange-500" />
        <StatCard icon={CheckCircle2} label="Completed" value={auditStats.completed} color="text-green-600" />
      </div>

      {/* ── Institution Health Cards ─────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard icon={Users} label="Certified Officers" value={totalOfficers} color="text-indigo-600" />
        <StatCard icon={ShieldAlert} label="Overloaded Officers" value={overloadedOfficers} color={overloadedOfficers > 0 ? 'text-red-500' : 'text-emerald-500'} />
        <StatCard icon={AlertTriangle} label="Depts with Gaps" value={deptsWithGaps} color={deptsWithGaps > 0 ? 'text-amber-500' : 'text-emerald-500'} />
        <StatCard icon={Package} label="Unassigned Slots" value={unassignedSlots} color={unassignedSlots > 0 ? 'text-orange-500' : 'text-emerald-500'} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* ── Officer Workload Roster ────────────────────────────────── */}
        <div className="rounded-3xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <div className="p-5 border-b border-slate-100 flex items-center justify-between">
            <h3 className="text-sm font-black text-slate-900 flex items-center gap-2">
              <Users className="w-4 h-4 text-indigo-500" />
              Officer Workload Roster
            </h3>
            <span className="text-[10px] text-slate-400 font-bold">{totalOfficers} officers</span>
          </div>
          <div className="overflow-auto max-h-96">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 sticky top-0">
                <tr>
                  <th className="px-4 py-2.5 text-[10px] font-black uppercase text-slate-400">Officer</th>
                  <th className="px-3 py-2.5 text-[10px] font-black uppercase text-slate-400">Dept</th>
                  <th className="px-3 py-2.5 text-[10px] font-black uppercase text-slate-400 text-center">Slots</th>
                  <th className="px-3 py-2.5 text-[10px] font-black uppercase text-slate-400 text-right">Assets</th>
                  <th className="px-3 py-2.5 text-[10px] font-black uppercase text-slate-400 text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {allOfficers.slice(0, 50).map(o => (
                  <tr key={o.id} className={`hover:bg-slate-50/30 ${o.isOverloaded ? 'bg-red-50/30' : ''}`}>
                    <td className="px-4 py-2 font-bold text-slate-800 truncate max-w-35">{o.name}</td>
                    <td className="px-3 py-2 text-slate-500 font-medium">{o.deptName}</td>
                    <td className="px-3 py-2 text-center font-bold text-slate-700">{o.slots}</td>
                    <td className="px-3 py-2 text-right font-bold text-indigo-600">{o.assets.toLocaleString()}</td>
                    <td className="px-3 py-2 text-right">
                      {o.isOverloaded
                        ? <span className="inline-flex px-2 py-0.5 bg-red-50 text-red-600 rounded-lg text-[10px] font-bold">Over</span>
                        : o.slots === 0
                          ? <span className="inline-flex px-2 py-0.5 bg-slate-50 text-slate-400 rounded-lg text-[10px] font-bold">Idle</span>
                          : <span className="inline-flex px-2 py-0.5 bg-emerald-50 text-emerald-600 rounded-lg text-[10px] font-bold">OK</span>
                      }
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* ── Department Staffing Gaps ───────────────────────────────── */}
        <div className="rounded-3xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <div className="p-5 border-b border-slate-100 flex items-center justify-between">
            <h3 className="text-sm font-black text-slate-900 flex items-center gap-2">
              <Building2 className="w-4 h-4 text-amber-500" />
              Department Staffing Gaps
            </h3>
            <span className="text-[10px] text-slate-400 font-bold">{staffingGaps.length} depts</span>
          </div>
          <div className="overflow-auto max-h-96">
            {staffingGaps.length === 0 ? (
              <div className="p-8 text-center">
                <UserCheck className="w-8 h-8 text-emerald-300 mx-auto mb-2" />
                <p className="text-xs text-slate-400 font-bold">All departments are properly staffed</p>
              </div>
            ) : (
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 sticky top-0">
                  <tr>
                    <th className="px-4 py-2.5 text-[10px] font-black uppercase text-slate-400">Department</th>
                    <th className="px-3 py-2.5 text-[10px] font-black uppercase text-slate-400 text-center">Officers</th>
                    <th className="px-3 py-2.5 text-[10px] font-black uppercase text-slate-400">Gaps</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {staffingGaps.map(d => (
                    <tr key={d.id} className="hover:bg-slate-50/30">
                      <td className="px-4 py-2">
                        <span className="font-bold text-slate-800">{d.abbr || d.name}</span>
                        <span className="text-[10px] text-slate-400 ml-1">({(d.totalAssets || 0).toLocaleString()} assets)</span>
                      </td>
                      <td className="px-3 py-2 text-center">
                        <span className={`font-bold ${d.certifiedOfficers === 0 ? 'text-red-500' : 'text-amber-500'}`}>
                          {d.certifiedOfficers}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap gap-1">
                          {d.gaps.map((g, i) => (
                            <span key={i} className="px-1.5 py-0.5 bg-red-50 text-red-600 rounded text-[9px] font-bold">{g}</span>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      {/* ── Upcoming Schedule (locked slots, not yet in progress) ─────── */}
      {upcomingSchedules.length > 0 && (
        <div className="rounded-3xl border border-indigo-100 bg-white shadow-sm overflow-hidden">
          <div className="p-5 border-b border-slate-100 flex items-center justify-between">
            <h3 className="text-sm font-black text-slate-900 flex items-center gap-2">
              <CalendarDays className="w-4 h-4 text-indigo-500" />
              Upcoming Schedule
            </h3>
            <span className="text-[10px] text-slate-400 font-bold">{upcomingSchedules.length} locked</span>
          </div>
          <div className="overflow-auto max-h-80">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 sticky top-0">
                <tr>
                  <th className="px-4 py-2.5 text-[10px] font-black uppercase text-slate-400">Location</th>
                  <th className="px-3 py-2.5 text-[10px] font-black uppercase text-slate-400">Dept</th>
                  <th className="px-3 py-2.5 text-[10px] font-black uppercase text-slate-400">Date</th>
                  <th className="px-3 py-2.5 text-[10px] font-black uppercase text-slate-400">Auditor 1</th>
                  <th className="px-3 py-2.5 text-[10px] font-black uppercase text-slate-400">Auditor 2</th>
                  <th className="px-3 py-2.5 text-[10px] font-black uppercase text-slate-400 text-center">Assets</th>
                  <th className="px-3 py-2.5 text-[10px] font-black uppercase text-slate-400 text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {upcomingSchedules.map(s => (
                  <tr key={s.id} className="hover:bg-indigo-50/20">
                    <td className="px-4 py-2 font-bold text-slate-800 truncate max-w-35">{s.locationName}</td>
                    <td className="px-3 py-2 text-slate-500 font-medium">{s.deptAbbr}</td>
                    <td className="px-3 py-2 font-medium text-slate-600">{s.date || '—'}</td>
                    <td className="px-3 py-2 font-medium text-slate-700">{s.auditor1Name}</td>
                    <td className="px-3 py-2 font-medium text-slate-700">{s.auditor2Name}</td>
                    <td className="px-3 py-2 text-center font-bold text-indigo-600">{s.totalAssets.toLocaleString()}</td>
                    <td className="px-3 py-2 text-right">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-indigo-50 text-indigo-600 rounded-lg text-[10px] font-bold">
                        <ArrowRight className="w-3 h-3" />
                        Ready
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Inspection Status ─────────────────────────────────────── */}
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

      {/* ── Pending Approvals Pipeline ────────────────────────────────── */}
      {pendingApprovals.length > 0 && (
        <div className="rounded-3xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <div className="p-5 border-b border-slate-100 flex items-center justify-between">
            <h3 className="text-sm font-black text-slate-900 flex items-center gap-2">
              <Clock className="w-4 h-4 text-orange-500" />
              Approval Pipeline
            </h3>
            <span className="text-[10px] text-slate-400 font-bold">{pendingApprovals.length} awaiting</span>
          </div>
          <div className="overflow-auto max-h-80">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 sticky top-0">
                <tr>
                  <th className="px-4 py-2.5 text-[10px] font-black uppercase text-slate-400">Date</th>
                  <th className="px-3 py-2.5 text-[10px] font-black uppercase text-slate-400">Department</th>
                  <th className="px-3 py-2.5 text-[10px] font-black uppercase text-slate-400">Location</th>
                  <th className="px-3 py-2.5 text-[10px] font-black uppercase text-slate-400 text-center">Assets</th>
                  <th className="px-3 py-2.5 text-[10px] font-black uppercase text-slate-400 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {pendingApprovals.map(a => (
                  <tr key={a.id} className="hover:bg-slate-50/30">
                    <td className="px-4 py-2 font-bold text-slate-700">{a.date || '—'}</td>
                    <td className="px-3 py-2 text-slate-600">{a.deptName}</td>
                    <td className="px-3 py-2 text-slate-600 truncate max-w-35">{a.locName}</td>
                    <td className="px-3 py-2 text-center font-bold text-slate-700">{(locations.find(l => l.id === a.locationId)?.totalAssets || 0).toLocaleString()}</td>
                    <td className="px-3 py-2 text-right">
                      {onSendEmail && (
                        <button
                          onClick={() => onSendEmail(a.id)}
                          className="px-3 py-1 bg-orange-50 text-orange-600 border border-orange-200 rounded-lg text-[10px] font-bold hover:bg-orange-100 transition-colors"
                        >
                          Send Reminder
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── System Activity ────────────────────────────────────────── */}
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
                  <p className="font-bold text-slate-800">{a.message}</p>
                  <p className="text-[10px] text-slate-400 mt-0.5">{a.timestamp ? new Date(a.timestamp).toLocaleString() : ''} · {a.type}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
