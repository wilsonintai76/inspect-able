
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { AuditSchedule, User, UserRole, Department, Location, CrossAuditPermission, AuditPhase, Building as BuildingType } from '@shared/types';
import { useRBAC } from '../contexts/RBACContext';
import { AuditReportModal } from './AuditReportModal';
import { AuditUploadModal } from './AuditUploadModal';
import { Search, Calendar, Zap, FileSpreadsheet } from 'lucide-react';
import { PageHeader } from './PageHeader';
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
  const canAssignOthers = isAdmin && hasPerm('edit:audit:assign:others');
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
    const supervisorIds = audit.supervisorId ? audit.supervisorId.split(',').map(id => id.trim()).filter(Boolean) : [];
    if (supervisorIds.includes(assignUserId)) {
      alert(`CONFLICT OF INTEREST: ${isSelf ? 'You are' : 'The selected officer is'} a designated Site Supervisor for this location and cannot act as its inspector.`);
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
      alert("Auto-assignment could not find eligible officers for the remaining slots based on the audit matrix and daily limits.");
    }
  };


  const getStatusBadgeStyles = (status: string) => {
    switch(status) {
      case 'Completed': return 'bg-emerald-50 text-emerald-600 border-emerald-200 hover:bg-emerald-100 hover:border-emerald-300 cursor-pointer';
      case 'In Progress': return 'bg-blue-50 text-blue-600 border-blue-200 hover:bg-blue-100 hover:border-blue-300 cursor-pointer';
      case 'Awaiting Approval': return 'bg-amber-50 text-amber-600 border-amber-200 hover:bg-amber-100 hover:border-amber-300 cursor-pointer';
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
    return audit.isLocked === true;
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
                  isAuditor={isAuditor}
                  hasFieldRole={hasFieldRole}
                  isCertified={isCertified}
                  assignmentMode={assignmentMode}
                  isAuditLocked={isAuditLocked}
                  isDateInValidPhase={isDateInValidPhase}
                  getBuildingAbbr={getBuildingAbbr}
                  getEntityName={getEntityName}
                  getUserContact={getUserContact}
                  canAuditDepartment={canAuditDepartment}
                  getStatusBadgeStyles={getStatusBadgeStyles}
                  onDateChange={handleDateChange}
                  onToggleLock={onToggleLock}
                  onAssign={handleSelfAssign}
                  onUnassign={onUnassign}
                  onSetReportAudit={setReportAudit}
                  onSetUploadAudit={setUploadAudit}
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
