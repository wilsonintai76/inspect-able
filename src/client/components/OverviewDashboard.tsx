
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { AuditSchedule, DashboardConfig, AuditPhase, KPITier, KPITierTarget, Department, Location, User, AuditGroup, SystemActivity, InstitutionKPITarget, Building } from '@shared/types';
import { StatsCards } from './StatsCards';
import { CustomizeDashboardModal } from './CustomizeDashboardModal';
import { KPIStatsWidget } from './KPIStatsWidget';
import { TierDistributionTable } from './TierDistributionTable';
import { Sliders, GraduationCap, Filter, ChevronDown, LayoutDashboard, Package, Calendar, Users, Clock, CheckCircle2 } from 'lucide-react';
import { ActiveEntitiesList } from './ActiveEntitiesList';
import { PageHeader } from './PageHeader';
import { useLanguage } from '../contexts/LanguageContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';

interface OverviewDashboardProps {
  schedules: AuditSchedule[];
  config: DashboardConfig;
  onUpdateConfig: (config: DashboardConfig) => void;
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
  onRebalance?: () => void;
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
  config,
  onUpdateConfig,
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
  users = [],
  onRebalance
}) => {
  const { t } = useLanguage();
  const [isCustomizeOpen, setIsCustomizeOpen] = useState(false);
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

  const upcomingAudits = [...filteredSchedules]
    .filter(s => s.status !== 'Completed')
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    .slice(0, 3);

  const deptCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    filteredLocations.forEach(l => {
      const dept = departments.find(d => d.id === l.departmentId);
      const name = dept?.name || l.departmentId;
      counts[name] = (counts[name] || 0) + 1;
    });
    return counts;
  }, [filteredLocations, departments]);

  const sortedDepts = useMemo(() => 
    (Object.entries(deptCounts) as [string, number][]).sort((a, b) => b[1] - a[1])
  , [deptCounts]);

  const activeEntities = useMemo(() => {
    const groupedDepts: Record<string, Department[]> = {};
    
    departments.filter(d => !d.isExempted).forEach(dept => {
      // TRUST the auditGroupId. Every department is part of a group in the new architecture.
      const key = dept.auditGroupId || 'unassigned_' + dept.id;
      if (!groupedDepts[key]) groupedDepts[key] = [];
      groupedDepts[key].push(dept);
    });

    return Object.entries(groupedDepts).map(([groupId, depts]) => {
      const isActuallyUnassigned = groupId.startsWith('unassigned_');
      const totalAssets = depts.reduce((sum, d) => sum + (d.totalAssets || 0), 0);
      const totalAuditors = depts.reduce((sum, d) => sum + (d.auditorCount || 0), 0);

      // Staffing Recommendation Logic
      const recommended = depts.reduce((sum, d) => {
        if (d.auditorsRequiredOverride !== undefined && d.auditorsRequiredOverride !== null) {
          return sum + d.auditorsRequiredOverride;
        }
        const assets = d.totalAssets || 0;
        if (assets === 0) return sum + 0;
        const raw = Math.ceil(assets / openAuditThreshold);
        return sum + Math.max(2, raw * 2);
      }, 0);
      
      // Name Resolution: Group Record Name > First Dept Name
      const groupRecord = auditGroups.find(g => g.id === groupId);
      const name = groupRecord?.name || depts[0].name;
      
      return {
        name,
        assets: totalAssets,
        auditors: totalAuditors,
        recommended,
        memberCount: depts.length,
        isJoint: !isActuallyUnassigned && depts.length > 1,
        isConsolidated: !isActuallyUnassigned,
        id: groupId,
        members: depts
      };
    }).sort((a, b) => b.assets - a.assets);
  }, [departments, auditGroups, locations, openAuditThreshold]);

  const overallTotalAssets = useMemo(() => {
     return departments.reduce((sum, d) => sum + (typeof d.totalAssets === 'string' ? parseInt(d.totalAssets) : (d.totalAssets || 0)), 0);
  }, [departments]);

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
    const stats: Record<string, { total: number; inspected: number; uninspected: number; progress: number; locations: number; notUpdated: number }> = {};

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

      stats[dept.name] = {
        total,
        inspected,
        uninspected: finalUninspected,
        progress: total > 0 ? (inspected / total) * 100 : 0,
        locations: deptLocs.length,
        notUpdated
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
      completed: schedules.filter(s => s.status === 'Completed').length,
    };
  }, [schedules, users, overallStats.total]);

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-500 pb-20">
      <PageHeader
        title={t('dashboard.title')}
        description={t('dashboard.subtitle')}
        icon={LayoutDashboard}
        activePhase={activePhase}
      >
        <div className="flex items-center gap-3">
          <Button 
            variant={activePhase ? "outline" : "default"}
            size="sm"
            onClick={() => setIsCustomizeOpen(true)}
            className={`flex items-center gap-2 rounded-xl text-xs font-bold transition-all shadow-sm active:scale-95 ${
              activePhase && 'bg-white/10 text-white border-white/20 hover:bg-white/20'
            }`}
          >
            <Sliders className={`w-4 h-4 ${activePhase ? 'text-emerald-400' : 'text-blue-500'}`} />
            Customize View
          </Button>
          {!activePhase && (
            <div className="text-right hidden sm:block">
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">System Status</p>
              <p className="text-xs font-bold text-emerald-600 flex items-center gap-1.5 justify-end">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                All Systems Operational
              </p>
            </div>
          )}
        </div>
      </PageHeader>

      {/* Schedule Stats Bar */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {([
          { label: 'Total Assets',  value: slotStats.totalAssets.toLocaleString(),                        color: 'text-indigo-600',  icon: Package      },
          { label: 'Total Slots',   value: slotStats.totalSlots.toLocaleString(),                          color: 'text-slate-800',   icon: Calendar     },
          { label: 'Assigned',      value: `${slotStats.assigned} / ${slotStats.totalAuditors}`,           color: 'text-blue-600',    icon: Users        },
          { label: 'In Progress',   value: slotStats.inProgress.toLocaleString(),                          color: 'text-amber-600',   icon: Clock        },
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

          {/* Inspection Status Table — filters live in its header */}
          <Card className="rounded-[28px] border-slate-200 shadow-sm overflow-hidden bg-white">
            <div className="px-6 pt-5 pb-4 border-b border-slate-100">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h3 className="text-base font-black text-slate-900 tracking-tight">Institutional Inspection Status</h3>
                  <p className="text-[11px] text-slate-500 font-medium mt-0.5">Live tracking of assets inspected vs target per department.</p>
                </div>
                <div className="w-9 h-9 bg-indigo-50 rounded-xl flex items-center justify-center shrink-0">
                  <LayoutDashboard className="w-4 h-4 text-indigo-600" />
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Select value={selectedDept} onValueChange={setSelectedDept}>
                  <SelectTrigger className="bg-slate-50 border-slate-200 rounded-xl text-xs font-bold h-9 px-3 min-w-37.5">
                    <SelectValue placeholder="All Departments" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="All">All Departments</SelectItem>
                    {departments.map(d => (
                      <SelectItem key={d.id} value={d.name}>{d.name} ({d.abbr})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={selectedBlock} onValueChange={setSelectedBlock}>
                  <SelectTrigger className="bg-slate-50 border-slate-200 rounded-xl text-xs font-bold h-9 px-3 min-w-37.5">
                    <SelectValue placeholder="All Buildings" />
                  </SelectTrigger>
                  <SelectContent>
                    {uniqueBlocks.map(b => {
                      if (b === 'All') return <SelectItem key={b} value={b}>All Buildings</SelectItem>;
                      const fullBuilding = buildings.find(building => building.abbr === b);
                      const displayName = fullBuilding ? `${b} — ${fullBuilding.name}` : b;
                      return <SelectItem key={b} value={b}>{displayName}</SelectItem>;
                    })}
                  </SelectContent>
                </Select>
                <Select value={selectedLevel} onValueChange={setSelectedLevel}>
                  <SelectTrigger className="bg-slate-50 border-slate-200 rounded-xl text-xs font-bold h-9 px-3 min-w-27.5">
                    <SelectValue placeholder="All Levels" />
                  </SelectTrigger>
                  <SelectContent>
                    {uniqueLevels.map(l => (
                      <SelectItem key={l} value={l}>{l === 'All' ? 'All Levels' : l}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/50">
                <th className="py-5 px-8 text-[10px] font-black uppercase text-slate-400 tracking-widest">Department</th>
                <th className="py-5 px-6 text-[10px] font-black uppercase text-slate-400 tracking-widest text-center">Total Assets</th>
                <th className="py-5 px-6 text-[10px] font-black uppercase tracking-widest text-center text-emerald-600">Inspected</th>
                <th className="py-5 px-6 text-[10px] font-black uppercase tracking-widest text-center text-slate-500">Locations</th>
                <th className="py-5 px-8 text-[10px] font-black uppercase text-slate-400 tracking-widest text-right">Progress (%)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(Object.entries(inspectionStats) as [string, { total: number; inspected: number; uninspected: number; progress: number; locations: number; notUpdated: number }][]).map(([deptName, stats]) => (
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

          {config.showStats && <StatsCards schedules={filteredSchedules} />}

          {(config.showKPI ?? true) && phases?.length > 0 && kpiTiers?.length > 0 && (
            <KPIStatsWidget 
                phases={phases}
                kpiTiers={kpiTiers}
                kpiTierTargets={kpiTierTargets}
                departments={departments}
                locations={locations}
                schedules={filteredSchedules}
                institutionKPIs={institutionKPIs}
            />
          )}

          {(config.showKPI ?? true) && phases?.length > 0 && kpiTiers?.length > 0 && (
            <TierDistributionTable 
              departments={departments}
              kpiTiers={kpiTiers}
              kpiTierTargets={kpiTierTargets}
              phases={phases}
              schedules={schedules}
              locations={locations}
              openAuditThreshold={openAuditThreshold}
              users={users}
              buildings={buildings}
              onRebalance={onRebalance}
              isAdmin={currentUser.roles?.includes('Admin')}
            />
          )}

          {config.showTrends && (
            <Card className="rounded-3xl border-slate-200 shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-xl font-bold text-slate-900">Compliance Trends</CardTitle>
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full bg-blue-500"></span>
                  <span className="text-xs font-bold text-slate-500 uppercase">Weekly Goal</span>
                </div>
              </CardHeader>
              <CardContent className="p-8 pt-0">
                <div className="h-48 flex items-end gap-3 md:gap-6">
                  {[45, 78, 55, 90, 65, 82, 95].map((height, i) => (
                    <div key={i} className="grow flex flex-col items-center group">
                    <HeightFill
                        pct={height}
                        className={`w-full rounded-t-lg transition-all duration-500 ${i === 6 ? 'bg-blue-600' : 'bg-slate-100 group-hover:bg-slate-200'}`}
                      />
                      <span className="text-[10px] font-bold text-slate-400 mt-2 uppercase">Day 0{i+1}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {config.showDeptDistribution && (
            <div className="bg-white rounded-3xl border border-slate-200 p-8 shadow-sm">
              <h3 className="text-xl font-bold text-slate-900 mb-6">Departmental Distribution</h3>
              <div className="space-y-4">
                {sortedDepts.map(([dept, count], idx: number) => (
                  <div key={dept} className="space-y-2">
                    <div className="flex justify-between items-center text-xs font-bold">
                      <span className="text-slate-700">{dept}</span>
                      <span className="text-slate-400">{count} Locations</span>
                    </div>
                    <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                      <BarFill
                        pct={(count / (filteredLocations?.length || 1)) * 100}
                        className={`h-full rounded-full transition-all duration-1000 delay-${idx * 100} ${
                          idx % 3 === 0 ? 'bg-blue-500' : idx % 3 === 1 ? 'bg-indigo-500' : 'bg-slate-400'
                        }`}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="space-y-8">
            <ActiveEntitiesList
              entities={activeEntities}
              selectedEntity=""
              onSelect={() => {}}
              megaTargetThreshold={3000}
              minAuditors={strictAuditorRule ? 2 : 1}
              overallTotal={overallTotalAssets}
              threshold={maxAssetsPerDay}
              strictAuditorRule={strictAuditorRule}
              openAuditThreshold={openAuditThreshold}
              locations={locations}
            />
          
          {config.showUpcoming && (
            <Card className="rounded-3xl border-slate-200 shadow-sm overflow-hidden">
              <CardHeader className="pb-4">
                <CardTitle className="text-lg font-bold text-slate-900">Upcoming Inspections</CardTitle>
              </CardHeader>
              <CardContent className="p-6 pt-0 space-y-4">
                {upcomingAudits.map((audit) => {
                  const loc = locations.find(l => l.id === audit.locationId);
                  const dept = departments.find(d => d.id === audit.departmentId);
                  
                  return (
                    <div key={audit.id} className="p-4 rounded-2xl bg-slate-50 border border-slate-100 flex items-center gap-4 hover:border-blue-200 transition-colors group">
                      <div className="w-10 h-10 rounded-xl bg-white border border-slate-200 flex flex-col items-center justify-center shrink-0">
                        <span className="text-[9px] font-black text-blue-600 uppercase">
                          {audit.date ? new Date(audit.date).toLocaleString('default', { month: 'short' }) : 'N/A'}
                        </span>
                        <span className="text-xs font-bold text-slate-900">{audit.date ? audit.date.split('-')[2] : '-'}</span>
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-slate-900 truncate group-hover:text-blue-600 transition-colors">
                          {loc?.name || audit.locationId}
                        </p>
                        <p className="text-[10px] text-slate-400 font-bold uppercase">{dept?.name || audit.departmentId}</p>
                      </div>
                    </div>
                  );
                })}
                {(!upcomingAudits || upcomingAudits.length === 0) && (
                  <div className="text-center py-6">
                    <p className="text-xs text-slate-400 font-medium italic">No upcoming inspections scheduled.</p>
                  </div>
                )}
                <Button variant="outline" className="w-full py-3 h-auto text-xs font-bold text-blue-600 border-blue-100 rounded-xl hover:bg-blue-50 transition-colors">
                  View Full Calendar
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {isCustomizeOpen && (
        <CustomizeDashboardModal 
          config={config}
          onClose={() => setIsCustomizeOpen(false)}
          onSave={(newConfig) => {
            onUpdateConfig(newConfig);
            setIsCustomizeOpen(false);
          }}
        />
      )}
    </div>
  );
};
