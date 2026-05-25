import React from 'react';
import { Clock, GraduationCap, Archive, Mail, Users } from 'lucide-react';
import { User, Location, Department, AuditSchedule, Building } from '@shared/types';
import { AdminStatCard, DataGapCard } from './Widgets';

interface AdminSectionProps {
  awaitingApprovals: AuditSchedule[];
  pendingDeletions: Location[];
  certWatch: { expired: User[]; expiringSoon: User[] };
  auditGaps: { date: AuditSchedule[]; auditors: AuditSchedule[] };
  incompleteUsers: User[];
  renewalRequests: User[];
  approvalReminderAuditIds: Set<string>;
  canResendReminder: (date: string | null) => boolean;
  locations: Location[];
  departments: Department[];
  onSendEmail?: (id: string) => void;
  onApproveArchive?: (id: string) => void;
  onRejectArchive?: (id: string) => void;
  onApproveCert?: (u: User) => void;
  getBuildingAbbr: (id?: string | null) => string;
}

export const AdminSection: React.FC<AdminSectionProps> = ({
  awaitingApprovals, pendingDeletions, certWatch, auditGaps, incompleteUsers,
  renewalRequests, approvalReminderAuditIds, canResendReminder,
  locations, departments, onSendEmail, onApproveArchive, onRejectArchive,
  onApproveCert, getBuildingAbbr,
}) => (
  <div className="space-y-6">

    {/* Certificate Renewal Requests */}
    {renewalRequests.length > 0 && (
      <div className="rounded-3xl border border-slate-200 bg-white shadow-sm p-6">
        <h3 className="text-sm font-black text-slate-900 mb-4 flex items-center gap-2">
          <GraduationCap className="w-4 h-4 text-blue-500" />
          Certificate Renewal Requests ({renewalRequests.length})
        </h3>
        <div className="space-y-2">
          {renewalRequests.map(u => (
            <div key={u.id} className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-100">
              <div>
                <p className="text-sm font-bold text-slate-800">{u.name}</p>
                <p className="text-xs text-slate-500">{departments.find(d => d.id === u.departmentId)?.name} · Applied: {u.renewalRequested ? new Date(u.renewalRequested).toLocaleDateString() : '—'}</p>
              </div>
              {onApproveCert && <button onClick={() => onApproveCert(u)} className="px-3 py-1.5 rounded-lg bg-blue-50 text-blue-600 text-xs font-bold hover:bg-blue-100">Approve</button>}
            </div>
          ))}
        </div>
      </div>
    )}

    {/* Pending Audit Approvals */}
    {awaitingApprovals.length > 0 && (
      <div className="rounded-3xl border border-slate-200 bg-white shadow-sm p-6">
        <h3 className="text-sm font-black text-slate-900 mb-4 flex items-center gap-2">
          <Clock className="w-4 h-4 text-amber-500" />
          Pending Audit Approvals ({awaitingApprovals.length})
        </h3>
        <div className="space-y-2 max-h-80 overflow-y-auto">
          {awaitingApprovals.map(a => {
            const loc = locations.find(l => l.id === a.locationId);
            const dept = departments.find(d => d.id === a.departmentId);
            const wasSent = approvalReminderAuditIds.has(a.id);
            const canResend = canResendReminder(a.date);
            return (
              <div key={a.id} className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-100">
                <div><p className="text-sm font-bold text-slate-800">{loc?.name || 'Unknown'}</p><p className="text-xs text-slate-500">{dept?.name} · {a.date || 'No date'}</p></div>
                <div className="flex gap-2">
                  {onSendEmail && (wasSent ? (canResend
                    ? <button onClick={() => onSendEmail(a.id)} className="px-3 py-1.5 rounded-lg bg-amber-50 text-amber-600 text-xs font-bold hover:bg-amber-100"><Mail className="w-3 h-3 inline mr-1" />Resend Reminder</button>
                    : <span className="text-[10px] text-slate-400 font-medium">Reminder sent</span>
                  ) : <button onClick={() => onSendEmail(a.id)} className="px-3 py-1.5 rounded-lg bg-blue-50 text-blue-600 text-xs font-bold hover:bg-blue-100"><Mail className="w-3 h-3 inline mr-1" />Send Reminder</button>)}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    )}

    {/* Certification Watch */}
    {(certWatch.expired.length > 0 || certWatch.expiringSoon.length > 0) && (
      <div className="rounded-3xl border border-red-100 bg-white shadow-sm p-6">
        <h3 className="text-sm font-black text-slate-900 mb-4 flex items-center gap-2"><GraduationCap className="w-4 h-4 text-red-500" />Certification Watch</h3>
        {certWatch.expired.length > 0 && (
          <div className="mb-3">
            <p className="text-xs font-bold text-red-600 mb-1">Expired ({certWatch.expired.length})</p>
            {certWatch.expired.slice(0, 3).map(u => (
              <div key={u.id} className="flex items-center justify-between py-1.5 px-2 rounded-lg bg-red-50 text-xs"><span className="font-bold text-red-700">{u.name}</span><span className="text-red-500">Expired: {u.certificationExpiry}</span></div>))}
          </div>)}
        {certWatch.expiringSoon.length > 0 && (
          <div>
            <p className="text-xs font-bold text-amber-600 mb-1">Expiring Soon ({certWatch.expiringSoon.length})</p>
            {certWatch.expiringSoon.slice(0, 3).map(u => (
              <div key={u.id} className="flex items-center justify-between py-1.5 px-2 rounded-lg bg-amber-50 text-xs"><span className="font-bold text-amber-700">{u.name}</span><span className="text-amber-500">Expires: {u.certificationExpiry}</span>{onApproveCert && <button onClick={() => onApproveCert(u)} className="px-2 py-0.5 rounded bg-amber-200 text-amber-800 font-bold hover:bg-amber-300 text-[10px]">Renew</button>}</div>))}
          </div>)}
      </div>
    )}

    {/* Archive Queue */}
    {pendingDeletions.length > 0 && (
      <div className="rounded-3xl border border-slate-200 bg-white shadow-sm p-6">
        <h3 className="text-sm font-black text-slate-900 mb-4 flex items-center gap-2"><Archive className="w-4 h-4 text-purple-500" />Archive Approval Queue ({pendingDeletions.length})</h3>
        <div className="space-y-2">
          {pendingDeletions.slice(0, 5).map(loc => (
            <div key={loc.id} className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-100">
              <div><p className="text-sm font-bold text-slate-800">{loc.name}</p><p className="text-xs text-slate-500">{getBuildingAbbr(loc.buildingId)} · {loc.totalAssets || 0} assets</p></div>
              <div className="flex gap-2">
                {onApproveArchive && <button onClick={() => onApproveArchive(loc.id)} className="px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-600 text-xs font-bold hover:bg-emerald-100">Approve</button>}
                {onRejectArchive && <button onClick={() => onRejectArchive(loc.id)} className="px-3 py-1.5 rounded-lg bg-red-50 text-red-600 text-xs font-bold hover:bg-red-100">Reject</button>}
              </div>
            </div>))}
        </div>
      </div>
    )}
  </div>
);
