import React from 'react';
import { AlertTriangle, MapPin, Mail, Eye } from 'lucide-react';
import { AuditSchedule, Location } from '@shared/types';

interface SupervisorSectionProps {
  supervisorApprovals: AuditSchedule[];
  supervisorLocationAudits: AuditSchedule[];
  approvalReminderAuditIds: Set<string>;
  canResendReminder: (date: string | null) => boolean;
  locations: Location[];
  onSendEmail?: (id: string) => void;
  onNavigateToSchedule?: (auditId?: string) => void;
}

export const SupervisorSection: React.FC<SupervisorSectionProps> = ({
  supervisorApprovals, supervisorLocationAudits, approvalReminderAuditIds,
  canResendReminder, locations, onSendEmail, onNavigateToSchedule,
}) => (
  <div className="space-y-4">
    {supervisorApprovals.length > 0 && (
      <div className="rounded-3xl border border-amber-100 bg-amber-50/50 shadow-sm p-6">
        <h3 className="text-sm font-black text-slate-900 mb-4 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-500" />Pending Your Approval ({supervisorApprovals.length})
        </h3>
        <p className="text-xs text-slate-500 mb-3">Auto-sent on completion; use Resend if no reply.</p>
        <div className="space-y-2 max-h-80 overflow-y-auto">
          {supervisorApprovals.map(a => {
            const loc = locations.find(l => l.id === a.locationId);
            const wasSent = approvalReminderAuditIds.has(a.id);
            const canResend = canResendReminder(a.date);
            return (
              <div key={a.id} className="flex items-center justify-between p-3 rounded-xl bg-white border border-amber-100">
                <div><p className="text-sm font-bold text-slate-800">{loc?.name || 'Unknown'}</p><p className="text-xs text-slate-500">{a.date || 'No date'}</p></div>
                <div>{onSendEmail && (wasSent ? (canResend
                  ? <button onClick={() => onSendEmail(a.id)} className="px-3 py-1.5 rounded-lg bg-amber-100 text-amber-700 text-xs font-bold hover:bg-amber-200">Resend Reminder</button>
                  : <span className="text-[10px] text-slate-400 font-medium">Sent</span>
                ) : <button onClick={() => onSendEmail(a.id)} className="px-3 py-1.5 rounded-lg bg-amber-100 text-amber-700 text-xs font-bold hover:bg-amber-200">Send Reminder</button>)}</div>
              </div>);
          })}
        </div>
      </div>
    )}
    <div className="rounded-3xl border border-slate-200 bg-white shadow-sm p-6">
      <h3 className="text-sm font-black text-slate-900 mb-3 flex items-center gap-2"><MapPin className="w-4 h-4 text-blue-500" />Inspections at Your Locations ({supervisorLocationAudits.length})</h3>
      <div className="space-y-2 max-h-80 overflow-y-auto">
        {supervisorLocationAudits.filter(a => a.status !== 'Completed').map(a => {
          const loc = locations.find(l => l.id === a.locationId);
          return (
            <div key={a.id} className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-100">
              <div><p className="text-sm font-bold text-slate-800">{loc?.name || 'Unknown'}</p><p className="text-xs text-slate-500">{a.date || 'No date'} · {a.status}</p></div>
              <div className="flex items-center gap-2">
                <span className={`px-2 py-0.5 rounded-lg text-[10px] font-bold ${a.status === 'In Progress' ? 'bg-blue-50 text-blue-600' : a.status === 'Awaiting Approval' ? 'bg-amber-50 text-amber-600' : 'bg-slate-100 text-slate-500'}`}>{a.status}</span>
                {onNavigateToSchedule && (
                  <button
                    onClick={() => onNavigateToSchedule(a.id)}
                    className="px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-bold hover:bg-blue-700 transition-all flex items-center gap-1.5 active:scale-95 shadow-sm"
                    title="Go to inspection slot — approve or counter-propose date"
                  >
                    <Eye className="w-3 h-3" />
                    View
                  </button>
                )}
              </div>
            </div>);
        })}
        {supervisorLocationAudits.filter(a => a.status !== 'Completed').length === 0 && (
          <p className="text-xs text-slate-400 italic text-center py-3">No upcoming inspections at your locations.</p>
        )}
      </div>
    </div>
  </div>
);
