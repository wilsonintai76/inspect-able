import React from 'react';
import {
  AuditSchedule, User, Department, Location, AuditPhase, Building as BuildingType,
} from '@shared/types';
import { AuditorAssignmentSlot } from '../AuditorAssignmentSlot';
import {
  Calendar, Lock, Unlock, Building, Layers, Package,
  AlertTriangle, Phone, UserCheck, RotateCcw, FileText, ExternalLink,
} from 'lucide-react';

export interface AuditTableRowProps {
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
  isAuditor: boolean;
  hasFieldRole: boolean;
  isCertified: boolean;
  assignmentMode: 'cross-audit' | 'open-audit';
  // Helper functions
  isAuditLocked: (audit: AuditSchedule) => boolean;
  isDateInValidPhase: (dateStr: string, phaseId: string) => boolean;
  getBuildingAbbr: (buildingId?: string | null, buildingName?: string) => string;
  getEntityName: (deptId: string) => string;
  getUserContact: (userId: string) => string | undefined;
  canAuditDepartment: (targetDeptId: string) => boolean;
  getStatusBadgeStyles: (status: string) => string;
  // Event handlers
  onDateChange: (id: string, newDate: string, phaseId: string) => void;
  onToggleLock: (id: string) => void;
  onAssign: (auditId: string, slot: 1 | 2, date: string, phaseId: string, manualUserId?: string) => void;
  onUnassign: (id: string, slot: 1 | 2) => void;
  onSetReportAudit: (audit: AuditSchedule) => void;
  onSetUploadAudit: (audit: AuditSchedule) => void;
}

export const AuditTableRow: React.FC<AuditTableRowProps> = ({
  audit, users, currentUser, allDepartments, allLocations, buildings, schedules,
  todayStr, canEditDates, canSelfAssignPerm, canAssignOthers, hasPhases, auditPhases,
  maxAssetsPerDay, canSelfAssignSelf, isAdmin, isCoordinator, isSupervisor, isAuditor,
  hasFieldRole, isCertified, assignmentMode,
  isAuditLocked, isDateInValidPhase, getBuildingAbbr, getEntityName, getUserContact,
  canAuditDepartment, getStatusBadgeStyles,
  onDateChange, onToggleLock, onAssign, onUnassign, onSetReportAudit, onSetUploadAudit,
}) => {
  const loc = allLocations.find(l => l.id === audit.locationId);
  const isCurrentUserAssigned = audit.auditor1Id === currentUser?.id || audit.auditor2Id === currentUser?.id;

  const auditsOnDate = schedules.filter(
    s => s.date === audit.date && (s.auditor1Id === currentUser?.id || s.auditor2Id === currentUser?.id)
  );
  const totalAssetsOnDate = auditsOnDate.reduce((sum, s) => {
    const l = allLocations.find(loc => loc.id === s.locationId);
    return sum + (l?.totalAssets || 0);
  }, 0);
  const isUserOverLimit = !isCurrentUserAssigned && (totalAssetsOnDate + (loc?.totalAssets || 0) > maxAssetsPerDay);

  const isPast = !!(audit.date && audit.date < todayStr);
  const userCanAudit = canAuditDepartment(audit.departmentId);
  const isDateValid = isDateInValidPhase(audit.date, audit.phaseId);
  const locationLevel = loc?.level;
  const isLocked = isAuditLocked(audit);
  const canLock = isAdmin || isSupervisor;
  const allFieldsSet = !!(audit.date && audit.supervisorId && audit.auditor1Id && audit.auditor2Id);
  const canToggleLock = isLocked || allFieldsSet;

  return (
    <tr className={`hover:bg-slate-50/50 transition-colors ${isLocked ? 'bg-slate-50/30 opacity-90' : ''}`}>

      {/* ── Date Cell ── */}
      <td className="px-5 py-4 align-top sticky left-0 bg-white z-10 border-r border-slate-100 w-64">
        <div className="flex flex-col gap-1.5">
          <div className="relative group flex items-center gap-1.5">
            <div className="relative flex-1 min-w-[130px]">
              <Calendar className={`absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 pointer-events-none z-10 ${!audit.date ? 'text-amber-500' : 'text-slate-400'}`} />
              <input
                type="date"
                title="Audit Date"
                placeholder="YYYY-MM-DD"
                value={audit.date || ''}
                disabled={!hasPhases || !canEditDates}
                onChange={(e) => onDateChange(audit.id, e.target.value, audit.phaseId)}
                className={`w-full pl-8 pr-2 py-1.5 rounded-lg text-xs font-bold border outline-none transition-all ${
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
                    onDateChange(audit.id, today, audit.phaseId);
                  } else if (phase) {
                    onDateChange(audit.id, phase.startDate, audit.phaseId);
                  }
                }}
                className="shrink-0 px-2 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-all shadow-md shadow-blue-500/20 text-[9px] font-black uppercase tracking-widest active:scale-95"
                title="Quick Pick: Set to Today or Phase Start"
              >
                Pick
              </button>
            )}

            {canLock && (
              <button
                disabled={!canToggleLock}
                onClick={() => {
                  if (!isLocked) {
                    if (!window.confirm(`Lock inspection for "${loc?.name || audit.locationId}"?\n\nThis will freeze the date and all assignments. Only an Admin or Supervisor can unlock it.`)) return;
                  }
                  onToggleLock(audit.id);
                }}
                className={`shrink-0 w-8 h-8 flex items-center justify-center rounded-lg transition-all border ${
                  isLocked
                    ? 'bg-slate-800 border-slate-700 text-amber-400 shadow-md'
                    : !canToggleLock
                    ? 'bg-slate-50 border-slate-100 text-slate-200 cursor-not-allowed'
                    : 'bg-white border-slate-200 text-slate-400 hover:border-slate-300 hover:bg-slate-50'
                }`}
                title={
                  isLocked
                    ? 'Unlock Inspection'
                    : !canToggleLock
                    ? 'Fill all fields (date, supervisor, 2 officers) before locking'
                    : 'Lock Inspection — Freezes date & assignments'
                }
              >
                {isLocked ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
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

      {/* ── Location Cell ── */}
      <td className="px-5 py-4 align-top sticky left-64 bg-white z-10 border-r border-slate-100 w-72">
        <div className="flex flex-col gap-1.5">
          <div className="font-bold text-slate-900 text-sm">{loc?.name || audit.locationId}</div>

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
              <div
                className="flex items-center gap-1.5 px-2 py-1 bg-amber-50 text-amber-700 border border-amber-100 rounded-lg animate-pulse"
                title="Warning: This location has 0 documented assets. Rebalancing will use equal-distribution fallback."
              >
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
            if (!isAtRisk) return null;
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
          })()}
        </div>
      </td>

      {/* ── Site Supervisor Cell ── */}
      <td className="px-5 py-4 align-top">
        <div className="flex flex-col gap-2">
          {(() => {
            const supervisorIds = audit.supervisorId
              ? audit.supervisorId.split(',').map(id => id.trim()).filter(Boolean)
              : [];
            if (supervisorIds.length === 0) {
              return <span className="text-[10px] text-slate-400 italic">Unassigned (Manage via Locations)</span>;
            }
            return supervisorIds.map(supId => {
              const supervisor = users.find(u => u.id === supId);
              const contact = supervisor?.contactNumber || loc?.contact || '';
              return (
                <div key={supId} className="flex flex-col gap-0.5 border-l-2 border-slate-200 pl-2">
                  <div className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                    <div className="w-5 h-5 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 border border-slate-200 shrink-0">
                      <UserCheck className="w-3 h-3" />
                    </div>
                    <span className="truncate max-w-37.5">{supervisor?.name || supId}</span>
                  </div>
                  {contact && (
                    <div className="text-[9px] text-slate-500 font-medium pl-6 flex items-center gap-1">
                      <Phone className="w-2.5 h-2.5 opacity-70" />
                      {contact}
                    </div>
                  )}
                </div>
              );
            });
          })()}
        </div>
      </td>

      {/* ── Inspecting Officers Cell ── */}
      <td className="px-5 py-4 align-top">
        <div className="space-y-3">
          {([1, 2] as const).map(slotNum => (
            <AuditorAssignmentSlot
              key={slotNum}
              slotNum={slotNum}
              audit={audit}
              users={users}
              currentUser={currentUser ?? null}
              allDepartments={allDepartments}
              canManageAssignments={(canEditDates || canSelfAssignPerm || canAssignOthers || canSelfAssignSelf) && !isLocked}
              canAssignOthers={canAssignOthers && !isLocked}
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
              isAuditor={isAuditor}
              onAssign={onAssign}
              onUnassign={onUnassign}
              getUserContact={getUserContact}
              getEntityName={getEntityName}
              maxAssetsPerDay={maxAssetsPerDay}
              assignmentMode={assignmentMode}
            />
          ))}
        </div>
      </td>

      {/* ── Status Cell ── */}
      <td className="px-5 py-4 align-top text-center">
        {(() => {
          const canComplete = isAdmin || isCoordinator || (isCurrentUserAssigned && isCertified && isAuditor);
          return (
            <button
              onClick={() => {
                if (audit.status === 'In Progress' || audit.status === 'Completed') {
                  onSetUploadAudit(audit);
                }
              }}
              disabled={!canComplete || audit.status === 'Pending'}
              className={`inline-flex items-center px-4 py-2 rounded-xl text-[10px] font-black uppercase border tracking-widest transition-all active:scale-95 ${getStatusBadgeStyles(audit.status)} ${!canComplete ? 'opacity-50 pointer-events-none' : ''}`}
            >
              {audit.status}
              {canComplete && audit.status !== 'Pending' && <RotateCcw className="w-2 h-2 ml-2 opacity-40" />}
            </button>
          );
        })()}
      </td>

      {/* ── Actions Cell ── */}
      <td className="px-5 py-4 align-top text-center">
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
              onClick={() => onSetReportAudit(audit)}
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
};
