import React, { useState, useMemo, useCallback } from 'react';
import { 
  Users, 
  ShieldAlert, 
  Package, 
  Clock, 
  AlertTriangle, 
  CalendarDays, 
  Trophy, 
  MapPin, 
  CheckCircle2, 
  History,
  Activity
} from 'lucide-react';
import { 
  User, 
  Department, 
  Location, 
  AuditSchedule, 
  AuditPhase, 
  KPITier, 
  KPITierTarget, 
  InstitutionKPITarget, 
  SystemActivity 
} from '@shared/types';
import { StatCard } from './Widgets';
import { KPIStatsWidget } from '../KPIStatsWidget';
import { InspectorRosterGaps } from './widgets/InspectorRosterGaps';
import { InspectionStatusTable } from './widgets/InspectionStatusTable';
import { hasCapability } from '../../lib/pbacUtils';

// Role-scoped views
import { CoordinatorView } from './views/CoordinatorView';
import { SupervisorView } from './views/SupervisorView';
import { InspectorView } from './views/InspectorView';

interface InstitutionalSectionProps {
  currentUser: User;
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
  onUpdateAudit?: (id: string, updates: Partial<AuditSchedule>) => Promise<void>;
  onToggleStatus?: (id: string) => Promise<void>;
  onToggleLock?: (id: string) => Promise<void>;
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
  currentUser, users, departments, locations, schedules, phases, kpiTiers, kpiTierTargets,
  institutionKPIs, activities, buildings, openAuditThreshold,
  onUpdateAudit, onToggleStatus, onToggleLock
}) => {
  const today = new Date().toISOString().split('T')[0];

  // Determine active view elements based on locations and schedules
  const activeLocationIds = useMemo(() => new Set(locations.filter(l => l.status !== 'Archived').map(l => l.id)), [locations]);
  const activeLocations = useMemo(() => locations.filter(l => l.status !== 'Archived'), [locations]);

  // ───────────────────────────────────────────────────────────────────
  // ── INSTITUTION VIEW METRICS & DATA ────────────────────────────────
  // ───────────────────────────────────────────────────────────────────
  const allOfficers = useMemo(() => {
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

  const staffingGaps = useMemo(() => {
    const todayStr = today;
    return departments
      .filter(d => !d.isArchived)
      .map(d => {
        const deptUsers = users.filter(u => u.departmentId === d.id);
        const certified = deptUsers.filter(u => u.certificationExpiry && u.certificationExpiry >= todayStr);
        const deptLocs = activeLocations.filter(l => l.departmentId === d.id);
        const deptTotalAssets = deptLocs.reduce((s, l) => s + (l.totalAssets || 0), 0);
        if (deptTotalAssets === 0) return null;
        const hasHod = !!d.headOfDeptId;
        return {
          id: d.id,
          name: d.name,
          abbr: d.abbr,
          totalUsers: deptUsers.length,
          certifiedOfficers: certified.length,
          hasHod,
          totalAssets: deptTotalAssets,
          gaps: [
            !hasHod && 'No HOD',
            certified.length === 0 && 'No QAIs',
            certified.length === 1 && 'Only 1 QAI',
          ].filter(Boolean) as string[],
        };
      })
      .filter((d): d is NonNullable<typeof d> => d !== null && d.gaps.length > 0)
      .sort((a, b) => b.gaps.length - a.gaps.length);
  }, [departments, users, today, activeLocations]);

  const upcomingSchedules = useMemo(() => {
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

  const completedSchedules = useMemo(() => {
    return schedules
      .filter(s => s.status === 'Completed')
      .map(s => {
        const loc = locations.find(l => l.id === s.locationId);
        const dept = departments.find(d => d.id === s.departmentId);
        return {
          ...s,
          locationName: loc?.name || 'Unknown',
          deptAbbr: dept?.abbr || dept?.name || 'N/A',
          totalAssets: loc?.totalAssets || 0,
          assetStatuses: s.assetStatuses || null,
        };
      })
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
      .slice(0, 20);
  }, [schedules, locations, departments]);

  const auditStats = useMemo(() => {
    const activeSchedules = schedules.filter(s => activeLocationIds.has(s.locationId));
    return {
      totalLocations: activeLocations.length,
      totalAssets: activeLocations.reduce((s, l) => s + (l.totalAssets || 0), 0),
      total: activeSchedules.length,
      assigned: activeSchedules.filter(s => s.auditor1Id && s.auditor2Id).length,
      inProgress: activeSchedules.filter(s => s.status === 'In Progress').length,
      completed: activeSchedules.filter(s => s.status === 'Completed').length,
    };
  }, [schedules, activeLocations, activeLocationIds]);

  const inspectionByDept = useMemo(() => {
    return departments
      .filter(d => !d.isArchived)
      .map(dept => {
        const deptLocs = activeLocations.filter(l => l.departmentId === dept.id);
        const totalAssets = deptLocs.reduce((s, l) => s + (l.totalAssets || 0), 0);
        if (totalAssets === 0) return null;
        const completedAssets = deptLocs.reduce((s, l) => {
          const sched = schedules.find(sc => sc.locationId === l.id);
          return s + (sched?.status === 'Completed' ? (l.totalAssets || 0) : 0);
        }, 0);
        const pending = deptLocs.filter(l => {
          const s = schedules.find(sc => sc.locationId === l.id);
          return !s || s.status === 'Pending';
        }).length;
        const inProgress = deptLocs.filter(l => schedules.find(sc => sc.locationId === l.id)?.status === 'In Progress').length;
        const completed = deptLocs.filter(l => schedules.find(sc => sc.locationId === l.id)?.status === 'Completed').length;
        const noSupervisor = deptLocs.filter(l => !l.supervisorId).length;
        const progress = totalAssets > 0 ? Math.round((completedAssets / totalAssets) * 100) : 0;
        return {
          id: dept.id,
          name: dept.abbr || dept.name,
          locs: deptLocs.length,
          totalAssets,
          pending,
          inProgress,
          completed,
          noSupervisor,
          progress,
        };
      })
      .filter((d): d is NonNullable<typeof d> => d !== null && d.locs > 0)
      .sort((a, b) => a.progress - b.progress);
  }, [departments, activeLocations, schedules]);

  const totalOfficers = allOfficers.length;
  const overloadedOfficers = allOfficers.filter(o => o.isOverloaded).length;
  const deptsWithGaps = staffingGaps.length;

  // ───────────────────────────────────────────────────────────────────
  // ── COORDINATOR WORKSPACE DATA ─────────────────────────────────────
  // ───────────────────────────────────────────────────────────────────
  const coordDeptId = currentUser.departmentId;
  const coordDept = useMemo(() => departments.find(d => d.id === coordDeptId), [departments, coordDeptId]);

  const coordLocations = useMemo(() => {
    if (!coordDeptId) return [];
    return activeLocations.filter(l => l.departmentId === coordDeptId);
  }, [activeLocations, coordDeptId]);

  const coordSchedules = useMemo(() => {
    if (!coordDeptId) return [];
    return schedules.filter(s => s.departmentId === coordDeptId && activeLocationIds.has(s.locationId));
  }, [schedules, coordDeptId, activeLocationIds]);

  const coordStats = useMemo(() => {
    const totalLocs = coordLocations.length;
    const totalAssets = coordLocations.reduce((sum, l) => sum + (l.totalAssets || 0), 0);
    const completedAssets = coordLocations.reduce((sum, l) => {
      const s = schedules.find(sc => sc.locationId === l.id);
      return sum + (s?.status === 'Completed' ? (l.totalAssets || 0) : 0);
    }, 0);
    const progress = totalAssets > 0 ? Math.round((completedAssets / totalAssets) * 100) : 0;
    
    return {
      totalLocs,
      totalAssets,
      completedAssets,
      progress,
      pending: coordSchedules.filter(s => s.status === 'Pending').length,
      inProgress: coordSchedules.filter(s => s.status === 'In Progress').length,
      completed: coordSchedules.filter(s => s.status === 'Completed').length,
    };
  }, [coordLocations, coordSchedules, schedules]);

  const coordStaffGaps = useMemo(() => {
    if (!coordDeptId || !coordDept) return [];
    const deptUsers = users.filter(u => u.departmentId === coordDeptId);
    const certified = deptUsers.filter(u => u.certificationExpiry && u.certificationExpiry >= today);
    const hasHod = !!coordDept.headOfDeptId;
    return [
      !hasHod && 'No HOD (Head of Department) Assigned',
      certified.length === 0 && 'No Quality Asset Inspectors (QAIs)',
      certified.length === 1 && 'Only 1 QAI Registered (Minimum 2 recommended for cross-audit redundancy)',
    ].filter(Boolean) as string[];
  }, [coordDeptId, coordDept, users, today]);

  const coordOfficers = useMemo(() => {
    if (!coordDeptId) return [];
    const deptUsers = users.filter(u => u.departmentId === coordDeptId);
    
    return deptUsers.map(u => {
      const isCertified = !!(u.certificationExpiry && u.certificationExpiry >= today);
      let assignedAssets = 0;
      let assignedSchedules = 0;
      
      schedules.forEach(s => {
        if (s.auditor1Id === u.id || s.auditor2Id === u.id) {
          assignedSchedules++;
          const loc = locations.find(l => l.id === s.locationId);
          if (loc) {
            assignedAssets += loc.totalAssets || 0;
          }
        }
      });
      
      return {
        ...u,
        isCertified,
        assignedSchedules,
        assignedAssets,
        isOverloaded: assignedAssets >= openAuditThreshold
      };
    }).sort((a, b) => b.assignedAssets - a.assignedAssets);
  }, [coordDeptId, users, schedules, locations, openAuditThreshold, today]);

  // ───────────────────────────────────────────────────────────────────
  // ── SUPERVISOR WORKSPACE DATA ──────────────────────────────────────
  // ───────────────────────────────────────────────────────────────────
  const isSupervisorOf = useCallback((locSupervisorId: string | null) => {
    if (!locSupervisorId) return false;
    return locSupervisorId.split(',').map(id => id.trim()).filter(Boolean).includes(currentUser.id);
  }, [currentUser.id]);

  const supLocations = useMemo(() => {
    return activeLocations.filter(l => isSupervisorOf(l.supervisorId));
  }, [activeLocations, isSupervisorOf]);

  const supLocationIds = useMemo(() => new Set(supLocations.map(l => l.id)), [supLocations]);

  const supSchedules = useMemo(() => {
    return schedules.filter(s => supLocationIds.has(s.locationId) && activeLocationIds.has(s.locationId));
  }, [schedules, supLocationIds, activeLocationIds]);

  const supStats = useMemo(() => {
    const totalLocs = supLocations.length;
    const totalAssets = supLocations.reduce((sum, l) => sum + (l.totalAssets || 0), 0);
    const completedAssets = supLocations.reduce((sum, l) => {
      const s = schedules.find(sc => sc.locationId === l.id);
      return sum + (s?.status === 'Completed' ? (l.totalAssets || 0) : 0);
    }, 0);
    const progress = totalAssets > 0 ? Math.round((completedAssets / totalAssets) * 100) : 0;
    
    return {
      totalLocs,
      totalAssets,
      completedAssets,
      progress,
      pending: supSchedules.filter(s => s.status === 'Pending').length,
      inProgress: supSchedules.filter(s => s.status === 'In Progress').length,
      completed: supSchedules.filter(s => s.status === 'Completed').length,
    };
  }, [supLocations, supSchedules, schedules]);

  const supPendingApprovals = useMemo(() => {
    return schedules
      .filter(s => s.status === 'Completed' && supLocationIds.has(s.locationId))
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
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  }, [schedules, supLocationIds, locations, departments, users]);

  const supUpcomingInspections = useMemo(() => {
    return schedules
      .filter(s => s.status !== 'Completed' && supLocationIds.has(s.locationId) && activeLocationIds.has(s.locationId))
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
  }, [schedules, supLocationIds, locations, departments, users, activeLocationIds]);

  // ───────────────────────────────────────────────────────────────────
  // ── INSPECTOR WORKSPACE DATA ───────────────────────────────────────
  // ───────────────────────────────────────────────────────────────────
  const mySchedules = useMemo(() => {
    return schedules
      .filter(s => (s.auditor1Id === currentUser.id || s.auditor2Id === currentUser.id) && activeLocationIds.has(s.locationId))
      .map(s => {
        const loc = locations.find(l => l.id === s.locationId);
        const dept = departments.find(d => d.id === s.departmentId);
        const partnerId = s.auditor1Id === currentUser.id ? s.auditor2Id : s.auditor1Id;
        const partner = users.find(u => u.id === partnerId);
        return {
          ...s,
          locationName: loc?.name || 'Unknown',
          deptAbbr: dept?.abbr || dept?.name || 'N/A',
          totalAssets: loc?.totalAssets || 0,
          partnerName: partner?.name || 'None Assigned',
        };
      });
  }, [schedules, currentUser.id, locations, departments, users, activeLocationIds]);

  const inspectorStats = useMemo(() => {
    const totalAssigned = mySchedules.length;
    const completed = mySchedules.filter(s => s.status === 'Completed').length;
    const inProgress = mySchedules.filter(s => s.status === 'In Progress').length;
    const pending = mySchedules.filter(s => s.status === 'Pending').length;
    const totalAssets = mySchedules.reduce((sum, s) => sum + s.totalAssets, 0);
    
    return {
      totalAssigned,
      completed,
      inProgress,
      pending,
      totalAssets,
    };
  }, [mySchedules]);

  const isQAIActive = useMemo(() => {
    return !!(currentUser.certificationExpiry && currentUser.certificationExpiry >= today);
  }, [currentUser.certificationExpiry, today]);

  // ───────────────────────────────────────────────────────────────────
  // ── TAB SELECTION STATE AND ELIGIBILITY ────────────────────────────
  // ───────────────────────────────────────────────────────────────────
  const tabOptions = useMemo(() => {
    const isCoordinator = hasCapability(currentUser, 'manage:users') || hasCapability(currentUser, 'system:admin');
    const isSupervisor = hasCapability(currentUser, 'schedule:manage_dept') || hasCapability(currentUser, 'schedule:manage_all');
    return [
      { id: 'institution', label: 'Institution Overview', icon: Trophy, visible: true, count: null },
      { id: 'department', label: 'My Department', icon: Users, visible: isCoordinator, count: coordStaffGaps.length },
      { id: 'supervisor', label: 'My Supervised Sites', icon: MapPin, visible: isSupervisor, count: supPendingApprovals.length + supUpcomingInspections.filter(s => s.status === 'In Progress').length },
      { id: 'assignments', label: 'My Assignments', icon: CalendarDays, visible: true, count: mySchedules.filter(s => s.status !== 'Completed').length },
    ];
  }, [currentUser, coordStaffGaps, supPendingApprovals, supUpcomingInspections, mySchedules]);

  const defaultTab = useMemo(() => {
    if (hasCapability(currentUser, 'system:admin')) return 'institution';
    if (hasCapability(currentUser, 'manage:users')) return 'department';
    if (hasCapability(currentUser, 'schedule:manage_dept')) return 'supervisor';
    return 'assignments';
  }, [currentUser]);

  const [activeTab, setActiveTab] = useState<string>(defaultTab);

  return (
    <div className="space-y-6">
      {/* Tab Navigation */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200/80 pb-4">
        <div className="bg-slate-100/90 backdrop-blur-md border border-slate-200/60 p-1 rounded-2xl flex flex-wrap gap-1 shadow-inner">
          {tabOptions.filter(t => t.visible).map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all duration-200 ${
                  isActive
                    ? 'bg-white text-slate-900 shadow-md shadow-slate-200/50 scale-102 font-extrabold border border-slate-100'
                    : 'text-slate-500 hover:text-slate-800 hover:bg-white/40'
                }`}
              >
                <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-indigo-600' : 'text-slate-400'}`} />
                {tab.label}
                {tab.count !== null && tab.count > 0 && (
                  <span className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-[9px] font-black ${
                    isActive ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-200 text-slate-600'
                  }`}>
                    {tab.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
        
        <div className="flex items-center gap-2 bg-slate-50 border border-slate-200/60 px-4 py-2 rounded-2xl">
          <Activity className="w-3.5 h-3.5 text-slate-400" />
          <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
            Active User: {currentUser.name} ({currentUser.roles.join(', ')})
          </span>
        </div>
      </div>

      {/* Tab content rendering */}
      {activeTab === 'institution' && (
        <div className="space-y-6">
          {/* KPI Progress */}
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

          {/* Location Overview */}
          <div className="rounded-3xl border border-slate-200 bg-white shadow-sm p-6">
            <div className="grid grid-cols-2 gap-4 mb-4">
              <StatCard icon={Package} label="Total Assets" value={auditStats.totalAssets.toLocaleString()} color="text-blue-600" />
              <StatCard icon={MapPin} label="Active Locations" value={auditStats.totalLocations.toLocaleString()} color="text-slate-700" />
            </div>
            {/* Status breakdown badges */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mr-1">Status:</span>
              <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-slate-100 text-slate-500 rounded-lg text-[10px] font-bold">
                <span className="w-1.5 h-1.5 rounded-full bg-slate-400"></span>
                Pending {auditStats.total - auditStats.inProgress - auditStats.completed}
              </span>
              <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-amber-50 text-amber-600 rounded-lg text-[10px] font-bold">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                In Progress {auditStats.inProgress}
              </span>
              <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-green-50 text-emerald-600 rounded-lg text-[10px] font-bold">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                Completed {auditStats.completed}
              </span>
              <span className="w-px h-4 bg-slate-200 mx-1"></span>
              <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-red-50 text-red-500 rounded-lg text-[10px] font-bold">
                <span className="w-1.5 h-1.5 rounded-full bg-red-400"></span>
                No Supervisor {activeLocations.filter(l => !l.supervisorId).length}
              </span>
            </div>
          </div>

          {/* Institution Health Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <StatCard icon={Users} label="Qualified Asset Inspectors" value={totalOfficers} color="text-indigo-600" />
            <StatCard icon={ShieldAlert} label="Overloaded Inspectors" value={overloadedOfficers} color={overloadedOfficers > 0 ? 'text-red-500' : 'text-emerald-500'} />
            <StatCard icon={AlertTriangle} label="Depts with Gaps" value={deptsWithGaps} color={deptsWithGaps > 0 ? 'text-amber-500' : 'text-emerald-500'} />
          </div>

          {/* Inspection Status Table */}
          <InspectionStatusTable data={inspectionByDept} />

          {/* Upcoming Schedule */}
          {upcomingSchedules.length > 0 && (
            <div className="rounded-3xl border border-indigo-100 bg-white shadow-sm overflow-hidden">
              <div className="p-5 border-b border-slate-100 flex items-center justify-between">
                <h3 className="text-sm font-black text-slate-900 flex items-center gap-2">
                  <CalendarDays className="w-4 h-4 text-indigo-500" />
                  Upcoming Schedule
                </h3>
                <span className="text-[10px] text-slate-400 font-bold">{upcomingSchedules.length} locked</span>
              </div>
              <div className="divide-y divide-slate-50 max-h-80 overflow-auto">
                {upcomingSchedules.map(s => {
                  const d = s.date ? new Date(s.date + 'T00:00:00') : null;
                  const month = d ? d.toLocaleString('default', { month: 'short' }).toUpperCase() : '—';
                  const day = d ? d.getDate() : '—';
                  return (
                    <div key={s.id} className="flex items-center gap-4 px-5 py-3 hover:bg-indigo-50/20 transition-colors">
                      <div className="w-12 h-12 rounded-xl bg-slate-50 border border-slate-200 flex flex-col items-center justify-center shrink-0">
                        <span className="text-[9px] font-black text-indigo-600 uppercase leading-none">{month}</span>
                        <span className="text-lg font-black text-slate-800 leading-none">{day}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-bold text-slate-800 text-sm truncate">{s.locationName}</div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-xs text-slate-400 font-medium">{s.deptAbbr}</span>
                          <span className="inline-flex px-2 py-0.5 bg-indigo-50 text-indigo-600 rounded-full text-[10px] font-bold">{s.totalAssets.toLocaleString()} Assets</span>
                        </div>
                      </div>
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-indigo-50 text-indigo-600 rounded-lg text-[10px] font-bold shrink-0">
                        Ready
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Recently Completed */}
          {completedSchedules.length > 0 && (
            <div className="rounded-3xl border border-emerald-100 bg-white shadow-sm overflow-hidden">
              <div className="p-5 border-b border-slate-100 flex items-center justify-between">
                <h3 className="text-sm font-black text-slate-900 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                  Recently Completed Asset Statuses
                </h3>
                <span className="text-[10px] text-slate-400 font-bold">{completedSchedules.length} locations</span>
              </div>
              <div className="overflow-x-auto max-h-96 overflow-y-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 sticky top-0 z-10">
                    <tr>
                      <th className="px-4 py-3 text-[10px] font-black uppercase text-slate-400">Location</th>
                      <th className="px-3 py-3 text-[10px] font-black uppercase text-slate-400">Dept</th>
                      <th className="px-3 py-3 text-[10px] font-black uppercase text-slate-400 text-center">Total</th>
                      <th className="px-2 py-3 text-[10px] font-black uppercase text-emerald-500 text-center" title="In Use">A</th>
                      <th className="px-2 py-3 text-[10px] font-black uppercase text-slate-400 text-center" title="Not In Use">B</th>
                      <th className="px-2 py-3 text-[10px] font-black uppercase text-rose-500 text-center" title="Broken">C</th>
                      <th className="px-2 py-3 text-[10px] font-black uppercase text-amber-500 text-center" title="Under Maintenance">D</th>
                      <th className="px-2 py-3 text-[10px] font-black uppercase text-blue-500 text-center" title="Borrowed">E</th>
                      <th className="px-4 py-3 text-[10px] font-black uppercase text-rose-600 text-right" title="Missing">F</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {completedSchedules.map(s => {
                      const d = s.date ? new Date(s.date + 'T00:00:00') : null;
                      const dateStr = d ? d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
                      const st = s.assetStatuses || {};
                      const inUse = st['In Use'] || 0;
                      const notInUse = st['Not In Use'] || 0;
                      const broken = st['Broken'] || 0;
                      const maint = st['Under Maintenance'] || 0;
                      const borrow = st['Borrowed'] || 0;
                      const missing = st['Missing'] || 0;
                      
                      return (
                        <tr key={s.id} className="hover:bg-emerald-50/20 transition-colors">
                          <td className="px-4 py-3">
                            <div className="font-bold text-slate-800">{s.locationName}</div>
                            <div className="text-[10px] text-slate-400 font-medium">{dateStr}</div>
                          </td>
                          <td className="px-3 py-3 font-bold text-slate-600">{s.deptAbbr}</td>
                          <td className="px-3 py-3 text-center">
                            <span className="inline-flex px-2 py-0.5 bg-emerald-50 text-emerald-600 rounded-lg text-[10px] font-bold">
                              {s.totalAssets}
                            </span>
                          </td>
                          <td className={`px-2 py-3 text-center font-bold ${inUse > 0 ? 'text-emerald-600' : 'text-slate-300'}`}>{inUse || '—'}</td>
                          <td className={`px-2 py-3 text-center font-bold ${notInUse > 0 ? 'text-slate-500' : 'text-slate-300'}`}>{notInUse || '—'}</td>
                          <td className={`px-2 py-3 text-center font-bold ${broken > 0 ? 'text-rose-500' : 'text-slate-300'}`}>{broken || '—'}</td>
                          <td className={`px-2 py-3 text-center font-bold ${maint > 0 ? 'text-amber-500' : 'text-slate-300'}`}>{maint || '—'}</td>
                          <td className={`px-2 py-3 text-center font-bold ${borrow > 0 ? 'text-blue-500' : 'text-slate-300'}`}>{borrow || '—'}</td>
                          <td className={`px-4 py-3 text-right font-bold ${missing > 0 ? 'text-rose-600' : 'text-slate-300'}`}>{missing || '—'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="p-4 bg-slate-50 border-t border-slate-100 flex flex-wrap items-center gap-x-6 gap-y-2">
                <span className="text-[9px] text-slate-500 font-medium"><span className="font-bold text-emerald-600">A</span> = In Use</span>
                <span className="text-[9px] text-slate-500 font-medium"><span className="font-bold text-slate-600">B</span> = Not In Use</span>
                <span className="text-[9px] text-slate-500 font-medium"><span className="font-bold text-rose-600">C</span> = Broken</span>
                <span className="text-[9px] text-slate-500 font-medium"><span className="font-bold text-amber-600">D</span> = Under Maintenance</span>
                <span className="text-[9px] text-slate-500 font-medium"><span className="font-bold text-blue-600">E</span> = Borrowed</span>
                <span className="text-[9px] text-slate-500 font-medium"><span className="font-bold text-rose-600">F</span> = Missing</span>
              </div>
            </div>
          )}

          {/* Inspector Roster + Gaps */}
          <InspectorRosterGaps allInspectors={allOfficers} totalInspectors={totalOfficers} staffingGaps={staffingGaps} />

          {/* System Activity */}
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
      )}

      {activeTab === 'department' && (
        <CoordinatorView
          coordDeptId={coordDeptId}
          coordDept={coordDept}
          coordLocations={coordLocations}
          coordStats={coordStats}
          coordStaffGaps={coordStaffGaps}
          coordOfficers={coordOfficers}
        />
      )}

      {activeTab === 'supervisor' && (
        <SupervisorView
          supLocations={supLocations}
          supStats={supStats}
          supPendingApprovals={supPendingApprovals}
          supUpcomingInspections={supUpcomingInspections}
          onToggleLock={onToggleLock}
        />
      )}

      {activeTab === 'assignments' && (
        <InspectorView
          currentUser={currentUser}
          mySchedules={mySchedules}
          inspectorStats={inspectorStats}
          isQAIActive={isQAIActive}
          onUpdateAudit={onUpdateAudit}
          onToggleStatus={onToggleStatus}
        />
      )}
    </div>
  );
};
