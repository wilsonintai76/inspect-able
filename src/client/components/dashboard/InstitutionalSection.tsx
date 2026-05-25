import React from 'react';
import { Users, UserX, UserCheck, ShieldAlert, Package, Building2, Clock, AlertTriangle } from 'lucide-react';
import { User, Department, Location, AuditSchedule } from '@shared/types';
import { StatCard } from './Widgets';

interface InstitutionalSectionProps {
  users: User[];
  departments: Department[];
  locations: Location[];
  schedules: AuditSchedule[];
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
  users, departments, locations, schedules, openAuditThreshold, onSendEmail,
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

  const activeSchedules = schedules.filter(s => s.status !== 'Completed');
  const unassignedSlots = activeSchedules.filter(s => !s.auditor1Id || !s.auditor2Id).length;
  const totalOfficers = allOfficers.length;
  const overloadedOfficers = allOfficers.filter(o => o.isOverloaded).length;
  const deptsWithGaps = staffingGaps.length;

  return (
    <div className="space-y-6">
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
    </div>
  );
};
