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
  FileText,
  Lock,
  Unlock,
  ExternalLink,
  Activity,
  ArrowRight,
  ShieldCheck,
  Check,
  ChevronRight,
  UserCheck,
  Building2
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
  // ── INSTITUTION VIEW LOGIC (ORIGINAL METRICS) ──────────────────────
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
  // ── COORDINATOR DASHBOARD LOGIC (SCOPED TO DEPT) ───────────────────
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
  // ── SUPERVISOR DASHBOARD LOGIC (SCOPED TO SUPERVISED LOCATIONS) ─────
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
    // Shows completed inspections at their supervised locations waiting for HOD verification / locking
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

  // ───────────────────────────────────────────────────────────────────
  // ── INSPECTOR DASHBOARD LOGIC (SCOPED TO ASSIGNMENTS) ──────────────
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
    const isCoordinator = currentUser.roles.includes('Coordinator') || currentUser.roles.includes('Admin');
    const isSupervisor = currentUser.roles.includes('Supervisor') || currentUser.roles.includes('Admin');
    return [
      { id: 'institution', label: 'Institution Overview', icon: Trophy, visible: true, count: null },
      { id: 'department', label: 'My Department', icon: Users, visible: isCoordinator, count: coordStaffGaps.length },
      { id: 'supervisor', label: 'My Supervised Sites', icon: MapPin, visible: isSupervisor, count: supPendingApprovals.length },
      { id: 'assignments', label: 'My Assignments', icon: CalendarDays, visible: true, count: mySchedules.filter(s => s.status !== 'Completed').length },
    ];
  }, [currentUser, coordStaffGaps, supPendingApprovals, mySchedules]);

  const defaultTab = useMemo(() => {
    if (currentUser.roles.includes('Admin')) return 'institution';
    if (currentUser.roles.includes('Coordinator')) return 'department';
    if (currentUser.roles.includes('Supervisor')) return 'supervisor';
    return 'assignments';
  }, [currentUser]);

  const [activeTab, setActiveTab] = useState<string>(defaultTab);

  // Helper formatting for asset statuses breakdown
  const renderAssetBreakdownSummary = (statuses: Record<string, number> | null | undefined) => {
    if (!statuses || Object.keys(statuses).length === 0) return <span className="text-slate-400 font-medium">No details</span>;
    return (
      <div className="flex flex-wrap gap-1.5 justify-center">
        {Object.entries(statuses).map(([key, val]) => {
          if (!val) return null;
          let badgeColor = "bg-slate-50 text-slate-600 border-slate-100";
          if (key === 'In Use') badgeColor = "bg-emerald-50 text-emerald-700 border-emerald-100";
          if (key === 'Broken') badgeColor = "bg-rose-50 text-rose-700 border-rose-100";
          if (key === 'Under Maintenance') badgeColor = "bg-amber-50 text-amber-700 border-amber-100";
          if (key === 'Borrowed') badgeColor = "bg-blue-50 text-blue-700 border-blue-100";
          if (key === 'Missing') badgeColor = "bg-red-50 text-red-700 border-red-100";
          
          return (
            <span key={key} className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[9px] font-extrabold border ${badgeColor}`}>
              {key[0]}:{val}
            </span>
          );
        })}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* ── Tabs Navigation ── */}
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

      {/* ───────────────────────────────────────────────────────────────────
          ── TAB CONTENT: INSTITUTION OVERVIEW ─────────────────────────────
          ─────────────────────────────────────────────────────────────────── */}
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

      {/* ───────────────────────────────────────────────────────────────────
          ── TAB CONTENT: COORDINATOR VIEW (DEPT SCOPED) ───────────────────
          ─────────────────────────────────────────────────────────────────── */}
      {activeTab === 'department' && (
        <div className="space-y-6">
          {!coordDeptId ? (
            <div className="rounded-3xl border border-dashed border-slate-300 p-8 text-center bg-slate-50">
              <ShieldAlert className="w-12 h-12 text-slate-400 mx-auto mb-3" />
              <h3 className="text-lg font-bold text-slate-800 mb-1">No Department Scope</h3>
              <p className="text-sm text-slate-500 max-w-md mx-auto">
                You are currently not assigned to any department. Please contact the system administrator to set your department assignment.
              </p>
            </div>
          ) : (
            <>
              {/* Department Info Header */}
              <div className="bg-slate-900 text-white rounded-3xl p-6 relative overflow-hidden shadow-xl">
                <div className="absolute top-0 right-0 p-8 opacity-10">
                  <Users className="w-32 h-32 text-white" />
                </div>
                <div className="relative z-10">
                  <span className="text-[10px] font-black text-indigo-300 uppercase tracking-widest bg-indigo-950/60 px-2.5 py-1 rounded-md">
                    Coordinator Workspace
                  </span>
                  <h2 className="text-2xl font-black mt-2 tracking-tight">
                    {coordDept?.name || 'Loading Department'} ({coordDept?.abbr || 'N/A'})
                  </h2>
                  <p className="text-xs text-slate-300 mt-1 max-w-xl">
                    Scoped insights and staffing matrices for {coordLocations.length} active locations and {coordStats.totalAssets.toLocaleString()} department assets.
                  </p>
                  
                  {/* Department progress line */}
                  <div className="mt-6">
                    <div className="flex justify-between items-center text-xs mb-1">
                      <span className="font-bold text-slate-400">Department Audit Progress</span>
                      <span className="font-black text-white">{coordStats.progress}% Completed</span>
                    </div>
                    <div className="w-full bg-slate-800 rounded-full h-3">
                      <div 
                        className="bg-indigo-500 h-3 rounded-full transition-all duration-500" 
                        style={{ width: `${coordStats.progress}%` }}
                      ></div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Coordinator Stat Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <StatCard icon={MapPin} label="Dept Locations" value={coordStats.totalLocs} color="text-slate-800" />
                <StatCard icon={Package} label="Dept Assets" value={coordStats.totalAssets.toLocaleString()} color="text-blue-600" />
                <StatCard icon={Users} label="Registered Officers" value={coordOfficers.length} color="text-indigo-600" />
              </div>

              {/* Status Breakdown Bar */}
              <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-sm">
                <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Audit Schedules Status</h4>
                <div className="grid grid-cols-3 gap-4">
                  <div className="p-3 bg-slate-50 border border-slate-100 rounded-2xl flex items-center justify-between">
                    <div>
                      <p className="text-[9px] font-bold text-slate-400 uppercase">Pending Staffing</p>
                      <p className="text-lg font-black text-slate-800">{coordStats.pending}</p>
                    </div>
                    <span className="w-2.5 h-2.5 rounded-full bg-slate-400"></span>
                  </div>
                  <div className="p-3 bg-amber-50/50 border border-amber-100 rounded-2xl flex items-center justify-between">
                    <div>
                      <p className="text-[9px] font-bold text-amber-600 uppercase">In Progress</p>
                      <p className="text-lg font-black text-amber-700">{coordStats.inProgress}</p>
                    </div>
                    <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse"></span>
                  </div>
                  <div className="p-3 bg-emerald-50/50 border border-emerald-100 rounded-2xl flex items-center justify-between">
                    <div>
                      <p className="text-[9px] font-bold text-emerald-600 uppercase">Completed</p>
                      <p className="text-lg font-black text-emerald-700">{coordStats.completed}</p>
                    </div>
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
                  </div>
                </div>
              </div>

              {/* Staffing/Capacity Gaps Warnings */}
              {coordStaffGaps.length > 0 && (
                <div className="bg-amber-50/60 border border-amber-100 rounded-3xl p-6">
                  <div className="flex gap-4">
                    <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center text-amber-600 shrink-0">
                      <AlertTriangle className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="text-sm font-black text-amber-800 uppercase tracking-wider mb-2">Department Capacity Deficits</h4>
                      <ul className="space-y-1.5 text-xs text-amber-700 font-medium">
                        {coordStaffGaps.map((gap, i) => (
                          <li key={i} className="flex items-center gap-2">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                            {gap}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
              )}

              {/* Department Officers Roster */}
              <div className="bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-sm">
                <div className="p-5 border-b border-slate-100 flex justify-between items-center">
                  <h3 className="text-sm font-black text-slate-800 flex items-center gap-2">
                    <Users className="w-4 h-4 text-indigo-500" />
                    Registered QAIs & Staff Workload
                  </h3>
                  <span className="text-[10px] text-slate-400 font-bold">{coordOfficers.length} total staff</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 text-[10px] font-black text-slate-400 uppercase">
                      <tr>
                        <th className="px-5 py-3">Officer Name</th>
                        <th className="px-4 py-3">Designation</th>
                        <th className="px-4 py-3 text-center">Certification Status</th>
                        <th className="px-4 py-3 text-center">Assigned Audits</th>
                        <th className="px-4 py-3 text-center">Total Assigned Assets</th>
                        <th className="px-5 py-3 text-right">Workload Risk</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {coordOfficers.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="px-5 py-6 text-center text-slate-400">
                            No registered staff in this department.
                          </td>
                        </tr>
                      ) : (
                        coordOfficers.map(officer => (
                          <tr key={officer.id} className="hover:bg-slate-50/50 transition-colors">
                            <td className="px-5 py-3">
                              <div className="font-bold text-slate-800">{officer.name}</div>
                              <div className="text-[10px] text-slate-400">{officer.email}</div>
                            </td>
                            <td className="px-4 py-3 font-medium text-slate-500">
                              {officer.designation || 'Staff'}
                            </td>
                            <td className="px-4 py-3 text-center">
                              {officer.isCertified ? (
                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-emerald-50 text-emerald-700 rounded-full text-[10px] font-extrabold border border-emerald-100">
                                  <Check className="w-2.5 h-2.5" /> Certified
                                </span>
                              ) : officer.certificationExpiry ? (
                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-rose-50 text-rose-700 rounded-full text-[10px] font-extrabold border border-rose-100">
                                  Expired ({officer.certificationExpiry})
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-slate-100 text-slate-500 rounded-full text-[10px] font-extrabold border border-slate-200">
                                  Not Certified
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-center font-bold text-slate-800">
                              {officer.assignedSchedules}
                            </td>
                            <td className="px-4 py-3 text-center font-bold text-slate-800">
                              {officer.assignedAssets.toLocaleString()}
                            </td>
                            <td className="px-5 py-3 text-right">
                              {officer.isOverloaded ? (
                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-red-50 text-red-600 rounded-lg text-[10px] font-bold border border-red-100">
                                  <ShieldAlert className="w-3 h-3" /> Overloaded
                                </span>
                              ) : officer.assignedAssets > 0 ? (
                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-emerald-50 text-emerald-600 rounded-lg text-[10px] font-bold border border-emerald-100">
                                  <UserCheck className="w-3 h-3" /> Optimal
                                </span>
                              ) : (
                                <span className="text-[10px] font-medium text-slate-400">No workload</span>
                              )}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* ───────────────────────────────────────────────────────────────────
          ── TAB CONTENT: SUPERVISOR VIEW (SUPERVISED LOCS SCOPED) ──────────
          ─────────────────────────────────────────────────────────────────── */}
      {activeTab === 'supervisor' && (
        <div className="space-y-6">
          {supLocations.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-slate-300 p-8 text-center bg-slate-50">
              <MapPin className="w-12 h-12 text-slate-400 mx-auto mb-3" />
              <h3 className="text-lg font-bold text-slate-800 mb-1">No Supervised Locations</h3>
              <p className="text-sm text-slate-500 max-w-md mx-auto">
                You are currently not listed as the supervisor for any active location assets. Check with your Coordinator to assign supervisor roles on department locations.
              </p>
            </div>
          ) : (
            <>
              {/* Supervisor Info Header */}
              <div className="bg-slate-900 text-white rounded-3xl p-6 relative overflow-hidden shadow-xl">
                <div className="absolute top-0 right-0 p-8 opacity-10">
                  <MapPin className="w-32 h-32 text-white" />
                </div>
                <div className="relative z-10">
                  <span className="text-[10px] font-black text-indigo-300 uppercase tracking-widest bg-indigo-950/60 px-2.5 py-1 rounded-md">
                    Supervisor Workspace
                  </span>
                  <h2 className="text-2xl font-black mt-2 tracking-tight">
                    Supervised Site Management
                  </h2>
                  <p className="text-xs text-slate-300 mt-1 max-w-xl">
                    Verifying completed audits, managing assets and reporting pipelines for your {supLocations.length} supervised locations.
                  </p>
                </div>
              </div>

              {/* Supervisor Stat Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <StatCard icon={MapPin} label="Supervised Sites" value={supStats.totalLocs} color="text-slate-800" />
                <StatCard icon={Package} label="Supervised Assets" value={supStats.totalAssets.toLocaleString()} color="text-blue-600" />
                <StatCard icon={CheckCircle2} label="Approved & Completed" value={supStats.completed} color="text-emerald-600" />
              </div>

              {/* Approval Pipeline Widget */}
              <div className="bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-sm">
                <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50/30">
                  <h3 className="text-sm font-black text-slate-800 flex items-center gap-2">
                    <FileText className="w-4 h-4 text-emerald-500" />
                    Completed Audits Approval Pipeline
                  </h3>
                  <span className="inline-flex px-2 py-0.5 bg-amber-50 text-amber-700 rounded-lg text-[9px] font-black border border-amber-100">
                    Awaiting HOD Lock: {supPendingApprovals.filter(s => !s.isLocked).length}
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 text-[10px] font-black text-slate-400 uppercase">
                      <tr>
                        <th className="px-5 py-3">Location Name</th>
                        <th className="px-4 py-3">Inspection Date</th>
                        <th className="px-4 py-3 text-center">Inspectors</th>
                        <th className="px-4 py-3 text-center">Total Assets</th>
                        <th className="px-4 py-3 text-center">Verified Assets</th>
                        <th className="px-4 py-3 text-center">Asset Breakdown</th>
                        <th className="px-4 py-3 text-center">Report Upload</th>
                        <th className="px-5 py-3 text-right">Lock Status & Approval</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {supPendingApprovals.length === 0 ? (
                        <tr>
                          <td colSpan={8} className="px-5 py-8 text-center text-slate-400 font-medium">
                            No completed inspections at your supervised locations yet.
                          </td>
                        </tr>
                      ) : (
                        supPendingApprovals.map(s => {
                          const hasReport = !!s.reportPath;
                          const isLocked = s.isLocked === true;
                          return (
                            <tr key={s.id} className="hover:bg-slate-50/50 transition-colors">
                              <td className="px-5 py-3">
                                <div className="font-bold text-slate-800">{s.locationName}</div>
                                <div className="text-[10px] text-slate-400">Dept: {s.deptAbbr}</div>
                              </td>
                              <td className="px-4 py-3 font-medium text-slate-600">
                                {s.date ? new Date(s.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
                              </td>
                              <td className="px-4 py-3 text-center">
                                <div className="text-slate-700 font-bold">{s.auditor1Name}</div>
                                <div className="text-[10px] text-slate-400">{s.auditor2Name}</div>
                              </td>
                              <td className="px-4 py-3 text-center font-bold text-slate-800">
                                {s.totalAssets}
                              </td>
                              <td className="px-4 py-3 text-center font-bold text-slate-800">
                                {s.verifiedAssetCount ?? '—'}
                              </td>
                              <td className="px-4 py-3 text-center">
                                {renderAssetBreakdownSummary(s.assetStatuses)}
                              </td>
                              <td className="px-4 py-3 text-center">
                                {hasReport ? (
                                  <button
                                    onClick={() => window.open(s.reportPath!, '_blank')}
                                    className="inline-flex items-center gap-1.5 px-3 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg text-[10px] font-black transition-colors"
                                    title="Open KEW-PA 11 Report"
                                  >
                                    <FileText className="w-3 h-3" /> Report.pdf <ExternalLink className="w-2.5 h-2.5" />
                                  </button>
                                ) : (
                                  <span className="text-[10px] text-slate-400 font-semibold italic">No report uploaded</span>
                                )}
                              </td>
                              <td className="px-5 py-3 text-right">
                                <div className="flex justify-end items-center gap-2">
                                  {isLocked ? (
                                    <>
                                      <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-100 rounded-lg text-[10px] font-black">
                                        <Lock className="w-2.5 h-2.5" /> Approved
                                      </span>
                                      {onToggleLock && (
                                        <button
                                          onClick={() => onToggleLock(s.id)}
                                          className="p-1 hover:bg-slate-100 text-slate-400 hover:text-slate-600 rounded-lg transition-colors"
                                          title="Unlock schedule"
                                        >
                                          <Unlock className="w-3.5 h-3.5" />
                                        </button>
                                      )}
                                    </>
                                  ) : (
                                    <>
                                      <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-50 text-amber-700 border border-amber-100 rounded-lg text-[10px] font-black animate-pulse">
                                        <Clock className="w-2.5 h-2.5" /> Review
                                      </span>
                                      {onToggleLock && (
                                        <button
                                          onClick={() => onToggleLock(s.id)}
                                          className="inline-flex items-center gap-1 px-2.5 py-1 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-[10px] font-bold shadow-sm transition-colors"
                                          title="Lock & approve inspection"
                                        >
                                          Approve
                                        </button>
                                      )}
                                    </>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* ───────────────────────────────────────────────────────────────────
          ── TAB CONTENT: INSPECTOR VIEW (MY ASSIGNMENTS) ──────────────────
          ─────────────────────────────────────────────────────────────────── */}
      {activeTab === 'assignments' && (
        <div className="space-y-6">
          {/* Certification Card */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 bg-slate-900 text-white rounded-3xl p-6 relative overflow-hidden shadow-xl">
              <div className="absolute top-0 right-0 p-8 opacity-10">
                <CalendarDays className="w-32 h-32 text-white" />
              </div>
              <div className="relative z-10 flex flex-col justify-between h-full min-h-36">
                <div>
                  <span className="text-[10px] font-black text-indigo-300 uppercase tracking-widest bg-indigo-950/60 px-2.5 py-1 rounded-md">
                    Auditor Console
                  </span>
                  <h2 className="text-2xl font-black mt-2 tracking-tight">
                    My Inspection Tasks
                  </h2>
                  <p className="text-xs text-slate-300 mt-1">
                    Manage your assigned inspections, report progress, and launch mobile audit environments directly.
                  </p>
                </div>
                
                <div className="flex gap-4 mt-6">
                  <div className="bg-slate-800/80 px-4 py-2.5 rounded-2xl border border-slate-700/50">
                    <span className="text-[9px] font-black text-slate-400 uppercase block tracking-wider">Total Audits</span>
                    <span className="text-xl font-black text-white">{inspectorStats.totalAssigned}</span>
                  </div>
                  <div className="bg-slate-800/80 px-4 py-2.5 rounded-2xl border border-slate-700/50">
                    <span className="text-[9px] font-black text-slate-400 uppercase block tracking-wider">Total Assets</span>
                    <span className="text-xl font-black text-white">{inspectorStats.totalAssets.toLocaleString()}</span>
                  </div>
                  <div className="bg-emerald-950/40 px-4 py-2.5 rounded-2xl border border-emerald-900/40">
                    <span className="text-[9px] font-black text-emerald-400 uppercase block tracking-wider">Completed</span>
                    <span className="text-xl font-black text-emerald-400">{inspectorStats.completed}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Certification Status widget */}
            <div className={`rounded-3xl p-6 flex flex-col justify-between border ${
              isQAIActive 
                ? 'bg-emerald-50 border-emerald-200 text-emerald-950'
                : currentUser.certificationExpiry 
                  ? 'bg-red-50 border-red-200 text-red-950'
                  : 'bg-slate-50 border-slate-200 text-slate-700'
            }`}>
              <div>
                <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2 flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-indigo-500" /> Certification Status
                </h4>
                {isQAIActive ? (
                  <>
                    <h3 className="text-base font-black text-emerald-900 flex items-center gap-1">
                      Active QAI Status
                    </h3>
                    <p className="text-xs text-emerald-700 font-semibold mt-1">
                      Verified Quality Asset Inspector until <span className="font-extrabold">{currentUser.certificationExpiry}</span>.
                    </p>
                  </>
                ) : currentUser.certificationExpiry ? (
                  <>
                    <h3 className="text-base font-black text-red-900 flex items-center gap-1">
                      Certification Expired
                    </h3>
                    <p className="text-xs text-red-700 font-semibold mt-1">
                      Your inspector certificate expired on <span className="font-extrabold">{currentUser.certificationExpiry}</span>. Contact HOD to renew.
                    </p>
                  </>
                ) : (
                  <>
                    <h3 className="text-base font-black text-slate-800 flex items-center gap-1">
                      No Inspector Certificate
                    </h3>
                    <p className="text-xs text-slate-500 font-semibold mt-1">
                      You do not have a registered auditor certification. You can still perform open audits when assigned.
                    </p>
                  </>
                )}
              </div>

              <div className="mt-4 pt-4 border-t border-slate-200/50">
                <button
                  onClick={() => window.open('/mobile.html', '_blank')}
                  className="w-full flex items-center justify-center gap-2 py-3 bg-slate-900 hover:bg-slate-800 text-white rounded-2xl text-xs font-black uppercase tracking-wider transition-all duration-200 shadow-md hover:shadow-lg active:scale-98"
                >
                  Launch Mobile Layout <ExternalLink className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>

          {/* Assigned Schedules Workload List */}
          <div className="space-y-4">
            <h3 className="text-sm font-black text-slate-900 flex items-center gap-2">
              <Clock className="w-4 h-4 text-indigo-500" />
              Inspection Task Pipeline ({mySchedules.length})
            </h3>

            {mySchedules.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-slate-300 p-8 text-center bg-slate-50">
                <CalendarDays className="w-12 h-12 text-slate-400 mx-auto mb-3" />
                <h4 className="text-base font-bold text-slate-800 mb-1">No Active Inspections</h4>
                <p className="text-xs text-slate-500 max-w-sm mx-auto">
                  You are not currently assigned to any pending or in-progress inspections. Use the Schedules page to find audits or request self-assignment.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {mySchedules.map(s => {
                  const isPending = s.status === 'Pending';
                  const isInProgress = s.status === 'In Progress';
                  const isCompleted = s.status === 'Completed';
                  const isLocked = s.isLocked === true;
                  
                  return (
                    <div 
                      key={s.id} 
                      className={`rounded-3xl border p-5 flex flex-col justify-between transition-all duration-200 bg-white ${
                        isCompleted 
                          ? 'border-emerald-100 hover:shadow-md' 
                          : isInProgress 
                            ? 'border-amber-200 shadow-sm shadow-amber-50 hover:shadow-md'
                            : 'border-slate-200 hover:shadow-md'
                      }`}
                    >
                      <div>
                        {/* Title bar */}
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider block">
                              Location
                            </span>
                            <h4 className="text-base font-bold text-slate-800 leading-snug">
                              {s.locationName}
                            </h4>
                          </div>
                          
                          {/* Status Badge */}
                          {isCompleted ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-100 rounded-full text-[9px] font-black">
                              Completed
                            </span>
                          ) : isInProgress ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-amber-50 text-amber-700 border border-amber-100 rounded-full text-[9px] font-black animate-pulse">
                              In Progress
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-slate-100 text-slate-600 border border-slate-200 rounded-full text-[9px] font-black">
                              Pending
                            </span>
                          )}
                        </div>

                        {/* Metadata row */}
                        <div className="grid grid-cols-2 gap-4 my-4 pt-3 border-t border-slate-100">
                          <div>
                            <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider block">Target Date</span>
                            <span className="text-xs font-semibold text-slate-700">
                              {s.date ? new Date(s.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : 'Unscheduled'}
                            </span>
                          </div>
                          <div>
                            <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider block">Asset Volume</span>
                            <span className="text-xs font-semibold text-slate-700">
                              {s.totalAssets.toLocaleString()} Assets
                            </span>
                          </div>
                        </div>

                        <div className="mb-4">
                          <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider block">Audit Partner</span>
                          <span className="text-xs font-semibold text-slate-700">
                            {s.partnerName}
                          </span>
                        </div>
                      </div>

                      {/* Actions footer */}
                      <div className="mt-4 pt-4 border-t border-slate-100 flex items-center justify-between gap-3">
                        <div>
                          {isCompleted && s.reportPath && (
                            <button
                              onClick={() => window.open(s.reportPath!, '_blank')}
                              className="inline-flex items-center gap-1 text-[10px] font-black text-indigo-600 hover:text-indigo-800 uppercase"
                            >
                              <FileText className="w-3.5 h-3.5" /> View Report
                            </button>
                          )}
                        </div>
                        
                        <div className="flex gap-2">
                          {isPending && onUpdateAudit && (
                            <button
                              onClick={async () => {
                                try {
                                  await onUpdateAudit(s.id, { status: 'In Progress' });
                                } catch (e) {
                                  console.error("Failed to start inspection:", e);
                                }
                              }}
                              className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-[10px] font-black uppercase tracking-wider shadow-sm transition-all"
                            >
                              Start Audit
                            </button>
                          )}
                          
                          {isInProgress && (
                            <div className="flex items-center gap-2">
                              {onToggleStatus && (
                                <button
                                  onClick={() => onToggleStatus(s.id)}
                                  className="px-3 py-1.5 border border-slate-300 hover:border-slate-400 text-slate-700 rounded-xl text-[9px] font-black uppercase transition-colors"
                                  title="Mark inspection as complete"
                                >
                                  Mark Done
                                </button>
                              )}
                              <button
                                onClick={() => window.open('/mobile.html', '_blank')}
                                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-[10px] font-black uppercase tracking-wider shadow-sm flex items-center gap-1.5"
                              >
                                Launch Mobile <ExternalLink className="w-3 h-3" />
                              </button>
                            </div>
                          )}
                          
                          {isCompleted && (
                            <span className="text-[10px] font-extrabold text-slate-400 flex items-center gap-1">
                              {isLocked ? <Lock className="w-3 h-3 text-emerald-500" /> : <Unlock className="w-3 h-3 text-slate-300" />}
                              {isLocked ? 'Approved & Locked' : 'Audit Finished'}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
