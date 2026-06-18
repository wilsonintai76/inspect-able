import React from 'react';
import { 
  CalendarDays, 
  FileText, 
  Clock, 
  Lock, 
  Unlock, 
  ExternalLink, 
  ShieldCheck, 
  Check 
} from 'lucide-react';
import { User, AuditSchedule } from '@shared/types';

interface InspectorViewProps {
  currentUser: User;
  mySchedules: any[];
  inspectorStats: {
    totalAssigned: number;
    completed: number;
    inProgress: number;
    pending: number;
    totalAssets: number;
  };
  isQAIActive: boolean;
  onUpdateAudit?: (id: string, updates: Partial<AuditSchedule>) => Promise<void>;
  onToggleStatus?: (id: string) => Promise<void>;
}

export const InspectorView: React.FC<InspectorViewProps> = ({
  currentUser,
  mySchedules,
  inspectorStats,
  isQAIActive,
  onUpdateAudit,
  onToggleStatus,
}) => {
  return (
    <div className="space-y-6">
      {/* Certification Card */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-slate-900 text-white rounded-3xl p-6 relative overflow-hidden shadow-xl">
          <div className="absolute top-0 right-0 p-8 opacity-10">
            <CalendarDays className="w-32 h-32 text-white" />
          </div>
          <div className="relative z-10 flex flex-col justify-between h-full min-h-36">
            <div>
              <span className="text-[10px] font-black text-indigo-300 uppercase tracking-widest bg-indigo-950/60 px-2.5 py-1 rounded-md">
                Auditor Console
              </span>
              <h2 className="text-2xl font-black mt-2 tracking-tight">
                My Inspection Tasks
              </h2>
              <p className="text-xs text-slate-300 mt-1">
                Manage your assigned inspections, report progress, and launch mobile audit environments directly.
              </p>
            </div>
            
            <div className="flex gap-4 mt-6">
              <div className="bg-slate-800/80 px-4 py-2.5 rounded-2xl border border-slate-700/50">
                <span className="text-[9px] font-black text-slate-400 uppercase block tracking-wider">Total Audits</span>
                <span className="text-xl font-black text-white">{inspectorStats.totalAssigned}</span>
              </div>
              <div className="bg-slate-800/80 px-4 py-2.5 rounded-2xl border border-slate-700/50">
                <span className="text-[9px] font-black text-slate-400 uppercase block tracking-wider">Total Assets</span>
                <span className="text-xl font-black text-white">{inspectorStats.totalAssets.toLocaleString()}</span>
              </div>
              <div className="bg-emerald-950/40 px-4 py-2.5 rounded-2xl border border-emerald-900/40">
                <span className="text-[9px] font-black text-emerald-400 uppercase block tracking-wider">Completed</span>
                <span className="text-xl font-black text-emerald-400">{inspectorStats.completed}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Certification Status widget */}
        <div className={`rounded-3xl p-6 flex flex-col justify-between border ${
          isQAIActive 
            ? 'bg-emerald-50 border-emerald-200 text-emerald-950'
            : currentUser.certificationExpiry 
              ? 'bg-red-50 border-red-200 text-red-950'
              : 'bg-slate-50 border-slate-200 text-slate-700'
        }`}>
          <div>
            <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2 flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-indigo-500" /> Certification Status
            </h4>
            {isQAIActive ? (
              <>
                <h3 className="text-base font-black text-emerald-900 flex items-center gap-1">
                  Active QAI Status
                </h3>
                <p className="text-xs text-emerald-700 font-semibold mt-1">
                  Verified Quality Asset Inspector until <span className="font-extrabold">{currentUser.certificationExpiry}</span>.
                </p>
              </>
            ) : currentUser.certificationExpiry ? (
                  <>
                    <h3 className="text-base font-black text-red-900 flex items-center gap-1">
                      Certification Expired
                    </h3>
                    <p className="text-xs text-red-700 font-semibold mt-1">
                      Your inspector certificate expired on <span className="font-extrabold">{currentUser.certificationExpiry}</span>. Contact HOD to renew.
                    </p>
                  </>
                ) : (
                  <>
                    <h3 className="text-base font-black text-slate-800 flex items-center gap-1">
                      No Inspector Certificate
                    </h3>
                    <p className="text-xs text-slate-500 font-semibold mt-1">
                      You do not have a registered auditor certification. You can still perform open audits when assigned.
                    </p>
                  </>
                )}
          </div>

          <div className="mt-4 pt-4 border-t border-slate-200/50">
            <button
              onClick={() => window.open('/mobile.html', '_blank')}
              className="w-full flex items-center justify-center gap-2 py-3 bg-slate-900 hover:bg-slate-800 text-white rounded-2xl text-xs font-black uppercase tracking-wider transition-all duration-200 shadow-md hover:shadow-lg active:scale-98"
            >
              Launch Mobile Layout <ExternalLink className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Assigned Schedules Workload List */}
      <div className="space-y-4">
        <h3 className="text-sm font-black text-slate-900 flex items-center gap-2">
          <Clock className="w-4 h-4 text-indigo-500" />
          Inspection Task Pipeline ({mySchedules.length})
        </h3>

        {mySchedules.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-slate-300 p-8 text-center bg-slate-50">
            <CalendarDays className="w-12 h-12 text-slate-400 mx-auto mb-3" />
            <h4 className="text-base font-bold text-slate-800 mb-1">No Active Inspections</h4>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              You are not currently assigned to any pending or in-progress inspections. Use the Schedules page to find audits or request self-assignment.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {mySchedules.map(s => {
              const isPending = s.status === 'Pending';
              const isInProgress = s.status === 'In Progress';
              const isCompleted = s.status === 'Completed';
              const isLocked = s.isLocked === true;
              
              return (
                <div 
                  key={s.id} 
                  className={`rounded-3xl border p-5 flex flex-col justify-between transition-all duration-200 bg-white ${
                    isCompleted 
                      ? 'border-emerald-100 hover:shadow-md' 
                      : isInProgress 
                        ? 'border-amber-200 shadow-sm shadow-amber-50 hover:shadow-md'
                        : 'border-slate-200 hover:shadow-md'
                  }`}
                >
                  <div>
                    {/* Title bar */}
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider block">
                          Location
                        </span>
                        <h4 className="text-base font-bold text-slate-800 leading-snug">
                          {s.locationName}
                        </h4>
                      </div>
                      
                      {/* Status Badge */}
                      {isCompleted ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-100 rounded-full text-[9px] font-black">
                          Completed
                        </span>
                      ) : isInProgress ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-amber-50 text-amber-700 border border-amber-100 rounded-full text-[9px] font-black animate-pulse">
                          In Progress
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-slate-100 text-slate-600 border border-slate-200 rounded-full text-[9px] font-black">
                          Pending
                        </span>
                      )}
                    </div>

                    {/* Metadata row */}
                    <div className="grid grid-cols-2 gap-4 my-4 pt-3 border-t border-slate-100">
                      <div>
                        <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider block">Target Date</span>
                        <span className="text-xs font-semibold text-slate-700">
                          {s.date ? new Date(s.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : 'Unscheduled'}
                        </span>
                      </div>
                      <div>
                        <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider block">Asset Volume</span>
                        <span className="text-xs font-semibold text-slate-700">
                          {s.totalAssets.toLocaleString()} Assets
                        </span>
                      </div>
                    </div>

                    <div className="mb-4">
                      <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider block">Audit Partner</span>
                      <span className="text-xs font-semibold text-slate-700">
                        {s.partnerName}
                      </span>
                    </div>
                  </div>

                  {/* Actions footer */}
                  <div className="mt-4 pt-4 border-t border-slate-100 flex items-center justify-between gap-3">
                    <div>
                      {isCompleted && s.reportPath && (
                        <button
                          onClick={() => window.open(s.reportPath!, '_blank')}
                          className="inline-flex items-center gap-1 text-[10px] font-black text-emerald-600 hover:text-emerald-800 bg-emerald-50 px-2 py-1 rounded-lg uppercase"
                        >
                          <FileText className="w-3.5 h-3.5" /> View KEW-PA 11
                        </button>
                      )}
                    </div>
                    
                    <div className="flex gap-2">
                      {isPending && onUpdateAudit && (
                        <button
                          onClick={async () => {
                            try {
                              await onUpdateAudit(s.id, { status: 'In Progress' });
                            } catch (e) {
                              console.error("Failed to start inspection:", e);
                            }
                          }}
                          className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-[10px] font-black uppercase tracking-wider shadow-sm transition-all"
                        >
                          Start Audit
                        </button>
                      )}
                      
                      {isInProgress && (
                        <div className="flex items-center gap-2">
                          {onToggleStatus && (
                            <button
                              onClick={() => onToggleStatus(s.id)}
                              className="px-3 py-1.5 border border-emerald-300 hover:border-emerald-400 text-emerald-700 bg-emerald-50 rounded-xl text-[9px] font-black uppercase transition-colors"
                              title="Mark as Inspection Finished"
                            >
                              Finish Inspection
                            </button>
                          )}
                          <button
                            onClick={() => window.open('/mobile.html', '_blank')}
                            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-[10px] font-black uppercase tracking-wider shadow-sm flex items-center gap-1.5"
                          >
                            Launch Mobile <ExternalLink className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                      
                      {isCompleted && (
                        <span className="text-[10px] font-extrabold text-emerald-600 flex items-center gap-1 bg-emerald-50 px-2 py-1 rounded-lg">
                          <Check className="w-3 h-3 text-emerald-500" />
                          Inspection Finished
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
