import React from 'react';
import { Phone, UserCheck, Plus, X } from 'lucide-react';
import { AuditSchedule, User, Department } from '@shared/types';

interface AuditorAssignmentSlotProps {
  slotNum: 1 | 2;
  audit: AuditSchedule;
  users: User[];
  currentUser: User | null;
  allDepartments?: Department[];
  canManageAssignments: boolean;
  canAssignOthers: boolean;
  canSelfAssignSelf: boolean;
  userCanAudit: boolean;
  isCurrentUserAssigned: boolean;
  isPast: boolean;
  isDateValid: boolean;
  hasPhases: boolean;
  isUserOverLimit: boolean;
  hasFieldRole: boolean;
  isCertified: boolean;
  isSupervisor: boolean;
  isCoordinator: boolean;
  isAuditor: boolean;
  onAssign: (id: string, slot: 1 | 2, date: string, phaseId: string) => void;
  onUnassign: (id: string, slot: 1 | 2) => void;
  getUserContact: (userId: string) => string | null;
  getEntityName: (deptId: string) => string;
  maxAssetsPerDay: number;
  assignmentMode?: 'cross-audit' | 'open-audit';
}

export const AuditorAssignmentSlot: React.FC<AuditorAssignmentSlotProps> = ({
  slotNum,
  audit,
  users,
  currentUser,
  allDepartments = [],
  canManageAssignments,
  canAssignOthers,
  canSelfAssignSelf,
  userCanAudit,
  isCurrentUserAssigned,
  isPast,
  isDateValid,
  hasPhases,
  isUserOverLimit,
  hasFieldRole,
  isCertified,
  isSupervisor,
  isCoordinator,
  onAssign,
  onUnassign,
  getUserContact,
  getEntityName,
  maxAssetsPerDay,
  assignmentMode = 'cross-audit'
}) => {
  const slotKey = slotNum === 1 ? 'auditor1Id' : 'auditor2Id';
  const auditorId = audit[slotKey as keyof AuditSchedule] as string | null;
  const isAssigned = !!auditorId;
  const auditor = users.find(u => u.id === auditorId);
  const contact = auditorId ? getUserContact(auditorId) : null;
  const isMe = auditorId === currentUser?.id;
  
  const canRemove = isAssigned && (canAssignOthers || (isMe && !isPast));
  
  const supervisorIds = audit.supervisorId ? audit.supervisorId.split(',').map(id => id.trim()).filter(Boolean) : [];
  const isUserSupervisor = supervisorIds.includes(currentUser?.id || '');

  // Check eligibility: Has field role + Valid Cert + No Conflict
  const isDisabled = isAssigned || !canSelfAssignSelf || !userCanAudit || isCurrentUserAssigned || isPast || !isDateValid || !hasPhases || isUserOverLimit || isUserSupervisor;
  
  let disableReason = "";
  if (isAssigned) {
    disableReason = "Slot already occupied";
  } else if (isUserSupervisor) {
    disableReason = "Conflict of Interest: You are a designated Site Supervisor for this location and cannot act as its inspector.";
  } else if (isUserOverLimit) {
    disableReason = `Assignment Limit: Adding this inspection exceeds your daily asset limit of ${maxAssetsPerDay} assets.`;
  } else if (!hasFieldRole) {
    disableReason = "Access Denied: Your role does not permit inspecting.";
  } else if (!isCertified) {
    // Customize message based on role for better clarity
    if (isSupervisor || isCoordinator) {
        disableReason = "Certification Required: Supervisors/Coordinators must hold a valid certificate to inspect.";
    } else {
        disableReason = "Certification Required: Your inspecting officer certificate is expired or invalid.";
    }
  } else if (!userCanAudit) {
     const myEnt = getEntityName(currentUser?.departmentId || '');
     const targetEnt = getEntityName(audit.departmentId);
     if (myEnt === targetEnt) {
       disableReason = "Conflict of Interest: You cannot inspect your own department.";
     } else {
       disableReason = assignmentMode === 'cross-audit' 
         ? "Unauthorized Target: This asset location is outside your assigned inspection matrix."
         : "Assignment Locked: Unexpected validation failure.";
     }
  } else if (isCurrentUserAssigned) {
    disableReason = "Already assigned to a slot in this audit instance.";
  } else if (isPast) {
    disableReason = "This audit date has already passed.";
  } else if (!hasPhases) {
    disableReason = "Scheduling is locked until an active phase is configured.";
  } else if (!isDateValid) {
    disableReason = "The current audit date is outside the authorized phase window.";
  }

  const eligibleOfficers = React.useMemo(() => {
    if (!canAssignOthers) return [];
    
    return users.filter(officer => {
      // 1. Basic cert/past check (Role is decoupled, Admin decides via RBAC)
      if (!officer.certificationExpiry || new Date(officer.certificationExpiry) <= new Date() || isPast) return false;
      
      const myEntityId = getEntityName(officer.departmentId || '');
      const targetEntityId = getEntityName(audit.departmentId);
      const isInternal = myEntityId === targetEntityId;
      
      // Fetch target department's exemption status (Internal Audit Mode)
      const targetDept = allDepartments?.find(d => d.id === audit.departmentId);
      const isInternalAuditMode = targetDept?.isExempted === true;

      // 2. Conflict Check (Entity level) - Permitted ONLY during internal audits (exemption)
      if (isInternal && !isInternalAuditMode) return false;

      // 2b. Matrix Check (only if in cross-audit mode)
      if (assignmentMode === 'cross-audit') {
        // We don't have access to crossAuditPermissions here directly, 
        // but AuditTable should have filtered userCanAudit already.
        // For the dropdown, we need to be careful.
        // Actually, AuditTable manages the dropdown for 'canAssignOthers'.
        // Wait, AuditorAssignmentSlot has its own dropdown logic.
        // Let's ensure this logic is consistent.
      }

      // 3. ABSOLUTE LOCK: Supervisor cannot be the Auditor for the same location (Integrity Rule)
      const supervisorIds = audit.supervisorId ? audit.supervisorId.split(',').map(id => id.trim()).filter(Boolean) : [];
      if (supervisorIds.includes(officer.id)) return false;

      // 4. Already in this audit?
      if (audit.auditor1Id === officer.id || audit.auditor2Id === officer.id) return false;

      return true;
    });
  }, [users, canAssignOthers, audit, getEntityName, isPast, allDepartments]);

  return (
    <div className="min-h-11">
      {isAssigned ? (
        <div className="flex items-center justify-between w-full bg-blue-50/50 rounded-xl p-2 border border-blue-100 group transition-all">
          <div className="min-w-0 pr-2">
            <div className="text-xs font-black text-slate-900 truncate flex items-center gap-1.5 uppercase tracking-tighter">
              {auditor?.name || "Unknown"}
              {isMe && <span className="text-[10px] text-blue-600 font-bold normal-case ml-1">(You)</span>}
            </div>
              {contact && (
              <div className="text-[9px] text-slate-400 flex items-center gap-1 mt-0.5 font-bold">
                <Phone className="w-2 h-2 opacity-50" />
                {contact}
              </div>
            )}
          </div>
          
          {canRemove && (
            <button 
              onClick={() => onUnassign(audit.id, slotNum)}
              className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
              title="Remove Assignment"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {canAssignOthers && (
            <select
              title="Assign Officer"
              className={`w-full px-3 py-2 rounded-xl text-[10px] font-bold border-2 transition-all outline-none ${
                isPast || !audit.date
                  ? 'bg-slate-50 border-slate-200 text-slate-400 cursor-not-allowed'
                  : 'bg-white border-indigo-100 text-indigo-600 focus:border-indigo-300'
              }`}
              value=""
              disabled={isPast || !audit.date}
              onChange={(e) => e.target.value && onAssign(audit.id, slotNum, audit.date, audit.phaseId, e.target.value)}
            >
              <option value="">Select Officer...</option>
              {eligibleOfficers.map(u => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </select>
          )}
          <button 
            onClick={() => onAssign(audit.id, slotNum, audit.date, audit.phaseId)}
            disabled={isDisabled}
            className={`w-full flex items-center justify-center gap-2 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
              isDisabled 
                ? 'bg-slate-50 text-slate-400 border border-slate-200 cursor-not-allowed'
                : 'bg-white border-2 border-blue-100 text-blue-600 hover:border-blue-300 hover:bg-blue-50 shadow-sm'
            }`}
            title={disableReason}
          >
            <Plus className="w-3 h-3" />
            Self Assign
          </button>
        </div>
      )}
    </div>
  );
};
