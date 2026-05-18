
import React, { useState, useRef, useMemo, useEffect } from 'react';
import { AuditSchedule, User, UserRole, Department, Location, CrossAuditPermission, AuditPhase, Building as BuildingType } from '@shared/types';
import { useRBAC } from '../contexts/RBACContext';
import { AuditReportModal } from './AuditReportModal';
import { AuditUploadModal } from './AuditUploadModal';
import {
  ShieldOff,
  Loader2,
  X,
  ChevronDown,
  Building,
  Layers,
  UserCheck,
  Phone,
  Lock,
  Unlock,
  AlertTriangle,
  RotateCcw,
  FileText,
  Search,
  Filter,
  Calendar,
  Zap,
  Package,
  FileSpreadsheet,
  ExternalLink
} from 'lucide-react';
import { PageHeader } from './PageHeader';
import { AuditorAssignmentSlot } from './AuditorAssignmentSlot';
import { PrintButton } from './PrintButton';
import { printInspectionSchedule, exportInspectionSchedule } from '../lib/printUtils';
import { ConfirmationModal } from './ConfirmationModal';

interface AuditTableProps {
  schedules: AuditSchedule[];
  users: User[];
  currentUserName: string;
  userRoles: UserRole[];
  departments: string[];
  selectedDept: string;
  onDeptChange: (dept: string) => void;
  selectedStatus: string;
  onStatusChange: (status: string) => void;
  selectedPhaseId: string;
  onPhaseChange: (id: string) => void;
  onAssign: (id: string, slot: 1 | 2, userId: string) => void;
  onUnassign: (id: string, slot: 1 | 2) => void;
  onUpdateDate: (id: string, newDate: string) => void;
  onUpdateAudit: (id: string, updates: Partial<AuditSchedule>) => void;
  onToggleStatus: (id: string) => void;
  onToggleLock: (id: string) => void;
  allDepartments: Department[];
  allLocations: Location[];
  crossAuditPermissions: CrossAuditPermission[];
  auditPhases: AuditPhase[];
  maxAssetsPerDay: number;
  buildings?: BuildingType[];
  assignmentMode?: 'cross-audit' | 'open-audit';
}

export const AuditTable: React.FC<AuditTableProps> = ({ 
  schedules, users, currentUserName, userRoles, departments, selectedDept, onDeptChange, selectedStatus, onStatusChange,
  selectedPhaseId, onPhaseChange, onAssign, onUnassign, onUpdateDate, onUpdateAudit, onToggleStatus, onToggleLock,
  allDepartments, allLocations, crossAuditPermissions, auditPhases,
  maxAssetsPerDay,
  buildings = [],
  assignmentMode = 'cross-audit'
}) => {
  const { hasPermission, rbacMatrix } = useRBAC();
  const [reportAudit, setReportAudit] = useState<AuditSchedule | null>(null);
  const [uploadAudit, setUploadAudit] = useState<AuditSchedule | null>(null);
  const [selectedBlock, setSelectedBlock] = useState('All');
  const [selectedLevel, setSelectedLevel] = useState('All');

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Role Checks
  const isAdmin = userRoles.includes('Admin');
  const isCoordinator = userRoles.includes('Coordinator');
  const isSupervisor = userRoles.includes('Supervisor');
  const isAuditor = userRoles.includes('Auditor');
  const isStaff = userRoles.includes('Staff');

  // New Logic: Any of these roles *can* audit if they are certified.
  const hasFieldRole = isAdmin || isCoordinator || isSupervisor || isAuditor || isStaff;

  // Find Current User Data for Certification Check
  const currentUser = users.find(u => u.name === currentUserName);
  const currentUserDept = allDepartments.find(d => d.id === currentUser?.departmentId);
  const currentUserDeptName = currentUserDept?.name || "N/A";
  
  const isCertified = React.useMemo(() => {
    if (!currentUser?.certificationExpiry) return false;
    const expiry = new Date(currentUser.certificationExpiry);
    const now = new Date();
    return expiry > now;
  }, [currentUser]);

  // Combined concept: Eligible Field Auditor
  const canSelfAssignSelf = hasFieldRole && isCertified;

  const hasPerm = (perm: string) => hasPermission(perm, userRoles);

  const canEditDates = hasPerm('edit:audit:date');
  const canSelfAssignPerm = hasPerm('edit:audit:assign');
  const canAssignOthers = hasPerm('edit:audit:assign:others');
  const canAutoAssign = hasPerm('edit:audit:auto_assign');
  const canViewAllSchedule = hasPerm('view:schedule:all');
  const canViewOwnSchedule = hasPerm('view:schedule:own');
  const canViewMatrixSchedule = hasPerm('view:schedule:matrix');

  const hasPhases = auditPhases?.length > 0;
  const todayStr = new Date().toISOString().split('T')[0];

  // Reset child filters when parent filter changes
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

  const availableLocations = useMemo(() => {
    if (selectedDept === 'All') return allLocations;
    const dept = allDepartments.find(d => d.name === selectedDept);
    if (!dept) return [];
    return allLocations.filter(l => l.departmentId === dept.id);
  }, [selectedDept, allLocations, allDepartments]);

  const uniqueBlocks = useMemo(() => {
    const blocks = new Set(availableLocations.map(l => getBuildingAbbr(l.buildingId, l.building)).filter(Boolean));
    return ['All', ...Array.from(blocks)].sort();
  }, [availableLocations, buildings]);

  const uniqueLevels = useMemo(() => {
    let filtered = availableLocations;
    if (selectedBlock !== 'All') {
      filtered = filtered.filter(l => getBuildingAbbr(l.buildingId, l.building) === selectedBlock);
    }
    const levels = new Set(filtered.map(l => l.level).filter(Boolean));
    return ['All', ...Array.from(levels)].sort();
  }, [availableLocations, selectedBlock]);

  const getEntityName = (deptId: string) => {
    const dept = allDepartments.find(d => d.id === deptId);
    return dept?.auditGroupId || deptId;
  };

  const getPhaseName = (phaseId: string) => {
    return auditPhases.find(p => p.id === phaseId)?.name || 'Unknown Phase';
  };

  const canAuditDepartment = (targetDeptId: string) => {
    const myEntityId = getEntityName(currentUser?.departmentId || '');
    const targetEntityId = getEntityName(targetDeptId);

    // 1. Prevent self-audit at the entity level (Department or Group)
    if (myEntityId === targetEntityId && !isAdmin) return false;

    // 2. Check if a pairing exists in crossAuditPermissions (only if in cross-audit mode)
    if (assignmentMode === 'cross-audit') {
      const hasPermission = crossAuditPermissions.some(p => 
        p.auditorDeptId === myEntityId && 
        p.targetDeptId === targetEntityId && 
        p.isActive
      );
      return isAdmin || hasPermission;
    }

    // 3. In Open Audit mode, any certified officer can audit any department (except COI)
    return true;
  };

  const getUserContact = (userId: string) => {
    return users.find(u => u.id === userId)?.contactNumber;
  };

  const getSiteSupervisorContact = (locationName: string) => {
    const loc = allLocations.find(l => l.name === locationName);
    return loc?.contact || '';
  };

  const checkDateConflict = (date: string, auditId: string) => {
    return schedules.some(s => s.id !== auditId && s.date === date && (s.auditor1 === currentUserName || s.auditor2 === currentUserName));
  };

  const isDateInValidPhase = (dateStr: string, phaseId: string): boolean => {
    if (!dateStr) return true; 
    const phase = auditPhases.find(p => p.id === phaseId);
    if (!phase) return false;
    
    const d = new Date(dateStr);
    const start = new Date(phase.startDate);
    const end = new Date(phase.endDate);
    start.setHours(0,0,0,0);
    end.setHours(23,59,59,999);
    return d >= start && d <= end;
  };

  const handleDateChange = (id: string, newDate: string, phaseId: string) => {
    if (!hasPhases) {
        alert("Scheduling Disabled: An audit phase must be configured in System Settings before dates can be selected.");
        return;
    }
    if (newDate) {
        // Find if the new date matches ANY active phase
        const matchingPhase = auditPhases.find(p => {
          const start = new Date(p.startDate);
          const end = new Date(p.endDate);
          start.setHours(0, 0, 0, 0);
          end.setHours(23, 59, 59, 999);
          const d = new Date(newDate);
          return d >= start && d <= end;
        });

        if (!matchingPhase) {
          // If no matching phase found, show alert with available phase ranges
          const ranges = auditPhases.map(p => `${p.name} (${p.startDate} to ${p.endDate})`).join('\n');
          alert(`ACCESS DENIED: The selected date must fall inside one of the configured audit phases:\n\n${ranges}`);
          return;
        }
    }
    onUpdateDate(id, newDate);
  };

  const handleSelfAssign = (auditId: string, slot: 1 | 2, date: string, phaseId: string, manualUserId?: string) => {
    const audit = schedules.find(s => s.id === auditId);
    if (!audit) return;

    const assignUserId = manualUserId || currentUser?.id;
    if (!assignUserId) return;
    
    const assignUser = users.find(u => u.id === assignUserId);
    const isSelf = assignUserId === currentUser?.id;

    if (isSelf && !hasFieldRole) {
      alert("ACTION BLOCKED: Your current role does not permit performing audits.");
      return;
    }

    const certExpiry = assignUser?.certificationExpiry;
    const isUserCertified = certExpiry && new Date(certExpiry) > new Date();

    if (!isUserCertified) {
      alert(`ACTION BLOCKED: Certification Required. ${isSelf ? 'Your' : 'The selected officer\'s'} certificate is expired or invalid.`);
      return;
    }
    if (!hasPhases) {
      alert("Self-assignment is locked until an audit phase is configured.");
      return;
    }



    // Explicit Pairing Check (Defense in Depth)
    const officerDeptId = assignUser?.departmentId || '';
    const myEntityId = getEntityName(officerDeptId);
    const targetEntityId = getEntityName(audit.departmentId);

    if (myEntityId === targetEntityId && !isAdmin) {
      alert(`PAIRING RESTRICTION: ${isSelf ? 'You' : 'The selected officer'} cannot inspect ${isSelf ? 'your' : 'their'} own department.`);
      return;
    }

    // 2. ABSOLUTE LOCK: Supervisor cannot be the Auditor for the same location
    if (assignUserId === audit.supervisorId) {
      alert(`CONFLICT OF INTEREST: ${isSelf ? 'You are' : 'The selected officer is'} the designated Site Supervisor for this location and cannot act as its inspector.`);
      return;
    }

    if (assignmentMode === 'cross-audit') {
      const hasCrossPerm = isAdmin || crossAuditPermissions.some(p => 
        p.auditorDeptId === myEntityId && 
        p.targetDeptId === targetEntityId && 
        p.isActive
      );

      if (!hasCrossPerm) {
        alert(`PAIRING RESTRICTION: This asset location is outside the assigned inspection matrix for ${isSelf ? 'you' : 'the selected officer'}.`);
        return;
      }
    }

    if (!date) {
      alert("Please select a valid audit date before assigning yourself.");
      return;
    }
    if (!isDateInValidPhase(date, phaseId)) {
        alert("The current date set for this audit is not within its valid phase. Please update the date first.");
        return;
    }
    const hasConflict = schedules.some(s => s.id !== auditId && s.date === date && (s.auditor1Id === assignUserId || s.auditor2Id === assignUserId));
    if (hasConflict) {
      alert(`Schedule Conflict: ${isSelf ? 'You are' : 'The selected officer is'} already assigned to another audit on this date.`);
      return;
    }
    onAssign(auditId, slot, assignUserId);
  };

  const handleAutoAssign = async () => {
    if (!canAutoAssign) return;
    
    const pendingSchedules = schedules.filter(s => s.status === 'Pending' && s.date && (!s.auditor1Id || !s.auditor2Id));
    if (pendingSchedules.length === 0) {
      alert("No pending inspections with dates need assignment.");
      return;
    }

    const eligibleOfficers = users.filter(u => {
      // Include any user that is certified, regardless of role (Admin decides via RBAC)
      return u.certificationExpiry && new Date(u.certificationExpiry) > new Date();
    });

    if (eligibleOfficers.length === 0) {
      alert("No certified inspecting officers available for auto-assignment.");
      return;
    }

    let assignmentCount = 0;
    
    for (const audit of pendingSchedules) {
      const targetDeptId = audit.departmentId;
      const targetLoc = allLocations.find(l => l.id === audit.locationId);
      const targetAssets = targetLoc?.totalAssets || 0;

      for (const slot of [1, 2] as const) {
        const slotKey = slot === 1 ? 'auditor1Id' : 'auditor2Id';
        if (audit[slotKey]) continue; 

        // Find best candidate for this slot
        const candidates = eligibleOfficers.filter(officer => {
          const myEntityId = getEntityName(officer.departmentId || '');
          const targetEntityId = getEntityName(targetDeptId);
          if (myEntityId === targetEntityId) return false;

          if (assignmentMode === 'cross-audit') {
            const hasCrossPerm = isAdmin || crossAuditPermissions.some(p => 
              p.auditorDeptId === myEntityId && 
              p.targetDeptId === targetEntityId && 
              p.isActive
            );
            if (!hasCrossPerm) return false;
          }

          // 3. ABSOLUTE LOCK: Supervisor cannot be the Auditor for the same location
          if (officer.id === audit.supervisorId) return false;

          const auditsOnDate = schedules.filter(s => s.date === audit.date && (s.auditor1Id === officer.id || s.auditor2Id === officer.id));
          const totalAssetsOnDate = auditsOnDate.reduce((sum, s) => {
            const l = allLocations.find(loc => loc.id === s.locationId);
            return sum + (l?.totalAssets || 0);
          }, 0);
          
          if (totalAssetsOnDate + targetAssets > maxAssetsPerDay) return false;
          if (audit.auditor1Id === officer.id || audit.auditor2Id === officer.id) return false;

          return true;
        });

        if (candidates.length > 0) {
          const sorted = candidates.sort((a, b) => {
             const getLoad = (officerId: string) => schedules
               .filter(s => s.date === audit.date && (s.auditor1Id === officerId || s.auditor2Id === officerId))
               .reduce((sum, s) => sum + (allLocations.find(loc => loc.id === s.locationId)?.totalAssets || 0), 0);
             return getLoad(a.id) - getLoad(b.id);
          });
          
          const chosen = sorted[0];
          onAssign(audit.id, slot, chosen.id);
          assignmentCount++;
        }
      }
    }

    if (assignmentCount > 0) {
      alert(`Auto-assignment complete. Successfully assigned ${assignmentCount} slots.`);
    } else {
      alert("Auto-assignment could not find eligible officers for the remaining slots based on the audit matrix and daily limits.");
    }
  };


  const getStatusBadgeStyles = (status: string) => {
    switch(status) {
      case 'Completed': return 'bg-emerald-50 text-emerald-600 border-emerald-200 hover:bg-emerald-100 hover:border-emerald-300 cursor-pointer';
      case 'In Progress': return 'bg-blue-50 text-blue-600 border-blue-200 hover:bg-blue-100 hover:border-blue-300 cursor-pointer';
      default: return 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed';
    }
  };

  // Filter based on selected filters AND RBAC Scope
  const displaySchedules = useMemo(() => {
    return schedules.filter(s => {
      // 1. RBAC Scope Filtering
      let isVisible = false;

      // All Depts Permission
      if (canViewAllSchedule) isVisible = true;
      
      // Own Dept Permission
      if (canViewOwnSchedule && s.departmentId === currentUser?.departmentId) isVisible = true;
      
      // Matrix-Based Permission (View only cross-audit targets)
      if (canViewMatrixSchedule && canAuditDepartment(s.departmentId)) isVisible = true;

      if (!isVisible) return false;

      // 2. UI Filter logic (Building / Level)
      const loc = allLocations.find(l => l.id === s.locationId);
      if (selectedBlock !== 'All' && getBuildingAbbr(loc?.buildingId, loc?.building) !== selectedBlock) return false;
      if (selectedLevel !== 'All' && loc?.level !== selectedLevel) return false;
      
      return true;
    });
  }, [schedules, selectedBlock, selectedLevel, allLocations, canViewAllSchedule, canViewOwnSchedule, canViewMatrixSchedule, currentUser, canAuditDepartment]);

  const isAuditLocked = (audit: AuditSchedule) => {
    if (audit.isLocked === false) return false;
    return !!(audit.isLocked || (audit.date && audit.auditor1Id && audit.auditor2Id));
  };

  const activePhase = useMemo(() => {
    const today = new Date();
    return (auditPhases || []).find(p => {
      const start = new Date(p.startDate);
      const end = new Date(p.endDate);
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
      return today >= start && today <= end;
    });
  }, [auditPhases]);

  return (
    <div className="space-y-6 flex flex-col flex-1 min-h-0">
      <PageHeader
        title="Movable Asset Inspection Schedules"
        icon={Calendar}
        activePhase={activePhase}
        description="Plan and manage institutional inspection windows and inspecting officer assignments."
      >
        <PrintButton 
          onPrint={() => printInspectionSchedule(displaySchedules, allDepartments, allLocations, users, auditPhases, selectedDept, buildings)}
          title="Print Inspection Schedule"
        />
        <button
          onClick={() => exportInspectionSchedule(displaySchedules, allDepartments, allLocations, users, auditPhases, selectedDept, buildings)}
          className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-500/20 active:scale-95"
          title="Export to Excel (one sheet per department)"
        >
          <FileSpreadsheet className="w-4 h-4" />
          Export Excel
        </button>
        {canAutoAssign && (
          <button
            onClick={handleAutoAssign}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-500/20 active:scale-95"
          >
            <Zap className="w-4 h-4" />
            Smart Auto-Assign
          </button>
        )}
      </PageHeader>

      {hasFieldRole && !isCertified && (
        <div className="bg-rose-600 text-white px-6 py-4 rounded-3xl shadow-xl shadow-rose-500/20 flex flex-col sm:flex-row items-center justify-between gap-4 animate-in fade-in slide-in-from-top-2">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center text-xl">
              <ShieldOff className="w-6 h-6" />
            </div>
            <div>
              <h4 className="font-black text-sm uppercase tracking-widest">Self-Assignment Locked</h4>
              <p className="text-xs text-rose-100 font-medium">
                {isSupervisor || isCoordinator || isAuditor ? 'Management override disabled.' : 'Authorization revoked.'} Your inspecting officer certification is expired.
              </p>
            </div>
          </div>
          <button 
            onClick={() => window.location.hash = '#profile'}
            className="px-4 py-2 bg-white text-rose-600 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-rose-50 transition-colors shrink-0"
          >
            Check Status
          </button>
        </div>
      )}

      {/* Filters Bar */}
      <div className="bg-white rounded-[32px] p-4 border border-slate-200 shadow-sm">
          <div className="flex flex-col lg:flex-row gap-4">
              <div className="flex items-center gap-2 text-slate-400 text-xs font-bold uppercase tracking-widest mb-2 lg:mb-0 lg:mr-4">
                  <Filter className="w-4 h-4" />
                  Filters
              </div>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 grow">
                  {/* Department Filter */}
                  <div className="relative">
                    <label className="text-[9px] font-black uppercase text-slate-400 tracking-widest ml-1 mb-1 block">Department</label>
                    <div className="relative">
                        <select
                        title="Department"
                        className="w-full pl-4 pr-8 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold focus:ring-2 focus:ring-blue-500/20 outline-none transition-all appearance-none cursor-pointer hover:bg-white"
                        value={selectedDept}
                        onChange={(e) => onDeptChange(e.target.value)}
                        >
                        {departments.map(d => (
                            <option key={d} value={d}>{d === 'All' ? 'All Departments' : d}</option>
                        ))}
                        </select>
                        <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 w-3 h-3 pointer-events-none" />
                    </div>
                  </div>

                  {/* Block Filter */}
                  <div className="relative">
                    <label className="text-[9px] font-black uppercase text-slate-400 tracking-widest ml-1 mb-1 block">Block / Building</label>
                    <div className="relative">
                        <select
                        title="Block / Building"
                        className="w-full pl-4 pr-8 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold focus:ring-2 focus:ring-blue-500/20 outline-none transition-all appearance-none cursor-pointer hover:bg-white"
                        value={selectedBlock}
                        onChange={(e) => setSelectedBlock(e.target.value)}
                        >
                        {uniqueBlocks.map(b => {
                            if (b === 'All') return <option key={b} value={b}>All Blocks</option>;
                            const fullBuilding = buildings.find(building => building.abbr === b);
                            const displayName = fullBuilding ? `${b} | ${fullBuilding.name}` : b;
                            return <option key={b} value={b}>{displayName}</option>;
                        })}
                        </select>
                        <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 w-3 h-3 pointer-events-none" />
                    </div>
                  </div>

                  {/* Level Filter */}
                  <div className="relative">
                    <label className="text-[9px] font-black uppercase text-slate-400 tracking-widest ml-1 mb-1 block">Level</label>
                    <div className="relative">
                        <select
                        title="Level"
                        className="w-full pl-4 pr-8 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold focus:ring-2 focus:ring-blue-500/20 outline-none transition-all appearance-none cursor-pointer hover:bg-white"
                        value={selectedLevel}
                        onChange={(e) => setSelectedLevel(e.target.value)}
                        >
                        {uniqueLevels.map(l => (
                            <option key={l} value={l}>{l === 'All' ? 'All Levels' : l}</option>
                        ))}
                        </select>
                        <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 w-3 h-3 pointer-events-none" />
                    </div>
                  </div>

                  {/* Status Filter */}
                  <div className="relative">
                    <label className="text-[9px] font-black uppercase text-slate-400 tracking-widest ml-1 mb-1 block">Status</label>
                    <div className="relative">
                        <select
                        title="Status"
                        className="w-full pl-4 pr-8 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold focus:ring-2 focus:ring-blue-500/20 outline-none transition-all appearance-none cursor-pointer hover:bg-white"
                        value={selectedStatus}
                        onChange={(e) => onStatusChange(e.target.value)}
                        >
                        <option value="All">All Statuses</option>
                        <option value="Pending">Pending</option>
                        <option value="In Progress">In Progress</option>
                        <option value="Completed">Completed</option>
                        </select>
                        <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 w-3 h-3 pointer-events-none" />
                    </div>
                  </div>
              </div>
          </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 px-2">
         {['All', ...auditPhases.map(p => ({ id: p.id, name: p.name }))].map(phase => {
             const isAll = typeof phase === 'string';
             const phaseId = isAll ? 'All' : (phase as any).id;
             const phaseName = isAll ? 'All Phases' : (phase as any).name;
             
             return (
              <button 
                key={phaseId} 
                onClick={() => onPhaseChange(phaseId)} 
                className={`px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all border ${selectedPhaseId === phaseId ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'}`}
              >
                 {phaseName}
              </button>
             );
         })}
         
      </div>

      <div className="bg-white rounded-[40px] border border-slate-200 shadow-sm flex flex-col flex-1 min-h-0 overflow-hidden">
        <div className="w-full overflow-auto scrollbar-thumb-slate-300 rounded-[40px] flex-1">
          <table className="w-full text-left min-w-250 border-separate border-spacing-0">
            <thead className="bg-slate-50/50 border-b border-slate-100 sticky top-0 z-20">
              <tr>
                <th className="px-8 py-6 text-[10px] font-black uppercase text-slate-400 tracking-widest w-48 sticky left-0 bg-slate-50 z-30 border-r border-slate-100">Date</th>
                <th className="px-8 py-6 text-[10px] font-black uppercase text-slate-400 tracking-widest w-64 sticky left-48 bg-slate-50 z-30 border-r border-slate-100">Asset Location</th>
                <th className="px-8 py-6 text-[10px] font-black uppercase text-slate-400 tracking-widest w-64">Site Supervisor</th>
                <th className="px-8 py-6 text-[10px] font-black uppercase text-slate-400 tracking-widest w-64">Inspecting Officers</th>
                <th className="px-8 py-6 text-[10px] font-black uppercase text-slate-400 tracking-widest w-32 text-center">Status</th>
                <th className="px-8 py-6 text-[10px] font-black uppercase text-slate-400 tracking-widest w-16 text-center"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {displaySchedules.map(audit => {
                const loc = allLocations.find(l => l.id === audit.locationId);
                const isCurrentUserAssigned = audit.auditor1Id === currentUser?.id || audit.auditor2Id === currentUser?.id;
                
                // Calculate assets assigned on this date
                const auditsOnDate = schedules.filter(s => s.date === audit.date && (s.auditor1Id === currentUser?.id || s.auditor2Id === currentUser?.id));
                const totalAssetsOnDate = auditsOnDate.reduce((sum, s) => {
                  const loc = allLocations.find(l => l.id === s.locationId);
                  return sum + (loc?.totalAssets || 0);
                }, 0);
                
                const currentLoc = allLocations.find(l => l.id === audit.locationId);
                const isUserOverLimit = !isCurrentUserAssigned && (totalAssetsOnDate + (currentLoc?.totalAssets || 0) > maxAssetsPerDay);
                
                const isPast = audit.date && audit.date < todayStr;
                const userCanAudit = canAuditDepartment(audit.departmentId);
                const isDateValid = isDateInValidPhase(audit.date, audit.phaseId);
                const locationLevel = loc?.level;

                const isLocked = isAuditLocked(audit);

                return (
                  <tr key={audit.id} className={`hover:bg-slate-50/50 transition-colors ${isLocked ? 'bg-slate-50/30 opacity-90' : ''}`}>
                    <td className="px-8 py-6 align-top sticky left-0 bg-white z-10 border-r border-slate-100">
                      <div className="flex flex-col gap-2">
                        <div className="relative group flex items-center gap-2">
                          <div className="relative flex-1 min-w-32.5">
                            <Calendar className={`absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none z-10 ${
                              !audit.date ? 'text-amber-500' : 'text-slate-400'
                            }`} />
                            <input 
                              type="date"
                              title="Audit Date"
                              placeholder="YYYY-MM-DD"
                              value={audit.date || ''}
                              disabled={!hasPhases || !canEditDates}
                              onChange={(e) => handleDateChange(audit.id, e.target.value, audit.phaseId)}
                              className={`w-full pl-10 pr-4 py-2.5 rounded-xl text-xs font-bold border outline-none transition-all ${
                                !canEditDates
                                  ? 'bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed'
                                  : !hasPhases
                                  ? 'bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed'
                                  : !audit.date 
                                  ? 'bg-amber-50 border-amber-100 text-amber-600 focus:ring-amber-500/20' 
                                  : !isDateValid
                                  ? 'bg-rose-50 border-rose-200 text-rose-600'
                                  : 'bg-slate-50 border-slate-200 text-slate-900 focus:ring-blue-500/20 group-hover:bg-white'
                              }`}
                            />
                            {isLocked && (
                              <div className="absolute -top-3 right-0 z-20">
                                <div className="px-1.5 py-0.5 bg-slate-800 text-white text-[8px] font-black uppercase rounded flex items-center gap-1 shadow-sm">
                                  <Lock className="w-2 h-2" /> Locked
                                </div>
                              </div>
                            )}
                          </div>
                          
                          {!isLocked && canEditDates && hasPhases && !audit.date && (
                            <button
                              onClick={() => {
                                const today = new Date().toISOString().split('T')[0];
                                const phase = auditPhases.find(p => p.id === audit.phaseId);
                                if (isDateInValidPhase(today, audit.phaseId)) {
                                  handleDateChange(audit.id, today, audit.phaseId);
                                } else if (phase) {
                                  handleDateChange(audit.id, phase.startDate, audit.phaseId);
                                }
                              }}
                              className="shrink-0 px-3 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-all shadow-lg shadow-blue-500/20 text-[10px] font-black uppercase tracking-widest active:scale-95"
                              title="Quick Pick: Set to Today or Phase Start"
                            >
                              Pick
                            </button>
                          )}

                          {canEditDates && (
                            <button
                              onClick={() => onToggleLock(audit.id)}
                              className={`shrink-0 w-10 h-10 flex items-center justify-center rounded-xl transition-all border ${
                                isAuditLocked(audit) 
                                  ? 'bg-slate-800 border-slate-700 text-amber-400 shadow-lg' 
                                  : 'bg-white border-slate-200 text-slate-400 hover:border-slate-300 hover:bg-slate-50'
                              }`}
                              title={isAuditLocked(audit) ? "Unlock Phase Assignment" : "Manually Lock Phase Assignment"}
                            >
                              {isAuditLocked(audit) ? <Lock className="w-4 h-4" /> : <Unlock className="w-4 h-4" />}
                            </button>
                          )}
                        </div>
                        {isDateValid === false && audit.date && (
                          <div className="text-[9px] font-bold text-red-500 whitespace-nowrap bg-red-50 px-2 py-1 rounded-lg border border-red-100 w-fit">
                            Outside phase window
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-8 py-6 align-top sticky left-48 bg-white z-10 border-r border-slate-100">
                      <div className="flex flex-col gap-1.5">
                        <div className="font-bold text-slate-900 text-base">{loc?.name || audit.locationId}</div>
                        {(() => {
                           const bDisplay = getBuildingAbbr(loc?.buildingId, loc?.building);
                           if (!bDisplay) return null;
                           return (
                             <div className="text-[11px] text-slate-400 font-medium flex items-center gap-1.5 uppercase tracking-tight">
                               <Building className="w-3 h-3 opacity-40 text-blue-500" />
                               {bDisplay}
                             </div>
                           );
                        })()}
                        {locationLevel && (
                          <div className="text-[11px] text-slate-400 font-medium flex items-center gap-1.5">
                            <Layers className="w-3 h-3 opacity-40" />
                            {locationLevel}
                          </div>
                        )}
                        <span className="inline-flex w-fit px-2.5 py-1 bg-slate-100 text-slate-600 text-[9px] font-black uppercase rounded-lg border border-slate-200 mt-1 tracking-widest">
                          {allDepartments.find(d => d.id === audit.departmentId)?.name || audit.departmentId}
                        </span>
                        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                          {(loc?.totalAssets || 0) > 0 ? (
                            <span className="px-2 py-0.5 rounded-md bg-slate-100 text-[9px] text-slate-500 font-bold border border-slate-200 flex items-center gap-1">
                              <Package className="w-2.5 h-2.5" /> {(loc!.totalAssets || 0).toLocaleString()}
                            </span>
                          ) : (
                            <div className="flex items-center gap-1.5 px-2 py-1 bg-amber-50 text-amber-700 border border-amber-100 rounded-lg animate-pulse" title="Warning: This location has 0 documented assets. Rebalancing will use equal-distribution fallback.">
                              <AlertTriangle className="w-3 h-3 text-amber-500" />
                              <span className="text-[9px] font-black uppercase tracking-tight">Zero Assets Recorded</span>
                            </div>
                          )}
                          {(loc?.uninspectedAssetCount || 0) > 0 && (
                            <span className="px-2 py-0.5 rounded-md bg-rose-50 text-[9px] text-rose-600 font-bold border border-rose-100 flex items-center gap-1">
                              <span className="w-1.5 h-1.5 rounded-full bg-rose-400 inline-block" />
                              {(loc!.uninspectedAssetCount || 0).toLocaleString()} uninspected
                            </span>
                          )}
                        </div>
                        
                        {(() => {
                           const dept = allDepartments.find(d => d.id === audit.departmentId);
                           const deptOfficers = users.filter(u => u.departmentId === dept?.id && u.certificationExpiry && new Date(u.certificationExpiry) > new Date());
                           const officerCapacity = deptOfficers.length * maxAssetsPerDay;
                           const totalAssets = dept?.totalAssets || 0;
                           const isAtRisk = totalAssets > officerCapacity && deptOfficers.length > 0;
                           
                           if (isAtRisk) {
                             return (
                               <div className="mt-2 p-2 bg-rose-50 border border-rose-100 rounded-xl flex items-start gap-2 max-w-xs shadow-sm">
                                 <AlertTriangle className="w-3.5 h-3.5 text-rose-500 shrink-0 mt-0.5" />
                                 <div>
                                   <div className="text-[9px] font-black text-rose-700 uppercase tracking-widest leading-none mb-1">Capacity Deficit</div>
                                   <div className="text-[9px] text-rose-600 font-medium leading-tight">
                                     {totalAssets.toLocaleString()} assets exceeds department capacity ({officerCapacity.toLocaleString()} max/day). Assignments may bottleneck.
                                   </div>
                                 </div>
                               </div>
                             );
                           }
                           return null;
                        })()}
                      </div>
                    </td>

                    <td className="px-8 py-6 align-top">
                      <div className="flex flex-col gap-1.5">
                        <div className="font-bold text-slate-700 text-xs flex items-center gap-2.5">
                           <div className="w-8 h-8 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-400 shrink-0">
                             <UserCheck className="w-4 h-4" />
                           </div>
                           {users.find(u => u.id === audit.supervisorId)?.name || audit.supervisorId}
                        </div>
                        {loc?.contact && (
                          <div className="flex items-center gap-2 pl-10.5">
                            <Phone className="w-3 h-3 text-slate-300" />
                            <span className="text-[10px] text-slate-400 font-bold font-mono tracking-tighter">{loc.contact}</span>
                          </div>
                        )}
                      </div>
                    </td>

                    <td className="px-8 py-6 align-top">
                      <div className="space-y-3">
                        {[1, 2].map(slotNum => (
                          <AuditorAssignmentSlot
                            key={slotNum}
                            slotNum={slotNum as 1 | 2}
                            audit={audit}
                            users={users}
                            currentUser={currentUser}
                            allDepartments={allDepartments}
                            canManageAssignments={(canEditDates || canSelfAssignPerm || canAssignOthers) && !isLocked}
                            canAssignOthers={canAssignOthers && !isLocked}
                            canSelfAssignSelf={canSelfAssignSelf && !isLocked}
                            userCanAudit={userCanAudit}
                            isCurrentUserAssigned={isCurrentUserAssigned}
                            isPast={isPast}
                            isDateValid={isDateValid}
                            hasPhases={hasPhases}
                            isUserOverLimit={isUserOverLimit}
                            hasFieldRole={hasFieldRole}
                            isCertified={isCertified}
                            isSupervisor={isSupervisor}
                            isCoordinator={isCoordinator}
                            isAuditor={isAuditor}
                            onAssign={handleSelfAssign}
                            onUnassign={onUnassign}
                            getUserContact={getUserContact}
                            getEntityName={getEntityName}
                            maxAssetsPerDay={maxAssetsPerDay}
                            assignmentMode={assignmentMode}
                          />
                        ))}
                      </div>
                    </td>

                    <td className="px-8 py-6 align-top text-center">
                      {(() => {
                        const canComplete = isAdmin || isCoordinator || (isCurrentUserAssigned && isCertified && isAuditor);
                        return (
                          <button 
                            onClick={() => {
                              if (audit.status === 'In Progress' || audit.status === 'Completed') {
                                setUploadAudit(audit);
                              }
                            }}
                            disabled={!canComplete || audit.status === 'Pending'}
                            className={`inline-flex items-center px-4 py-2 rounded-xl text-[10px] font-black uppercase border tracking-widest transition-all active:scale-95 ${getStatusBadgeStyles(audit.status)} ${!canComplete && 'opacity-50 pointer-events-none'}`}
                          >
                            {audit.status}
                            {canComplete && audit.status !== 'Pending' && <RotateCcw className="w-2 h-2 ml-2 opacity-40" />}
                          </button>
                        );
                      })()}
                    </td>

                    <td className="px-8 py-6 align-top text-center">
                        <div className="flex items-center justify-center gap-2">
                          {audit.reportPath && (
                            <a
                              href={audit.reportPath}
                              target="_blank"
                              rel="noreferrer"
                              className="w-8 h-8 flex items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 hover:bg-emerald-100 hover:text-emerald-700 transition-colors border border-emerald-100 hover:border-emerald-200 shadow-sm"
                              title="Download/View Uploaded KEW-PA 11 PDF"
                            >
                              <ExternalLink className="w-4 h-4" />
                            </a>
                          )}
                          {audit.status === 'Completed' && (
                              <button
                                  onClick={() => setReportAudit(audit)}
                                  className="w-8 h-8 flex items-center justify-center rounded-lg bg-slate-50 text-slate-400 hover:bg-blue-50 hover:text-blue-600 transition-colors border border-slate-100 hover:border-blue-100 shadow-sm"
                                  title="Generate Formal Completion Report (AI)"
                              >
                                  <FileText className="w-4 h-4" />
                              </button>
                          )}
                        </div>
                    </td>
                  </tr>
                );
              })}
              {(!displaySchedules || displaySchedules.length === 0) && (
                <tr>
                  <td colSpan={6} className="px-8 py-24 text-center">
                    <div className="max-w-xs mx-auto">
                        <div className="w-20 h-20 bg-slate-50 rounded-[24px] flex items-center justify-center mx-auto mb-6">
                          <Search className="w-10 h-10 text-slate-200" />
                        </div>
                        <h4 className="text-slate-900 font-bold mb-2">No Inspections Found</h4>
                        <p className="text-xs text-slate-400 font-medium">Try adjusting your filters or search terms.</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {reportAudit && (
        <AuditReportModal 
            audit={reportAudit}
            onClose={() => setReportAudit(null)}
        />
      )}

      {uploadAudit && (
        <AuditUploadModal
          audit={uploadAudit}
          locationName={allLocations.find(l => l.id === uploadAudit.locationId)?.name || uploadAudit.locationId}
          onClose={() => setUploadAudit(null)}
          onComplete={async (id, reportPath) => {
            await onUpdateAudit(id, { status: 'Completed', reportPath });
          }}
        />
      )}


    </div>
  );
};
