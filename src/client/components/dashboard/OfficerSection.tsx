import React from 'react';
import { Calendar, CheckCircle2, Clock, TrendingUp, Package, UploadCloud, GraduationCap } from 'lucide-react';
import { AuditSchedule, User, Location, Department } from '@shared/types';
import { StatCard } from './Widgets';

interface OfficerSectionProps {
  myAudits: AuditSchedule[];
  officerStats: { total: number; completed: number; inProgress: number; pending: number; completionRate: number; workload: number };
  currentUser: User;
  locations: Location[];
  departments: Department[];
  onRequestRenewal?: () => void;
  onUpload?: (audit: AuditSchedule) => void;
}

export const OfficerSection: React.FC<OfficerSectionProps> = ({
  myAudits, officerStats, currentUser, locations, departments, onRequestRenewal, onUpload,
}) => (
  <div className="space-y-6">
    <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
      <StatCard icon={Calendar} label="Total Assigned" value={officerStats.total} color="text-blue-600" />
      <StatCard icon={CheckCircle2} label="Completed" value={officerStats.completed} color="text-emerald-600" />
      <StatCard icon={Clock} label="In Progress" value={officerStats.inProgress} color="text-amber-600" />
      <StatCard icon={TrendingUp} label="Completion Rate" value={`${officerStats.completionRate}%`} color="text-purple-600" />
      <StatCard icon={Package} label="Workload (assets)" value={officerStats.workload.toLocaleString()} color="text-slate-700" />
    </div>

    {myAudits.length > 0 && (
      <div className="rounded-3xl border border-slate-200 bg-white shadow-sm p-6">
        <h3 className="text-sm font-black text-slate-900 mb-4 flex items-center gap-2"><Calendar className="w-4 h-4 text-blue-500" />My Audits ({myAudits.length})</h3>
        <div className="space-y-2">
          {myAudits.filter(a => a.status !== 'Completed').slice(0, 10).map(a => {
            const loc = locations.find(l => l.id === a.locationId);
            const dept = departments.find(d => d.id === a.departmentId);
            return (
              <div key={a.id} className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-100">
                <div><p className="text-sm font-bold text-slate-800">{loc?.name || 'Unknown'}</p><p className="text-xs text-slate-500">{dept?.name} · {a.date || 'No date'} · {a.status}</p></div>
                <div className="flex gap-2">
                  {a.status === 'Completed' && onUpload && (
                    <button onClick={() => onUpload(a)} className="px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-600 text-xs font-bold hover:bg-emerald-100"><UploadCloud className="w-3 h-3 inline mr-1" />Upload</button>
                  )}
                </div>
              </div>);
          })}
        </div>
      </div>
    )}

    <div className="rounded-3xl border border-slate-200 bg-white shadow-sm p-6">
      <h3 className="text-sm font-black text-slate-900 mb-3 flex items-center gap-2"><GraduationCap className="w-4 h-4 text-blue-500" />My Certification</h3>
      {currentUser.certificationExpiry ? (
        <div className="flex items-center gap-3">
          <div className={`w-3 h-3 rounded-full ${new Date(currentUser.certificationExpiry) > new Date() ? 'bg-emerald-500' : 'bg-red-500'}`} />
          <span className="text-sm text-slate-700">Expires: <span className="font-bold">{currentUser.certificationExpiry}</span></span>
        </div>
      ) : <p className="text-sm text-slate-500">No active certification</p>}
      {onRequestRenewal && (
        <button onClick={onRequestRenewal} className="mt-3 px-4 py-2 rounded-xl bg-blue-600 text-white text-xs font-bold hover:bg-blue-700 transition-colors">Request Renewal</button>
      )}
    </div>
  </div>
);
