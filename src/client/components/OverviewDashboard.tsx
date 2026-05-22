
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { AuditSchedule, DashboardConfig, AuditPhase, KPITier, KPITierTarget, Department, Location, User, AuditGroup, SystemActivity, InstitutionKPITarget, Building } from '@shared/types';
import { KPIStatsWidget } from './KPIStatsWidget';
import { GraduationCap, Filter, ChevronDown, LayoutDashboard, Package, Calendar, Users, Clock, CheckCircle2, ClipboardCheck, UserCheck } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';

interface OverviewDashboardProps {
  schedules: AuditSchedule[];
  phases?: AuditPhase[];
  kpiTiers?: KPITier[];
  departments?: Department[];
  locations?: Location[];
  currentUser: User;
  auditGroups?: AuditGroup[];
  maxAssetsPerDay?: number;
  maxLocationsPerDay?: number;
  institutionKPIs?: InstitutionKPITarget[];
  buildings?: Building[];
  openAuditThreshold?: number;
  users?: User[];
  kpiTierTargets?: KPITierTarget[];
  strictAuditorRule?: boolean;
  activities?: SystemActivity[];
  rbacMatrix?: Record<string, string[]>;
}

function BarFill({ pct, className }: { pct: number; className: string }) {
  const ref = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    ref.current?.style.setProperty('--w', `${pct}%`);
  }, [pct]);
  return <div ref={ref} className={`w-(--w) ${className}`} />;
}

function HeightFill({ pct, className }: { pct: number; className: string }) {
  const ref = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    ref.current?.style.setProperty('--h', `${pct}%`);
  }, [pct]);
  return <div ref={ref} className={`h-(--h) ${className}`} />;
}

export const OverviewDashboard: React.FC<OverviewDashboardProps> = ({
  schedules,
  phases = [],
  kpiTiers = [],
  departments = [],
  locations = [],
  currentUser,
  auditGroups = [],
  maxAssetsPerDay = 500,
  maxLocationsPerDay = 5,
  institutionKPIs = [],
  buildings = [],
  kpiTierTargets = [],
  strictAuditorRule = false,
  openAuditThreshold = 500,
  users = []
}) => {
  const [selectedDept, setSelectedDept] = useState('All');
  const [selectedBlock, setSelectedBlock] = useState('All');
  const [selectedLevel, setSelectedLevel] = useState('All');

  // Reset child filters
  useEffect(() => {
    setSelectedBlock('All');
    setSelectedLevel('All');
  }, [selectedDept]);

  useEffect(() => {
    setSelectedLevel('All');
  }, [selectedBlock]);

  const getBuildingAbbr = (buildingId?: string | null, buildingName?: string) => {
    if (buildingId) {
      const b = buildings.find(b => b.id === buildingId);
      if (b) return b.abbr;
    }
    if (buildingName) {
      const cleanName = buildingName.toLowerCase().trim();
      const b = buildings.find(b => b.name.toLowerCase().trim() === cleanName);
      if (b) return b.abbr;
      return buildingName;
    }
    return '';
  };

  // Filter Logic
  const filteredLocations = useMemo(() => {
    return locations.filter(l => {
      if (!l.isActive) return false;
      const dept = departments.find(d => d.id === l.departmentId);
      if (selectedDept !== 'All' && dept?.name !== selectedDept) return false;
      if (selectedBlock !== 'All' && getBuildingAbbr(l.buildingId, l.building) !== selectedBlock) return false;
      if (selectedLevel !== 'All' && l.level !== selectedLevel) return false;
      return true;
    });
  }, [locations, selectedDept, selectedBlock, selectedLevel, departments]);

  const filteredSchedules = useMemo(() => {
    return schedules.filter(s => {
      const loc = locations.find(l => l.id === s.locationId);
      if (loc && !loc.isActive) return false;
      const dept = departments.find(d => d.id === s.departmentId);
      
      if (selectedDept !== 'All' && dept?.name !== selectedDept) return false;
      if (selectedBlock !== 'All' && getBuildingAbbr(loc?.buildingId, loc?.building) !== selectedBlock) return false;
      if (selectedLevel !== 'All' && loc?.level !== selectedLevel) return false;
      return true;
    });
  }, [schedules, locations, selectedDept, selectedBlock, selectedLevel, departments]);

  // Dropdown Options
  const availableLocationsForFilters = useMemo(() => {
    if (selectedDept === 'All') return locations;
    const dept = departments.find(d => d.name === selectedDept);
    if (!dept) return [];
    return locations.filter(l => l.departmentId === dept.id);
  }, [selectedDept, locations, departments]);

  const uniqueBlocks = useMemo(() => {
    const blocks = new Set(availableLocationsForFilters.map(l => getBuildingAbbr(l.buildingId, l.building)).filter(Boolean));
    return ['All', ...Array.from(blocks)].sort();
  }, [availableLocationsForFilters, buildings]);

  const uniqueLevels = useMemo(() => {
    let filtered = availableLocationsForFilters;
    if (selectedBlock !== 'All') {
      filtered = filtered.filter(l => getBuildingAbbr(l.buildingId, l.building) === selectedBlock);
    }
    const levels = new Set(filtered.map(l => l.level).filter(Boolean));
    return ['All', ...Array.from(levels)].sort();
  }, [availableLocationsForFilters, selectedBlock]);

  const upcomingAudits = useMemo(() => {
    // Filter: In Progress status only, sorted by date
    const inProgress = filteredSchedules
      .filter(s => s.status === 'In Progress')
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    
    // Group by ISO week
    const weeks: Record<string, AuditSchedule[]> = {};
    inProgress.forEach(a => {
      if (!a.date) return;
      const d = new Date(a.date);
      // Get Monday of the week
      const day = d.getDay();
      const monday = new Date(d);
      monday.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
      const weekKey = monday.toISOString().split('T')[0];
      if (!weeks[weekKey]) weeks[weekKey] = [];
      weeks[weekKey].push(a);
    });
    return weeks;
  }, [filteredSchedules]);

  const activePhase = useMemo(() => {
    const today = new Date();
    return (phases || []).find(p => {
      const start = new Date(p.startDate);
      const end = new Date(p.endDate);
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
      return today >= start && today <= end;
    });
  }, [phases]);

  const inspectionStats = useMemo(() => {
    const stats: Record<string, { total: number; inspected: number; uninspected: number; progress: number; locations: number; notUpdated: number; noSupervisor: number }> = {};

    departments.forEach(dept => {
      const deptLocs = locations.filter(l => l.departmentId === dept.id && l.isActive);
      const total = deptLocs.reduce((sum, l) => sum + (l.totalAssets || 0), 0);

      const inspected = deptLocs.reduce((sum, l) => {
        const isCompleted = schedules.some(s => s.locationId === l.id && s.status === 'Completed');
        return sum + (isCompleted ? (l.totalAssets || 0) : 0);
      }, 0);

      const uninspected = deptLocs.reduce((sum, l) => sum + (l.uninspectedAssetCount || 0), 0);

      // Use explicit uninspected count if available (>0), otherwise fallback to (total - inspected)
      const finalUninspected = uninspected > 0 ? uninspected : Math.max(0, total - inspected);

      const notUpdated = deptLocs.filter(l => {
        const s = schedules.find(sched => sched.locationId === l.id);
        return !s || !s.supervisorId;
      }).length;

      // Count locations WITHOUT a site supervisor assigned on the location record
      const noSupervisor = deptLocs.filter(l => !l.supervisorId).length;

      stats[dept.name] = {
        total,
        inspected,
        uninspected: finalUninspected,
        progress: total > 0 ? (inspected / total) * 100 : 0,
        locations: deptLocs.length,
        notUpdated,
        noSupervisor
      };
    });

    return stats;
  }, [departments, locations, schedules]);

  const overallStats = useMemo(() => {
    const values = Object.values(inspectionStats) as { total: number; inspected: number; uninspected: number; progress: number; locations: number }[];
    const total = values.reduce((sum, s) => sum + s.total, 0);
    const inspected = values.reduce((sum, s) => sum + s.inspected, 0);
    return {
      total,
      inspected,
      uninspected: total - inspected,
      progress: total > 0 ? (inspected / total) * 100 : 0
    };
  }, [inspectionStats]);

  const slotStats = useMemo(() => {
    const today = new Date().toISOString().split('T')[0];
    const certifiedAuditors = users.filter(u => u.certificationExpiry && u.certificationExpiry >= today);
    const assignedAuditorsSet = new Set<string>();
    schedules.forEach(s => {
      if (s.auditor1Id) assignedAuditorsSet.add(s.auditor1Id);
      if (s.auditor2Id) assignedAuditorsSet.add(s.auditor2Id);
    });
    return {
      totalAssets: overallStats.total,
      totalSlots: schedules.length,
      assigned: assignedAuditorsSet.size,
      totalAuditors: certifiedAuditors.length,
      inProgress: schedules.filter(s => s.status === 'In Progress').length,
      awaitingApproval: schedules.filter(s => s.status === 'Awaiting Approval').length,
      completed: schedules.filter(s => s.status === 'Completed').length,
    };
  }, [schedules, users, overallStats.total]);

  const officerWorkloadStats = useMemo(() => {
    const today = new Date().toISOString().split('T')[0];
    const certifiedUserIds = new Set(
      users
        .filter(user => user.certificationExpiry && user.certificationExpiry >= today)
        .map(user => user.id)
    );
    const workloadMap = new Map<string, { name: string; assets: number; slots: number }>();

    filteredSchedules.forEach(schedule => {
      [schedule.auditor1Id, schedule.auditor2Id].forEach(auditorId => {
        if (!auditorId || !certifiedUserIds.has(auditorId)) return;

        const user = users.find(candidate => candidate.id === auditorId);
        const previous = workloadMap.get(auditorId) ?? {
          name: user?.name || 'Unknown Officer',
          assets: 0,
          slots: 0,
        };

        workloadMap.set(auditorId, {
          name: user?.name || previous.name,
          assets: previous.assets + (locations.find(location => location.id === schedule.locationId)?.totalAssets || 0),
          slots: previous.slots + 1,
        });
      });
    });

    return Array.from(workloadMap.values()).sort((a, b) => b.assets - a.assets);
  }, [filteredSchedules, users, locations]);

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-500 pb-20">
      {/* Institutional Inspection Progress — TOP */}
      {phases?.length > 0 && kpiTiers?.length > 0 && (
        <KPIStatsWidget 
            phases={phases}
            kpiTiers={kpiTiers}
            kpiTierTargets={kpiTierTargets}
            departments={departments}
            locations={locations}
            schedules={schedules}
            institutionKPIs={institutionKPIs}
        />
      )}

      {/* Schedule Stats Bar */}
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-4">
        {([
          { label: 'Total Assets',  value: slotStats.totalAssets.toLocaleString(),                        color: 'text-indigo-600',  icon: Package      },
          { label: 'Total Slots',   value: slotStats.totalSlots.toLocaleString(),                          color: 'text-slate-800',   icon: Calendar     },
          { label: 'Assigned',      value: `${slotStats.assigned} / ${slotStats.totalAuditors}`,           color: 'text-blue-600',    icon: Users        },
          { label: 'In Progress',   value: slotStats.inProgress.toLocaleString(),                          color: 'text-amber-600',   icon: Clock        },
          { label: 'Waiting Approval', value: slotStats.awaitingApproval.toLocaleString(),                  color: 'text-purple-600',  icon: ClipboardCheck },
          { label: 'Completed',     value: slotStats.completed.toLocaleString(),                           color: 'text-emerald-600', icon: CheckCircle2 },
        ] as const).map(({ label, value, color, icon: Icon }) => (
          <div key={label} className="bg-white border border-slate-200 rounded-[32px] p-5 flex items-center gap-4 shadow-sm">
            <div className={`p-2.5 rounded-2xl bg-slate-50 ${color} shrink-0`}>
              <Icon className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <p className="text-2xl font-black text-slate-900 truncate tracking-tight">{value}</p>
              <p className="text-[10px] font-bold uppercase text-slate-400 tracking-widest truncate">{label}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* LEFT MAIN COLUMN */}
        <div className="lg:col-span-2 space-y-6">

          {/* Inspection Status Table */}
          <Card className="rounded-[28px] border-slate-200 shadow-sm overflow-hidden bg-white">
            <div className="px-6 pt-5 pb-4 border-b border-slate-100">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-black text-slate-900 tracking-tight">Institutional Inspection Status</h3>
                  <p className="text-[11px] text-slate-500 font-medium mt-0.5">Live tracking of assets inspected vs target per department.</p>
                </div>
                <div className="w-9 h-9 bg-indigo-50 rounded-xl flex items-center justify-center shrink-0">
                  <LayoutDashboard className="w-4 h-4 text-indigo-600" />
                </div>
              </div>
            </div>
        <div className="overflow-x-auto max-h-96 overflow-y-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/50">
                <th className="py-5 px-8 text-[10px] font-black uppercase text-slate-400 tracking-widest">Department</th>
                <th className="py-5 px-6 text-[10px] font-black uppercase text-slate-400 tracking-widest text-center">Total Assets</th>
                <th className="py-5 px-6 text-[10px] font-black uppercase tracking-widest text-center text-emerald-600">Inspected</th>
                <th className="py-5 px-6 text-[10px] font-black uppercase tracking-widest text-center text-slate-500">Locations</th>
                <th className="py-5 px-6 text-[10px] font-black uppercase tracking-widest text-center text-slate-500">No Supervisor</th>
                <th className="py-5 px-8 text-[10px] font-black uppercase text-slate-400 tracking-widest text-right">Progress (%)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(Object.entries(inspectionStats) as [string, { total: number; inspected: number; uninspected: number; progress: number; locations: number; notUpdated: number; noSupervisor: number }][]).map(([deptName, stats]) => (
                <tr key={deptName} className="hover:bg-slate-50/50 transition-colors">
                  <td className="py-5 px-8">
                    <span className="text-sm font-bold text-slate-800">{deptName}</span>
                  </td>
                  <td className="py-5 px-6 text-center">
                    <span className="text-sm font-medium text-slate-600">{stats.total.toLocaleString()}</span>
                  </td>
                  <td className="py-5 px-6 text-center">
                    <span className="text-sm font-bold text-emerald-600">{stats.inspected.toLocaleString()}</span>
                  </td>
                  <td className="py-5 px-6 text-center">
                    <div className="flex flex-col items-center justify-center">
                      <span className="text-sm font-bold text-slate-700">{stats.locations}</span>
                      {stats.notUpdated > 0 && (
                        <span className="mt-1 px-1.5 py-0.5 bg-amber-50 text-amber-600 border border-amber-200/40 rounded-md text-[9px] font-black tracking-tight leading-none text-center">
                          {stats.notUpdated} pending sup
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="py-5 px-6 text-center">
                    {stats.noSupervisor > 0 ? (
                      <span className="inline-flex items-center px-2.5 py-1 bg-red-50 text-red-600 border border-red-200/40 rounded-lg text-xs font-bold">
                        {stats.noSupervisor}
                      </span>
                    ) : (
                      <span className="text-sm text-slate-300">—</span>
                    )}
                  </td>
                  <td className="py-5 px-8">
                    <div className="flex items-center justify-end gap-3">
                      <div className="w-24 h-2 bg-slate-100 rounded-full overflow-hidden hidden sm:block">
                        <BarFill
                          pct={stats.progress}
                          className={`h-full rounded-full transition-all duration-1000 ${
                            stats.progress >= 100 ? 'bg-emerald-500' : stats.progress > 50 ? 'bg-indigo-500' : 'bg-rose-400'
                          }`}
                        />
                      </div>
                      <span className="text-xs font-black text-slate-900 w-12 text-right">{stats.progress.toFixed(1)}%</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
        </div>

        <div className="space-y-8">

          <Card className="rounded-3xl border-slate-200 shadow-sm overflow-hidden">
            <CardHeader className="pb-4">
              <CardTitle className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <UserCheck className="w-5 h-5 text-indigo-600" />
                Officer Workload
              </CardTitle>
              <p className="text-[11px] text-slate-500 font-medium">
                Certified officers assigned in the current overview filters. Threshold: {openAuditThreshold.toLocaleString()} assets.
              </p>
            </CardHeader>
            <CardContent className="p-6 pt-0 space-y-3 max-h-96 overflow-y-auto">
              {officerWorkloadStats.map((officer) => {
                const isOverThreshold = officer.assets >= openAuditThreshold;
                return (
                  <div key={officer.name} className="bg-white border border-slate-200 rounded-2xl p-4 flex items-center justify-between shadow-sm">
                    <div className="flex flex-col min-w-0">
                      <span className="text-sm font-black text-slate-900 truncate">{officer.name}</span>
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">
                        {officer.slots} Slot{officer.slots !== 1 ? 's' : ''} Assigned
                      </span>
                    </div>

                    <div className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border transition-all ${
                      isOverThreshold
                        ? 'bg-rose-50 text-rose-700 border-rose-100'
                        : 'bg-indigo-50 text-indigo-700 border-transparent'
                    }`}>
                      <Package className={`w-3.5 h-3.5 ${isOverThreshold ? 'text-rose-600' : 'text-indigo-600'}`} />
                      <span className="text-sm font-black">{officer.assets.toLocaleString()} / {openAuditThreshold.toLocaleString()}</span>
                    </div>
                  </div>
                );
              })}

              {officerWorkloadStats.length === 0 && (
                <div className="text-center py-6">
                  <p className="text-xs text-slate-400 font-medium italic">No certified officers assigned in the current view.</p>
                </div>
              )}
            </CardContent>
          </Card>

          {true && (
            <Card className="rounded-3xl border-slate-200 shadow-sm overflow-hidden">
              <CardHeader className="pb-4">
                <CardTitle className="text-lg font-bold text-slate-900">In Progress — This Week</CardTitle>
              </CardHeader>
              <CardContent className="p-6 pt-0 space-y-6 max-h-96 overflow-y-auto">
                {Object.keys(upcomingAudits).length === 0 ? (
                  <div className="text-center py-6">
                    <p className="text-xs text-slate-400 font-medium">No inspections currently in progress</p>
                  </div>
                ) : (
                  Object.entries(upcomingAudits)
                    .sort(([a], [b]) => a.localeCompare(b))
                    .map(([weekKey, audits]) => {
                      const weekStart = new Date(weekKey);
                      const weekEnd = new Date(weekKey);
                      weekEnd.setDate(weekEnd.getDate() + 6);
                      const fmt = (d: Date) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
                      return (
                        <div key={weekKey}>
                          <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">
                            Week of {fmt(weekStart)} – {fmt(weekEnd)}
                          </h4>
                          <div className="space-y-2">
                            {audits.map(audit => {
                              const loc = locations.find(l => l.id === audit.locationId);
                              const dept = departments.find(d => d.id === audit.departmentId);
                              return (
                                <div key={audit.id} className="p-3 rounded-xl bg-slate-50 border border-slate-100 flex items-center gap-3 hover:border-blue-200 transition-colors group">
                                  <div className="w-9 h-9 rounded-lg bg-white border border-slate-200 flex flex-col items-center justify-center shrink-0">
                                    <span className="text-[8px] font-black text-blue-600 uppercase">
                                      {audit.date ? new Date(audit.date).toLocaleString('default', { month: 'short' }) : 'N/A'}
                                    </span>
                                    <span className="text-[10px] font-bold text-slate-900">{audit.date ? audit.date.split('-')[2] : '-'}</span>
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <p className="text-xs font-bold text-slate-900 truncate group-hover:text-blue-600 transition-colors">
                                      {loc?.name || audit.locationId}
                                    </p>
                                    <p className="text-[9px] text-slate-400 font-bold uppercase truncate">{dept?.name || audit.departmentId}</p>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>

    </div>
  );
};
