import React from 'react';
import { Phone, UserCheck, Plus, X } from 'lucide-react';
import { AuditSchedule, User } from '@shared/types';

interface AuditorAssignmentSlotProps {
  slotNum: 1 | 2;
  audit: AuditSchedule;
  users: User[];
  currentUser: User | null;
  canManageAssignments: boolean;
  canAssignOthers: boolean;
  canSelfAssignSelf: boolean;
  isAdmin: boolean;
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
  isInspector: boolean;
  onAssign: (id: string, slot: 1 | 2, date: string, phaseId: string, userId?: string) => void;
  onUnassign: (id: string, slot: 1 | 2) => void;
  getUserContact: (userId: string) => string | null;
  maxAssetsPerDay: number;
}

export const AuditorAssignmentSlot: React.FC<AuditorAssignmentSlotProps> = ({
  slotNum,
  audit,
  users,
  currentUser,
  canManageAssignments,
  canAssignOthers,
  canSelfAssignSelf,
  isAdmin,
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
  maxAssetsPerDay,
}) => {
  const [officerQuery, setOfficerQuery] = React.useState('');
  const [isDropdownOpen, setIsDropdownOpen] = React.useState(false);

  const slotKey = slotNum === 1 ? 'auditor1Id' : 'auditor2Id';
  const auditorId = audit[slotKey as keyof AuditSchedule] as string | null;
  const isAssigned = !!auditorId;
  const auditor = users.find(u => u.id === auditorId);
  const contact = auditorId ? getUserContact(auditorId) : null;
  const isMe = auditorId === currentUser?.id;
  
  const canRemove = isAssigned && (isAdmin || (isMe && !isPast));
  
  const supervisorIds = audit.supervisorId ? audit.supervisorId.split(',').map(id => id.trim()).filter(Boolean) : [];
  const isUserSupervisor = supervisorIds.includes(currentUser?.id || '');

  // Check eligibility: Has field role + Valid Cert + No Conflict
  // Note: isDateValid and isPast are used for display only — phase is a projection guideline, not a hard block
  const hasDate = !!audit.date;
  const isDisabled = isAssigned || !canSelfAssignSelf || !userCanAudit || isCurrentUserAssigned || isPast || !hasDate || !hasPhases || isUserOverLimit || isUserSupervisor;
  
  let disableReason = "";
  if (isAssigned) {
    disableReason = "Slot already occupied";
  } else if (!hasDate) {
    disableReason = "Date Required: An inspection date must be set before self-assignment. Click the date field or 'Pick' button on the left to set a date.";
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
     if (currentUser?.departmentId === audit.departmentId) {
       disableReason = "Conflict of Interest: You cannot inspect your own department.";
     } else {
       disableReason = "Assignment Locked: Unexpected validation failure.";
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
      // 1. Basic cert/past check
      if (!officer.certificationExpiry || new Date(officer.certificationExpiry) <= new Date() || isPast) return false;

      // Coordinators can only assign officers from their own department.
      if (isCoordinator && !isAdmin && currentUser?.departmentId && officer.departmentId !== currentUser.departmentId) {
        return false;
      }

      // 2. COI: Cannot audit own department
      if (officer.departmentId === audit.departmentId) return false;

      // 3. ABSOLUTE LOCK: Supervisor cannot be the Auditor for the same location
      const supervisorIds = audit.supervisorId ? audit.supervisorId.split(',').map(id => id.trim()).filter(Boolean) : [];
      if (supervisorIds.includes(officer.id)) return false;

      // 4. Already in this audit?
      if (audit.auditor1Id === officer.id || audit.auditor2Id === officer.id) return false;

      return true;
    });
  }, [users, canAssignOthers, audit, isPast, isCoordinator, isAdmin, currentUser?.departmentId]);

  const filteredEligibleOfficers = React.useMemo(() => {
    const query = officerQuery.trim().toLowerCase();
    if (!query) return eligibleOfficers;
    return eligibleOfficers.filter(u => (u.name || '').toLowerCase().includes(query));
  }, [eligibleOfficers, officerQuery]);

  const canUseAssignOthers = canAssignOthers && !isPast && !!audit.date;

  return (
    <div className="min-h-11">
      {isAssigned ? (
        <div className="flex items-center justify-between w-full bg-blue-50/50 rounded-lg p-2 border border-blue-100 group transition-all">
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
            <div className="relative">
              <input
                title="Search QAI"
                placeholder="Type officer name..."
                value={officerQuery}
                disabled={!canUseAssignOthers}
                onFocus={() => {
                  if (canUseAssignOthers) setIsDropdownOpen(true);
                }}
                onBlur={() => {
                  window.setTimeout(() => setIsDropdownOpen(false), 120);
                }}
                onChange={(e) => {
                  setOfficerQuery(e.target.value);
                  if (!isDropdownOpen && canUseAssignOthers) {
                    setIsDropdownOpen(true);
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    setIsDropdownOpen(false);
                  }
                  if (e.key === 'Enter' && filteredEligibleOfficers.length > 0 && canUseAssignOthers) {
                    e.preventDefault();
                    const selected = filteredEligibleOfficers[0];
                    onAssign(audit.id, slotNum, audit.date, audit.phaseId, selected.id);
                    setOfficerQuery('');
                    setIsDropdownOpen(false);
                  }
                }}
                className={`w-full px-3 py-1.5 rounded-lg text-[10px] font-bold border-2 transition-all outline-none ${
                  !canUseAssignOthers
                    ? 'bg-slate-50 border-slate-200 text-slate-400 cursor-not-allowed'
                    : 'bg-white border-indigo-100 text-indigo-600 focus:border-indigo-300'
                }`}
              />

              {canUseAssignOthers && isDropdownOpen && (
                <div className="absolute z-30 mt-1 w-full max-h-44 overflow-auto rounded-lg border border-indigo-100 bg-white shadow-lg">
                  {filteredEligibleOfficers.length > 0 ? (
                    filteredEligibleOfficers.map(u => (
                      <button
                        key={u.id}
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => {
                          onAssign(audit.id, slotNum, audit.date, audit.phaseId, u.id);
                          setOfficerQuery('');
                          setIsDropdownOpen(false);
                        }}
                        className="w-full text-left px-3 py-1.5 text-[10px] font-bold text-slate-700 hover:bg-indigo-50 hover:text-indigo-700 transition-colors"
                        title={u.name}
                      >
                        {u.name}
                      </button>
                    ))
                  ) : (
                    <div className="px-3 py-2 text-[10px] text-slate-400 font-medium">
                      No matching QAI
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
          <button 
            onClick={() => onAssign(audit.id, slotNum, audit.date, audit.phaseId)}
            disabled={isDisabled}
            className={`w-full flex items-center justify-center gap-2 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${
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
