import React, { useState } from 'react';
import {
  AuditSchedule, User, Department, Location, AuditPhase, Building as BuildingType,
} from '@shared/types';
import { AuditorAssignmentSlot } from '../AuditorAssignmentSlot';
import {
  Calendar, Lock, Unlock, Building, Layers, Package,
  AlertTriangle, Phone, UserCheck, RotateCcw, Upload,
  ExternalLink, MapPin, ChevronDown, ChevronUp, Boxes,
} from 'lucide-react';

/** Normalize date to YYYY-MM-DD */
const norm = (d: string): string => {
  if (!d) return d;
  if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
  const parts = d.split('/');
  if (parts.length === 3 && parts[2]?.length === 4)
    return `${parts[2]}-${parts[1].padStart(2,'0')}-${parts[0].padStart(2,'0')}`;
  return d;
};

const formatDateDisplay = (dateStr: string | null | undefined): string => {
  if (!dateStr) return '';
  try {
    const [y, m, d] = dateStr.split('-');
    return `${d}/${m}/${y}`;
  } catch { return dateStr; }
};

// Re-export the same props interface as AuditTableRow so we can use it directly
export interface AuditCardProps {
  audit: AuditSchedule;
  users: User[];
  currentUser: User | undefined;
  allDepartments: Department[];
  allLocations: Location[];
  buildings: BuildingType[];
  schedules: AuditSchedule[];
  todayStr: string;
  canEditDates: boolean;
  canSelfAssignPerm: boolean;
  canAssignOthers: boolean;
  hasPhases: boolean;
  auditPhases: AuditPhase[];
  maxAssetsPerDay: number;
  canSelfAssignSelf: boolean;
  isAdmin: boolean;
  isCoordinator: boolean;
  isSupervisor: boolean;
  isInspector: boolean;
  hasFieldRole: boolean;
  isCertified: boolean;
  canSendApprovalReminder: boolean;
  hasSentApprovalReminder: boolean;
  isAuditLocked: (audit: AuditSchedule) => boolean;
  isDateInValidPhase: (dateStr: string, phaseId: string) => boolean;
  getBuildingAbbr: (buildingId?: string | null, buildingName?: string) => string;
  getUserContact: (userId: string) => string | undefined;
  canAuditDepartment: (targetDeptId: string) => boolean;
  getStatusBadgeStyles: (status: string) => string;
  onDateChange: (id: string, newDate: string, phaseId: string) => void;
  onToggleLock: (id: string) => void;
  onAssign: (auditId: string, slot: 1 | 2, date: string, phaseId: string, manualUserId?: string) => void;
  onUnassign: (id: string, slot: 1 | 2) => void;
  onSetUploadAudit: (audit: AuditSchedule) => void;
  onSetStatusAudit: (audit: AuditSchedule) => void;
  onRevertCompleted: (id: string) => void;
  onDeleteAudit?: (id: string) => void;
}

export const AuditCard: React.FC<AuditCardProps> = ({
  audit, users, currentUser, allDepartments, allLocations, buildings, schedules,
  todayStr, canEditDates, canSelfAssignPerm, canAssignOthers, hasPhases, auditPhases,
  maxAssetsPerDay, canSelfAssignSelf, isAdmin, isCoordinator, isSupervisor, isInspector,
  hasFieldRole, isCertified, isAuditLocked, isDateInValidPhase, getBuildingAbbr, getUserContact,
  canAuditDepartment, getStatusBadgeStyles,
  onDateChange, onToggleLock, onAssign, onUnassign, onSetUploadAudit, onSetStatusAudit, onRevertCompleted,
}) => {
  const [expanded, setExpanded] = useState(false);
  const [editingDate, setEditingDate] = useState(false);
  const dateInputRef = React.useRef<HTMLInputElement>(null);

  const loc = allLocations.find(l => l.id === audit.locationId);
  const isCurrentUserAssigned = audit.auditor1Id === currentUser?.id || audit.auditor2Id === currentUser?.id;
  const isDesignatedSupervisor = audit.supervisorId
    ? audit.supervisorId.split(',').map(id => id.trim()).includes(currentUser?.id || '')
    : false;

  const isLocked = isAuditLocked(audit);
  const isEffectivelyLocked = isLocked || audit.status === 'In Progress' || audit.status === 'Completed';
  const isOwnDept = currentUser?.departmentId === audit.departmentId;
  const isPrivileged = isAdmin || ((isCoordinator || isSupervisor) && isOwnDept);
  const canAssignOthersHere = canAssignOthers && (!isCoordinator || isOwnDept);
  const userCanAudit = canAuditDepartment(audit.departmentId);
  const canEditThisDate = canEditDates && (isPrivileged || (!isLocked && audit.status !== 'Completed'));
  const isPast = !!(audit.date && audit.date < todayStr);
  const canComplete = isAdmin || (isCoordinator && isOwnDept) || (isCertified && isCurrentUserAssigned);
  const allFieldsSet = !!(audit.date && audit.supervisorId && audit.auditor1Id && audit.auditor2Id);
  const canToggleLock = isEffectivelyLocked || allFieldsSet;
  const canLock = isAdmin || isCoordinator || isSupervisor || isInspector;
  const isDateValid = !audit.date || auditPhases.some(p => norm(audit.date!) >= norm(p.startDate) && norm(audit.date!) <= norm(p.endDate));

  const dateMin = auditPhases.length > 0
    ? auditPhases.reduce((min, p) => p.startDate < min ? p.startDate : min, auditPhases[0].startDate)
    : undefined;
  const dateMax = auditPhases.length > 0
    ? auditPhases.reduce((max, p) => p.endDate > max ? p.endDate : max, auditPhases[0].endDate)
    : undefined;

  const auditsOnDate = schedules.filter(
    s => s.date === audit.date && (s.auditor1Id === currentUser?.id || s.auditor2Id === currentUser?.id)
  );
  const totalAssetsOnDate = auditsOnDate.reduce((sum, s) => {
    const l = allLocations.find(loc => loc.id === s.locationId);
    return sum + (l?.totalAssets || 0);
  }, 0);
  const isUserOverLimit = !isCurrentUserAssigned && (totalAssetsOnDate + (loc?.totalAssets || 0) > maxAssetsPerDay);

  const commitDateEdit = (newDate: string) => {
    if (newDate) {
      const isValid = isDateInValidPhase(newDate, audit.phaseId);
      if (!isValid) {
        alert('Selected date must fall within any configured audit phase.');
        setEditingDate(false);
        return;
      }
    }
    onDateChange(audit.id, newDate, audit.phaseId);
    setEditingDate(false);
  };

  // Status badge colour
  const statusBadge = getStatusBadgeStyles(audit.status);

  // Card header accent colour by status
  const accentBar =
    audit.status === 'Completed'
      ? 'bg-emerald-500'
      : audit.status === 'In Progress'
      ? 'bg-blue-500'
      : 'bg-slate-200';

  const bDisplay = getBuildingAbbr(loc?.buildingId, loc?.building);
  const deptName = allDepartments.find(d => d.id === audit.departmentId)?.name || audit.departmentId;

  const supervisorIds = audit.supervisorId
    ? audit.supervisorId.split(',').map(id => id.trim()).filter(Boolean)
    : [];

  return (
    <div
      className={`bg-white rounded-2xl border shadow-sm overflow-hidden transition-all ${
        isEffectivelyLocked ? 'border-slate-200 opacity-90' : 'border-slate-200'
      }`}
    >
      {/* Top accent bar */}
      <div className={`h-1 w-full ${accentBar}`} />

      {/* Card header — always visible */}
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          {/* Location info */}
          <div className="min-w-0 flex-1">
            <div className="font-bold text-slate-900 text-sm leading-tight truncate">
              {loc?.name || audit.locationId}
            </div>
            <div className="flex items-center flex-wrap gap-1.5 mt-1">
              {bDisplay && (
                <span className="flex items-center gap-1 text-[10px] text-slate-400 font-medium">
                  <Building className="w-3 h-3 opacity-50 text-blue-400" />
                  {bDisplay}
                </span>
              )}
              {loc?.abbr && (
                <span className="flex items-center gap-1 text-[10px] text-slate-400 font-medium">
                  <MapPin className="w-3 h-3 opacity-50 text-indigo-400" />
                  {loc.abbr}
                </span>
              )}
              {loc?.level && (
                <span className="flex items-center gap-1 text-[10px] text-slate-400 font-medium">
                  <Layers className="w-3 h-3 opacity-50" />
                  {loc.level}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
              <span className="px-2 py-0.5 bg-slate-100 text-slate-500 text-[9px] font-black uppercase rounded-lg border border-slate-200 tracking-wider">
                {deptName}
              </span>
              {(loc?.totalAssets || 0) > 0 && (
                <span className="px-2 py-0.5 rounded-md bg-slate-100 text-[9px] text-slate-500 font-bold border border-slate-200 flex items-center gap-1">
                  <Package className="w-2.5 h-2.5" /> {(loc!.totalAssets || 0).toLocaleString()}
                </span>
              )}
            </div>
          </div>

          {/* Status + lock */}
          <div className="flex flex-col items-end gap-2 shrink-0">
            <span className={`inline-flex items-center px-2.5 py-1 rounded-xl text-[9px] font-black uppercase border tracking-widest whitespace-nowrap ${statusBadge}`}>
              {audit.status === 'Completed' ? 'Done' : audit.status}
            </span>
            {isLocked && (
              <span className="flex items-center gap-1 px-1.5 py-0.5 bg-slate-800 text-white text-[8px] font-black uppercase rounded shadow-sm">
                <Lock className="w-2 h-2" /> Locked
              </span>
            )}
          </div>
        </div>

        {/* Date row */}
        <div className="flex items-center gap-2 mt-3">
          <div className="relative flex-1">
            <Calendar className={`absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 pointer-events-none z-10 ${!audit.date ? 'text-amber-500' : 'text-slate-400'}`} />
            {editingDate ? (
              <input
                ref={dateInputRef}
                type="date"
                min={dateMin}
                max={dateMax}
                defaultValue={audit.date || ''}
                autoFocus
                onBlur={() => setEditingDate(false)}
                onChange={(e) => commitDateEdit(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Escape') setEditingDate(false); }}
                className="w-full pl-8 pr-2 py-2 rounded-xl text-xs font-bold border-2 border-blue-400 bg-blue-50/30 text-slate-900 outline-none"
              />
            ) : (
              <button
                onClick={() => { if (canEditThisDate && hasPhases) { setEditingDate(true); setTimeout(() => dateInputRef.current?.focus(), 0); } }}
                disabled={!canEditThisDate || !hasPhases}
                className={`w-full pl-8 pr-2 py-2 rounded-xl text-xs font-bold border text-left transition-all ${
                  !canEditThisDate || !hasPhases
                    ? 'bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed'
                    : !audit.date
                    ? 'bg-amber-50 border-amber-100 text-amber-600 hover:border-amber-300 cursor-pointer'
                    : 'bg-slate-50 border-slate-200 text-slate-900 hover:bg-white hover:border-blue-300 cursor-pointer'
                }`}
              >
                {audit.date ? formatDateDisplay(audit.date) : <span className="text-slate-400">DD/MM/YYYY</span>}
              </button>
            )}
          </div>

          {/* Quick pick */}
          {!isLocked && canEditThisDate && hasPhases && !audit.date && (
            <button
              onClick={() => {
                const today = new Date().toISOString().split('T')[0];
                const isTodayValid = auditPhases.some(p => {
                  const start = new Date(p.startDate); start.setHours(0,0,0,0);
                  const end = new Date(p.endDate); end.setHours(23,59,59,999);
                  const d = new Date(today);
                  return d >= start && d <= end;
                });
                onDateChange(audit.id, isTodayValid ? today : auditPhases[0].startDate, audit.phaseId);
              }}
              className="shrink-0 px-2.5 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-all shadow-md shadow-blue-500/20 text-[9px] font-black uppercase tracking-widest active:scale-95"
            >
              Pick
            </button>
          )}

          {/* Lock / unlock */}
          {canLock && (
            <button
              disabled={!canToggleLock}
              onClick={() => {
                if (!isEffectivelyLocked) {
                  if (!window.confirm(`Lock inspection for "${loc?.name || audit.locationId}"?`)) return;
                }
                onToggleLock(audit.id);
              }}
              className={`shrink-0 w-9 h-9 flex items-center justify-center rounded-xl transition-all border ${
                isEffectivelyLocked
                  ? 'bg-rose-500 border-rose-400 text-white shadow-md shadow-rose-500/30'
                  : allFieldsSet
                  ? 'bg-emerald-500 border-emerald-400 text-white shadow-md shadow-emerald-500/30 hover:bg-emerald-600 active:scale-95'
                  : 'bg-slate-50 border-slate-100 text-slate-200 cursor-not-allowed'
              }`}
            >
              {isEffectivelyLocked ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
            </button>
          )}

          {/* Expand toggle */}
          <button
            onClick={() => setExpanded(e => !e)}
            className="shrink-0 w-9 h-9 flex items-center justify-center rounded-xl border border-slate-200 text-slate-400 hover:bg-slate-50 active:scale-95 transition-all"
          >
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Expanded content */}
      {expanded && (
        <div className="border-t border-slate-100 px-4 pb-4 pt-3 space-y-4 animate-in slide-in-from-top-2 duration-200">

          {/* Site Supervisor */}
          <div>
            <p className="text-[9px] font-black uppercase text-slate-400 tracking-widest mb-2">Site Supervisor</p>
            {supervisorIds.length === 0 ? (
              <span className="text-[10px] text-slate-400 italic">Unassigned (Manage via Locations)</span>
            ) : (
              <div className="space-y-1.5">
                {supervisorIds.map(supId => {
                  const supervisor = users.find(u => u.id === supId);
                  const contact = supervisor?.contactNumber || loc?.contact || '';
                  return (
                    <div key={supId} className="flex flex-col gap-0.5 border-l-2 border-slate-200 pl-2">
                      <div className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                        <div className="w-5 h-5 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 border border-slate-200 shrink-0">
                          <UserCheck className="w-3 h-3" />
                        </div>
                        <span className="truncate">{supervisor?.name || supId}</span>
                      </div>
                      {contact && (
                        <div className="text-[9px] text-slate-500 font-medium pl-6 flex items-center gap-1">
                          <Phone className="w-2.5 h-2.5 opacity-70" />
                          {contact}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Inspecting Officers */}
          <div>
            <p className="text-[9px] font-black uppercase text-slate-400 tracking-widest mb-2">Inspecting Officers</p>
            <div className="space-y-2">
              {([1, 2] as const).map(slotNum => (
                <AuditorAssignmentSlot
                  key={slotNum}
                  slotNum={slotNum}
                  audit={audit}
                  users={users}
                  currentUser={currentUser ?? null}
                  canManageAssignments={(canEditDates || canSelfAssignPerm || canAssignOthers || canSelfAssignSelf) && !isLocked}
                  canAssignOthers={canAssignOthersHere && !isLocked}
                  isAdmin={isAdmin}
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
                  isInspector={isInspector}
                  onAssign={onAssign}
                  onUnassign={onUnassign}
                  getUserContact={getUserContact}
                  maxAssetsPerDay={maxAssetsPerDay}
                />
              ))}
            </div>
          </div>

          {/* Status actions */}
          <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-100">
            {audit.status === 'In Progress' && canComplete && (
              <button
                onClick={() => onSetUploadAudit(audit)}
                className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 text-white rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-blue-700 transition-all shadow-md shadow-blue-500/25 active:scale-95"
              >
                <Upload className="w-3.5 h-3.5" />
                Upload KEW-PA 11
              </button>
            )}
            {audit.status === 'Completed' && canComplete && (
              <>
                <button
                  onClick={() => onSetUploadAudit(audit)}
                  className="flex items-center gap-1 text-[9px] text-emerald-600 font-bold hover:underline"
                >
                  <RotateCcw className="w-2.5 h-2.5" />
                  Re-upload
                </button>
                <button
                  onClick={() => { if (window.confirm('Revert to In Progress?')) onRevertCompleted(audit.id); }}
                  className="flex items-center gap-1 text-[9px] text-amber-600 font-bold hover:underline"
                >
                  ↩ Undo
                </button>
              </>
            )}
            {audit.status === 'Completed' && audit.reportPath &&
              (audit.reportPath.startsWith('http') || audit.reportPath.startsWith('/')) && (
              <a
                href={audit.reportPath}
                target="_blank"
                rel="noreferrer"
                className="w-8 h-8 flex items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 hover:bg-emerald-100 border border-emerald-100"
              >
                <ExternalLink className="w-4 h-4" />
              </a>
            )}
            {audit.status === 'Completed' && (
              <button
                onClick={() => onSetStatusAudit(audit)}
                className="w-8 h-8 flex items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 hover:bg-emerald-100 border border-emerald-100"
                title="Edit Asset Status Breakdown"
              >
                <Boxes className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
