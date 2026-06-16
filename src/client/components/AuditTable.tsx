import React, { useState, useMemo, useEffect, useRef } from 'react';
import { AuditSchedule, User, UserRole, Department, Location, AuditPhase, Building as BuildingType, SystemActivity } from '@shared/types';
import { hasCapability } from '../lib/pbacUtils';

import { AuditReportModal } from './AuditReportModal';
import { AuditUploadModal } from './AuditUploadModal';
import { AssetStatusModal } from './AssetStatusModal';
import { Search, Calendar, Zap, FileSpreadsheet } from 'lucide-react';
import { PrintButton } from './PrintButton';
import { printInspectionSchedule, exportInspectionSchedule } from '../lib/printUtils';
import { CertificationBanner } from './audit-table/CertificationBanner';
import { AuditFiltersBar } from './audit-table/AuditFiltersBar';
import { AuditPhaseFilter } from './audit-table/AuditPhaseFilter';
import { AuditTableRow } from './audit-table/AuditTableRow';

interface AuditTableProps {
  schedules: AuditSchedule[];
  users: User[];
  currentUserName: string;
  userRoles: string[];
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
  auditPhases: AuditPhase[];
  activities: SystemActivity[];
  maxAssetsPerDay: number;
  buildings?: BuildingType[];
  onDeleteAudit?: (id: string) => void;
  onUpdateLocation?: (id: string, updates: Partial<Location>) => Promise<void>;
}

export const AuditTable: React.FC<AuditTableProps> = ({ 
  schedules, users, currentUserName, userRoles, departments, selectedDept, onDeptChange, selectedStatus, onStatusChange,
  selectedPhaseId, onPhaseChange, onAssign, onUnassign, onUpdateDate, onUpdateAudit, onToggleStatus, onToggleLock,
  allDepartments, allLocations, auditPhases, activities,
  maxAssetsPerDay,
  buildings = [],
  onDeleteAudit,
  onUpdateLocation,
}) => {
  const [reportAudit, setReportAudit] = useState<AuditSchedule | null>(null);
  const [uploadAudit, setUploadAudit] = useState<AuditSchedule | null>(null);
  const [statusAudit, setStatusAudit] = useState<AuditSchedule | null>(null);
  const [selectedBlock, setSelectedBlock] = useState('All');
  const [selectedLevel, setSelectedLevel] = useState('All');

  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── PBAC Capability Checks ────────────────────────────────────────────────
  // Build minimal user object for hasCapability
  const currentUser = users.find(u => u.name === currentUserName);
  const pbacUser = currentUser ? { roles: currentUser.roles, qualifications: currentUser.qualifications, certificationExpiry: currentUser.certificationExpiry } : { roles: [] as string[], qualifications: [] as string[], certificationExpiry: null as string | null };

  const isAdmin = hasCapability(pbacUser, 'system:admin');
  const isCoordinator = hasCapability(pbacUser, 'manage:departments') && !isAdmin;
  const isSupervisor = hasCapability(pbacUser, 'manage:locations') && !isAdmin && !hasCapability(pbacUser, 'manage:departments');
  
  const isCertified = React.useMemo(() => {
    if (!currentUser?.certificationExpiry) return false;
    const today = new Date().toISOString().split('T')[0];
    return currentUser.certificationExpiry >= today;
  }, [currentUser]);

  // PBAC: any role + valid cert = can self-assign
  const canSelfAssignSelf = isCertified && hasCapability(pbacUser, 'assign:self');

  // PBAC: assign others = manage:departments (Admin/Coordinator)
  const canAssignOthers = hasCapability(pbacUser, 'manage:departments');
  const canAutoAssign = hasCapability(pbacUser, 'system:admin');
  const canViewAllSchedule = hasCapability(pbacUser, 'schedule:manage_all');
  const canViewOwnSchedule = hasCapability(pbacUser, 'schedule:manage_dept');
  // Match mobile: any user who can view the schedule matrix can pick dates (lock/completed state enforced per-row)
  const canEditDates = hasCapability(pbacUser, 'manage:departments') || hasCapability(pbacUser, 'system:admin') || hasCapability(pbacUser, 'manage:locations') || hasCapability(pbacUser, 'asset_inspector') || isCertified;
  const canSendApprovalReminder = hasCapability(pbacUser, 'manage:departments') || hasCapability(pbacUser, 'system:admin');
  const canViewMatrixSchedule = hasCapability(pbacUser, 'manage:departments') || hasCapability(pbacUser, 'system:admin') || hasCapability(pbacUser, 'manage:locations') || hasCapability(pbacUser, 'asset_inspector') || isCertified;
  const isInspector = hasCapability(pbacUser, 'asset_inspector') || isCertified;

  const canSelfAssignPerm = canSelfAssignSelf; // PBAC replaces old perm check
  const hasFieldRole = hasCapability(pbacUser, 'assign:self');
  const currentUserDept = allDepartments.find(d => d.id === currentUser?.departmentId);
  const currentUserDeptName = currentUserDept?.name || "N/A";

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

  const getPhaseName = (phaseId: string) => {
    return auditPhases.find(p => p.id === phaseId)?.name || 'Unknown Phase';
  };

  const canAuditDepartment = (targetDeptId: string) => {
    const myDeptId = currentUser?.departmentId || '';

    // COI: Cannot audit own department (no exemptions — server enforces this unconditionally)
    if (myDeptId === targetDeptId) return false;

    // In Open Audit mode, any certified officer can audit any department (except COI)
    return true;
  };

  const getUserContact = (userId: string) => {
    return users.find(u => u.id === userId)?.contactNumber;
  };

  const getSiteSupervisorContact = (locationName: string) => {
    const loc = allLocations.find(l => l.name === locationName);
    return loc?.contact || '';
  };

  const isDateInValidPhase = (dateStr: string, _phaseId: string): boolean => {
    if (!dateStr) return true; 
    // Check ALL phases — users can plan ahead across any phase
    return auditPhases.some(p => dateStr >= p.startDate && dateStr <= p.endDate);
  };

  const handleDateChange = (id: string, newDate: string, phaseId: string) => {
    if (!hasPhases) {
        alert("Scheduling Disabled: An audit phase must be configured in System Settings before dates can be selected.");
        return;
    }
    if (newDate) {
        const matchingPhase = auditPhases.find(p => newDate >= p.startDate && newDate <= p.endDate);

        if (!matchingPhase) {
          alert("Warning: Selected date falls outside of all configured audit phases!");
          onUpdateAudit(id, { date: '', phaseId: null as any }); // Reset to empty and clear phase
          return;
        }

        if (matchingPhase.id !== phaseId) {
          onUpdateAudit(id, { date: newDate, phaseId: matchingPhase.id });
          return;
        }
        onUpdateDate(id, newDate);
    } else {
        onUpdateAudit(id, { date: '', phaseId: null as any });
    }
  };

  const handleSelfAssign = async (auditId: string, slot: 1 | 2, date: string, phaseId: string, manualUserId?: string) => {
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
    const isUserCertified = certExpiry && certExpiry >= new Date().toISOString().split('T')[0];

    if (!isUserCertified) {
      alert(`ACTION BLOCKED: Certification Required. ${isSelf ? 'Your' : 'The selected officer\'s'} certificate is expired or invalid.`);
      return;
    }
    if (!hasPhases) {
      alert("Self-assignment is locked until an audit phase is configured.");
      return;
    }

    // ── Audit permission check (COI) ────────────────────────────────────
    // Delegates to canAuditDepartment which enforces COI (no self-audit, per server)
    if (!canAuditDepartment(audit.departmentId)) {
      const officerDeptId = assignUser?.departmentId || '';
      const isOwnDept = officerDeptId === audit.departmentId;
      if (isOwnDept) {
        alert(`COI RESTRICTION: ${isSelf ? 'You' : 'The selected officer'} cannot inspect ${isSelf ? 'your' : 'their'} own department.`);
      } else {
        alert(`PAIRING RESTRICTION: This asset location is outside the assigned inspection matrix for ${isSelf ? 'you' : 'the selected officer'}.`);
      }
      return;
    }

    // 2. ABSOLUTE LOCK: Supervisor cannot be the Auditor for the same location
    const supervisorIds = audit.supervisorId ? audit.supervisorId.split(',').map(id => id.trim()).filter(Boolean) : [];
    if (supervisorIds.includes(assignUserId)) {
      alert(`CONFLICT OF INTEREST: ${isSelf ? 'You are' : 'The selected officer is'} a designated Site Supervisor for this location and cannot act as its inspector.`);
      return;
    }

    // Auto-resolve date when empty: inspectors can't set dates alone (patchAuditPermissionGuard
    // blocks non-assigned auditors), so we bundle date + slot assignment into a single call.
    let resolvedDate = date;
    let resolvedPhaseId = phaseId;
    if (!resolvedDate) {
      const today = new Date().toISOString().split('T')[0];
      const matchingPhase = auditPhases.find(p => {
        const d = new Date(today);
        const start = new Date(p.startDate); start.setHours(0,0,0,0);
        const end = new Date(p.endDate); end.setHours(23,59,59,999);
        return d >= start && d <= end;
      });
      if (matchingPhase) {
        resolvedDate = today;
        resolvedPhaseId = matchingPhase.id;
      } else {
        // Today falls outside all phases — use the earliest active phase's start date
        const sortedPhases = [...auditPhases].sort((a, b) => a.startDate.localeCompare(b.startDate));
        const futurePhase = sortedPhases.find(p => p.startDate >= today) || sortedPhases[0];
        if (futurePhase) {
          resolvedDate = futurePhase.startDate;
          resolvedPhaseId = futurePhase.id;
        }
      }
    }
    // Phase resolution: ensure phaseId matches the resolved date
    const datePhase = auditPhases.find(p => {
      const d = new Date(resolvedDate);
      const start = new Date(p.startDate); start.setHours(0,0,0,0);
      const end = new Date(p.endDate); end.setHours(23,59,59,999);
      return d >= start && d <= end;
    });
    if (datePhase && datePhase.id !== resolvedPhaseId) {
      resolvedPhaseId = datePhase.id;
    }

    // Bundle date + slot assignment into a single PATCH so the server sees an
    // incoming auditor (isAssignedAuditor) alongside the date change — this
    // satisfies patchAuditPermissionGuard's date-guard for self-assigning inspectors.
    const slotUpdate: Partial<AuditSchedule> = slot === 1 ? { auditor1Id: assignUserId } : { auditor2Id: assignUserId };
    const needsFullUpdate = resolvedDate !== (audit.date || undefined);
    if (needsFullUpdate) {
      await onUpdateAudit(auditId, {
        ...slotUpdate,
        date: resolvedDate,
        phaseId: resolvedPhaseId,
      });
    } else {
      onAssign(auditId, slot, assignUserId);
    }
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
      return u.certificationExpiry && u.certificationExpiry >= new Date().toISOString().split('T')[0];
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
          // COI: cannot audit own department (server enforces unconditionally)
          if (officer.departmentId === targetDeptId) return false;

          // ABSOLUTE LOCK: Supervisor cannot be the Auditor for the same location
          const supervisorIds = audit.supervisorId ? audit.supervisorId.split(',').map(id => id.trim()).filter(Boolean) : [];
          if (supervisorIds.includes(officer.id)) return false;

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
          await onAssign(audit.id, slot, chosen.id);
          assignmentCount++;
        }
      }
    }

    if (assignmentCount > 0) {
      alert(`Auto-assignment complete. Successfully assigned ${assignmentCount} slots.`);
    } else {
      alert("Auto-assignment could not find eligible officers for the remaining slots based on the daily limits.");
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
  const filteredSchedules = useMemo(() => {
    return schedules.filter(s => {
      // 1. RBAC Scope Filtering
      let isVisible = false;

      // All Depts Permission
      if (canViewAllSchedule) isVisible = true;
      
      // Own Dept Permission
      if (canViewOwnSchedule && s.departmentId === currentUser?.departmentId) isVisible = true;
      
      // Matrix-Based Permission
      if (canViewMatrixSchedule) isVisible = true;

      if (!isVisible) return false;

      // 2. UI Filter logic (Building / Level)
      const loc = allLocations.find(l => l.id === s.locationId);
      if (selectedBlock !== 'All' && getBuildingAbbr(loc?.buildingId, loc?.building) !== selectedBlock) return false;
      if (selectedLevel !== 'All' && loc?.level !== selectedLevel) return false;
      
      return true;
    });
  }, [schedules, selectedBlock, selectedLevel, allLocations, canViewAllSchedule, canViewOwnSchedule, canViewMatrixSchedule, currentUser]);

  // Phase filter: "Unscheduled" = Pending status, otherwise filter by phaseId
  const displaySchedules = useMemo(() => {
    if (selectedPhaseId === 'Unscheduled') {
      return filteredSchedules.filter(s => s.status === 'Pending' && !s.isLocked);
    }
    if (selectedPhaseId !== 'All') {
      return filteredSchedules.filter(s => s.phaseId === selectedPhaseId && s.status !== 'Pending');
    }
    return filteredSchedules;
  }, [filteredSchedules, selectedPhaseId]);

  const isAuditLocked = (audit: AuditSchedule) => {
    return audit.isLocked === true;
  };

  const approvalReminderAuditIds = useMemo(() => {
    return new Set(
      activities
        .filter(activity => {
          const metadata = activity.metadata as Record<string, unknown> | undefined;
          const hasAuditId = typeof metadata?.auditId === 'string';
          const isApprovalEmail = metadata?.category === 'approval_email'
            || /approval (email|reminder email)/i.test(activity.message);
          return hasAuditId && isApprovalEmail;
        })
        .map(activity => String((activity.metadata as Record<string, unknown>).auditId))
    );
  }, [activities]);

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
      {hasFieldRole && !isCertified && (
        <CertificationBanner isSupervisor={isSupervisor} isCoordinator={isCoordinator} />
      )}

      <AuditFiltersBar
        departments={departments}
        selectedDept={selectedDept}
        onDeptChange={onDeptChange}
        uniqueBlocks={uniqueBlocks}
        selectedBlock={selectedBlock}
        onBlockChange={setSelectedBlock}
        uniqueLevels={uniqueLevels}
        selectedLevel={selectedLevel}
        onLevelChange={setSelectedLevel}
        selectedStatus={selectedStatus}
        onStatusChange={onStatusChange}
        buildings={buildings}
      />

      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 px-2">
        {/* Phase buttons & active phase dates display */}
        <div className="flex flex-wrap items-center gap-3">
          <AuditPhaseFilter
            auditPhases={auditPhases}
            selectedPhaseId={selectedPhaseId}
            onPhaseChange={onPhaseChange}
          />
          {activePhase && (
            <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-50 border border-emerald-100 rounded-xl text-emerald-700 text-xs font-semibold shadow-sm">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-[10px] font-black uppercase tracking-wider">Active: {activePhase.name}</span>
              <span className="text-[10px] font-mono opacity-80">({activePhase.startDate} to {activePhase.endDate})</span>
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          <PrintButton
            onClick={() => printInspectionSchedule(displaySchedules, allDepartments, allLocations, users, auditPhases, selectedDept, buildings)}
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
        </div>
      </div>

      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm flex flex-col flex-1 min-h-0 overflow-hidden">
        <div className="w-full overflow-auto scrollbar-thumb-slate-300 rounded-3xl flex-1">
          <table className="w-full text-left min-w-325 border-separate border-spacing-0">
            <thead className="bg-slate-50/50 border-b border-slate-100 sticky top-0 z-20">
              <tr>
                <th className="px-5 py-4 text-[10px] font-black uppercase text-slate-400 tracking-widest w-64 sticky left-0 bg-slate-50 z-30 border-r border-slate-100">Date</th>
                <th className="px-5 py-4 text-[10px] font-black uppercase text-slate-400 tracking-widest w-72 sticky left-64 bg-slate-50 z-30 border-r border-slate-100">Asset Location</th>
                <th className="px-5 py-4 text-[10px] font-black uppercase text-slate-400 tracking-widest w-64">Site Supervisor</th>
                <th className="px-5 py-4 text-[10px] font-black uppercase text-slate-400 tracking-widest w-80">Inspecting Officers</th>
                <th className="px-5 py-4 text-[10px] font-black uppercase text-slate-400 tracking-widest w-44 text-center">Status</th>
                <th className="px-5 py-4 text-[10px] font-black uppercase text-slate-400 tracking-widest w-16 text-center"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {displaySchedules.map(audit => (
                <AuditTableRow
                  key={audit.id}
                  audit={audit}
                  users={users}
                  currentUser={currentUser}
                  allDepartments={allDepartments}
                  allLocations={allLocations}
                  buildings={buildings}
                  schedules={schedules}
                  todayStr={todayStr}
                  canEditDates={canEditDates}
                  canSelfAssignPerm={canSelfAssignPerm}
                  canAssignOthers={canAssignOthers}
                  hasPhases={hasPhases}
                  auditPhases={auditPhases}
                  maxAssetsPerDay={maxAssetsPerDay}
                  canSelfAssignSelf={canSelfAssignSelf}
                  isAdmin={isAdmin}
                  isCoordinator={isCoordinator}
                  isSupervisor={isSupervisor}
                  isInspector={isInspector}
                  hasFieldRole={hasFieldRole}
                  isCertified={isCertified}
                  canSendApprovalReminder={canSendApprovalReminder}
                  hasSentApprovalReminder={approvalReminderAuditIds.has(audit.id)}
                  isAuditLocked={isAuditLocked}
                  isDateInValidPhase={isDateInValidPhase}
                  getBuildingAbbr={getBuildingAbbr}
                  getUserContact={getUserContact}
                  canAuditDepartment={canAuditDepartment}
                  getStatusBadgeStyles={getStatusBadgeStyles}
                  onDateChange={handleDateChange}
                  onToggleLock={onToggleLock}
                  onAssign={handleSelfAssign}
                  onUnassign={onUnassign}
                  onSetReportAudit={setReportAudit}
                  onSetUploadAudit={setUploadAudit}
                  onSetStatusAudit={setStatusAudit}
                  onDeleteAudit={onDeleteAudit}
                />
              ))}
              {displaySchedules.length === 0 && (
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
          resolvedData={{
            locationName: allLocations.find(l => l.id === reportAudit.locationId)?.name || reportAudit.locationId,
            departmentName: allDepartments.find(d => d.id === reportAudit.departmentId)?.name || reportAudit.departmentId,
            auditor1Name: users.find(u => u.id === reportAudit.auditor1Id)?.name || reportAudit.auditor1Id || 'N/A',
            auditor2Name: users.find(u => u.id === reportAudit.auditor2Id)?.name || reportAudit.auditor2Id || 'N/A',
            supervisorName: reportAudit.supervisorId?.split(',').map(id => users.find(u => u.id === id.trim())?.name || id).join(', ') || 'N/A',
            totalAssets: allLocations.find(l => l.id === reportAudit.locationId)?.totalAssets,
            uninspectedAssets: allLocations.find(l => l.id === reportAudit.locationId)?.uninspectedAssetCount,
          }}
          onClose={() => setReportAudit(null)}
        />
      )}

      {uploadAudit && (
        <AuditUploadModal
          audit={uploadAudit}
          locationName={allLocations.find(l => l.id === uploadAudit.locationId)?.name || uploadAudit.locationId}
          locationTotalAssets={allLocations.find(l => l.id === uploadAudit.locationId)?.totalAssets || 0}
          onClose={() => setUploadAudit(null)}
          onComplete={async (id, reportPath, totalAssetsInspected, assetStatusSummary, verifiedAssetCount, assetStatuses, newLocationTotal) => {
            await onUpdateAudit(id, { 
              status: 'Completed', 
              reportPath,
              totalAssetsInspected,
              assetStatusSummary,
              verifiedAssetCount,
              assetStatuses
            });
            if (newLocationTotal !== undefined && onUpdateLocation && (isAdmin || isCoordinator || isSupervisor)) {
              await onUpdateLocation(uploadAudit.locationId, { totalAssets: newLocationTotal });
            }
          }}
        />
      )}

      {statusAudit && (
        <AssetStatusModal
          audit={statusAudit}
          locationName={allLocations.find(l => l.id === statusAudit.locationId)?.name || statusAudit.locationId}
          locationTotalAssets={allLocations.find(l => l.id === statusAudit.locationId)?.totalAssets || 0}
          onClose={() => setStatusAudit(null)}
          onSave={async (id, verifiedAssetCount, assetStatuses, newLocationTotal) => {
            await onUpdateAudit(id, { verifiedAssetCount, assetStatuses });
            if (newLocationTotal !== undefined && onUpdateLocation && (isAdmin || isCoordinator || isSupervisor)) {
              await onUpdateLocation(statusAudit.locationId, { totalAssets: newLocationTotal });
            }
          }}
        />
      )}
    </div>
  );
};
export default AuditTable;
