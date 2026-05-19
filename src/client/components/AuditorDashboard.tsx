
import React, { useMemo } from 'react';

function GoalBar({ value, color }: { value: number; color: string }) {
  const ref = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    ref.current?.style.setProperty('--w', `${value}%`);
  }, [value]);
  return <div ref={ref} className={`h-full ${color} w-(--w)`} />;
}
import { AuditSchedule, User, AuditPhase, KPITier, Department, Location, InstitutionKPITarget } from '@shared/types';
import { 
  Calendar, 
  CheckCircle2, 
  Clock, 
  AlertCircle, 
  TrendingUp, 
  GraduationCap,
  ChevronRight,
  MapPin,
  Building2,
  Trophy,
  UploadCloud,
  ExternalLink,
  Package
} from 'lucide-react';
import { AuditUploadModal } from './AuditUploadModal';

interface AuditorDashboardProps {
  schedules: AuditSchedule[];
  currentUser: User;
  phases: AuditPhase[];
  kpiTiers: KPITier[];
  departments: Department[];
  locations: Location[];
  institutionKPIs: InstitutionKPITarget[];
  openAuditThreshold: number;
  onRequestRenewal: () => void;
  onUpdateDate: (id: string, newDate: string) => void;
  onUpdateAudit: (id: string, updates: Partial<AuditSchedule>) => Promise<void>;
}

export const AuditorDashboard: React.FC<AuditorDashboardProps> = ({ 
  schedules, 
  currentUser,
  phases,
  kpiTiers,
  departments,
  locations,
  institutionKPIs,
  openAuditThreshold,
  onRequestRenewal,
  onUpdateDate,
  onUpdateAudit,
}) => {
  const [uploadAudit, setUploadAudit] = React.useState<AuditSchedule | null>(null);

  // Filter audits assigned to the current user
  const myAudits = useMemo(() => {
    return schedules.filter(s => 
      s.auditor1Id === currentUser.id || s.auditor2Id === currentUser.id
    );
  }, [schedules, currentUser.id]);

  const stats = useMemo(() => {
    const total = myAudits?.length || 0;
    const completed = myAudits?.filter(s => s.status === 'Completed').length || 0;
    const inProgress = myAudits?.filter(s => s.status === 'In Progress').length || 0;
    const pending = myAudits?.filter(s => s.status === 'Pending').length || 0;
    const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;
    const workload = myAudits?.reduce((sum, s) => {
      const loc = locations.find(l => l.id === s.locationId);
      return sum + (loc?.totalAssets || 0);
    }, 0) || 0;

    return { total, completed, inProgress, pending, completionRate, workload };
  }, [myAudits, locations]);

  const upcomingAudits = useMemo(() => {
    return [...myAudits]
      .filter(s => s.status !== 'Completed')
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
      .slice(0, 5);
  }, [myAudits]);

  const certInfo = useMemo(() => {
    if (!currentUser.certificationExpiry) return null;
    
    const expiry = new Date(currentUser.certificationExpiry);
    const today = new Date();
    const diffTime = expiry.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    let status: 'safe' | 'warning' | 'expired' = 'safe';
    if (diffDays <= 0) status = 'expired';
    else if (diffDays <= 30) status = 'warning';
    
    return { days: diffDays, status };
  }, [currentUser]);

  if (!certInfo || certInfo.status === 'expired') {
     return (
        <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-8 animate-in fade-in zoom-in duration-500">
            <div className="w-24 h-24 bg-slate-100 rounded-full flex items-center justify-center mb-6">
                <GraduationCap className="w-10 h-10 text-slate-400" />
            </div>
            <h2 className="text-2xl font-black text-slate-900 mb-2">Certification Required</h2>
            <p className="text-slate-500 max-w-md mb-8">
                {certInfo?.status === 'expired' 
                    ? "Your inspecting officer certification has expired. You must renew your certification to access the dashboard and perform inspections."
                    : "You do not have an active inspecting officer certification. Please contact an administrator to update your certification status."}
            </p>
            {currentUser.renewalRequested
              ? <div className="px-6 py-3 bg-amber-50 border border-amber-200 text-amber-700 rounded-xl font-bold text-sm">
                  ⏳ Renewal Pending — Awaiting Admin Approval
                </div>
              : <button
                  onClick={onRequestRenewal}
                  className="px-6 py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition-all shadow-lg shadow-blue-500/20"
                >
                  Apply for Certificate Renewal
                </button>
            }
        </div>
     )
  }

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-500">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div className="max-w-xl">
          <h2 className="text-3xl font-black text-slate-900 tracking-tight">Officer Hub</h2>
          <p className="text-slate-500 text-lg mt-1">Welcome back, {currentUser.name}. Here is your personal inspection summary.</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right hidden sm:block">
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Personal Status</p>
            <p className="text-xs font-bold text-emerald-600 flex items-center gap-1.5 justify-end">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
              Active Duty
            </p>
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-6">
        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-blue-50 flex items-center justify-center text-blue-600">
            <Calendar className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Total Assigned</p>
            <p className="text-2xl font-black text-slate-900">{stats.total}</p>
          </div>
        </div>
        
        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-emerald-50 flex items-center justify-center text-emerald-600">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Completed</p>
            <p className="text-2xl font-black text-slate-900">{stats.completed}</p>
          </div>
        </div>

        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-amber-50 flex items-center justify-center text-amber-600">
            <Clock className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">In Progress</p>
            <p className="text-2xl font-black text-slate-900">{stats.inProgress}</p>
          </div>
        </div>

        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-indigo-50 flex items-center justify-center text-indigo-600">
            <TrendingUp className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Completion Rate</p>
            <p className="text-2xl font-black text-slate-900">{stats.completionRate}%</p>
          </div>
        </div>

        <div className={`p-6 rounded-3xl border shadow-sm flex items-center gap-4 transition-colors ${
          stats.workload >= openAuditThreshold 
            ? 'bg-rose-50/30 border-rose-200 text-rose-700 font-extrabold' 
            : 'bg-white border-slate-200 text-slate-900'
        }`}>
          <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${
            stats.workload >= openAuditThreshold ? 'bg-rose-100 text-rose-600' : 'bg-indigo-50 text-indigo-600'
          }`}>
            <Package className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Workload</p>
            <p className={`text-xl font-black ${stats.workload >= openAuditThreshold ? 'text-rose-600' : 'text-slate-900'}`}>
              {stats.workload.toLocaleString()} / {openAuditThreshold.toLocaleString()}
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Upcoming Audits List */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-xl font-bold text-slate-900">Your Upcoming Schedule</h3>
              <span className="px-3 py-1 bg-slate-100 text-slate-600 rounded-full text-[10px] font-bold uppercase">
                Next {upcomingAudits?.length || 0} Inspections
              </span>
            </div>
            <div className="divide-y divide-slate-100">
              {upcomingAudits.map((audit) => (
                <div key={audit.id} className="p-6 hover:bg-slate-50 transition-colors flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <div className="w-14 h-14 rounded-2xl bg-slate-100 border border-slate-200 flex flex-col items-center justify-center shrink-0">
                      <span className="text-[10px] font-black text-blue-600 uppercase">
                        {audit.date ? new Date(audit.date).toLocaleString('default', { month: 'short' }) : 'N/A'}
                      </span>
                      <span className="text-lg font-black text-slate-900">{audit.date ? audit.date.split('-')[2] : '-'}</span>
                    </div>
                    <div>
                      <h4 className="font-bold text-slate-900 text-lg">
                        {locations.find(l => l.id === audit.locationId)?.name || audit.locationId}
                      </h4>
                      <div className="flex items-center gap-3 mt-1">
                        <span className="flex items-center gap-1 text-xs text-slate-500 font-medium">
                          <Building2 className="w-3 h-3" />
                          {departments.find(d => d.id === audit.departmentId)?.name || audit.departmentId}
                        </span>
                        {(() => {
                          const loc = locations.find(l => l.id === audit.locationId);
                          if (loc?.building) {
                            return (
                              <span className="flex items-center gap-1 text-xs text-slate-500 font-medium">
                                <MapPin className="w-3 h-3" />
                                {loc.building}
                              </span>
                            );
                          }
                          return null;
                        })()}
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 shrink-0">
                    <div className="flex flex-col gap-1 items-end">
                      <label className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">Tarikh Pemeriksaan</label>
                      <input
                        type="date"
                        title="Tarikh Pemeriksaan"
                        value={audit.date || ''}
                        onChange={(e) => onUpdateDate(audit.id, e.target.value)}
                        className="px-3 py-1.5 bg-slate-50 border border-slate-200 text-xs font-bold text-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all cursor-pointer"
                      />
                    </div>
                    
                    <div className="flex items-center gap-4">
                      {audit.status === 'In Progress' && (
                        <button
                          onClick={() => setUploadAudit(audit)}
                          className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 hover:bg-emerald-600 hover:text-white transition-all flex items-center justify-center border border-emerald-100 shadow-sm"
                          title="Upload KEW-PA 11 PDF to Complete Inspection"
                        >
                          <UploadCloud className="w-5 h-5" />
                        </button>
                      )}

                      {audit.reportPath && (
                        <a
                          href={audit.reportPath}
                          target="_blank"
                          rel="noreferrer"
                          className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 hover:bg-emerald-600 hover:text-white transition-all flex items-center justify-center border border-emerald-100 shadow-sm"
                          title="View Stored KEW-PA 11 PDF"
                        >
                          <ExternalLink className="w-4 h-4" />
                        </a>
                      )}

                      <div className={`px-3 py-1 rounded-full text-[10px] font-black uppercase border ${
                        audit.status === 'In Progress' 
                          ? 'bg-amber-50 text-amber-600 border-amber-100' 
                          : 'bg-slate-50 text-slate-600 border-slate-100'
                      }`}>
                        {audit.status}
                      </div>
                      <button title="View details" className="w-10 h-10 rounded-xl bg-slate-100 text-slate-400 hover:bg-blue-600 hover:text-white transition-all flex items-center justify-center">
                        <ChevronRight className="w-5 h-5" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
              {(!upcomingAudits || upcomingAudits.length === 0) && (
                <div className="p-12 text-center">
                  <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Calendar className="w-8 h-8 text-slate-300" />
                  </div>
                  <p className="text-slate-500 font-medium">No upcoming inspections assigned to you.</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Sidebar Widgets */}
        <div className="space-y-8">
          {/* Certification Widget */}
          {certInfo && (
            <div className={`rounded-3xl p-6 text-white shadow-xl relative overflow-hidden transition-colors duration-500 ${
                certInfo.status === 'safe' ? 'bg-linear-to-br from-indigo-600 to-blue-700 shadow-blue-500/20' :
                certInfo.status === 'warning' ? 'bg-linear-to-br from-amber-500 to-orange-600 shadow-amber-500/20' :
                'bg-linear-to-br from-rose-600 to-red-700 shadow-rose-500/20'
            }`}>
              <GraduationCap className="absolute -right-4 -bottom-4 text-white/10 w-24 h-24" />
              <div className="relative z-10">
                <div className="flex items-center justify-between mb-4">
                  <h4 className="text-lg font-bold">Certification Status</h4>
                  <div className="w-10 h-10 rounded-full border-4 border-white/20 flex items-center justify-center text-[10px] font-black">
                     {certInfo.status === 'expired' ? 'EXP' : certInfo.days}d
                  </div>
                </div>
                
                <p className="text-white/90 text-sm mb-4 leading-relaxed">
                  {certInfo.status === 'safe' && `Your institutional inspecting officer certificate expires in ${certInfo.days} days.`}
                  {certInfo.status === 'warning' && `Urgent: Certification expiring in ${certInfo.days} days. Renew immediately.`}
                  {certInfo.status === 'expired' && `Critical: Your certificate has expired. Inspection operations suspended.`}
                </p>

                {currentUser.renewalRequested
                  ? <div className="w-full py-3 bg-white/10 border border-white/20 text-white/80 rounded-xl text-xs font-bold text-center">
                      ⏳ Renewal Pending — Awaiting Admin Approval
                    </div>
                  : <button
                      onClick={onRequestRenewal}
                      className={`w-full py-3 bg-white rounded-xl text-xs font-black uppercase tracking-widest transition-all active:scale-95 ${
                          certInfo.status === 'safe' ? 'text-blue-700 hover:bg-blue-50' :
                          certInfo.status === 'warning' ? 'text-amber-700 hover:bg-amber-50' :
                          'text-rose-700 hover:bg-rose-50'
                      }`}
                    >
                      Apply for Certificate Renewal
                    </button>
                }
              </div>
            </div>
          )}

          {/* Phase Targets & Goals */}
          <div className="bg-slate-900 rounded-3xl p-6 text-white shadow-xl relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/10 blur-2xl rounded-full -mr-10 -mt-10"></div>
            <h3 className="text-lg font-bold mb-4 flex items-center gap-2 relative z-10">
              <Trophy className="w-5 h-5 text-amber-400" />
              Phase Targets
            </h3>
            
            {(() => {
              const today = new Date();
              const activePhase = (phases || []).find(p => {
                const start = new Date(p.startDate);
                const end = new Date(p.endDate);
                return today >= start && today <= end;
              }) || phases[0];

              if (!activePhase) return null;

              const instTarget = institutionKPIs.find(k => k.phaseId === activePhase.id)?.targetPercentage ?? 0;
              
              // Find Dept Target
              const myDept = departments.find(d => d.id === currentUser.departmentId);
              let maxGlobalAssets = 0;
              departments.forEach(d => { if((d.totalAssets || 0) > maxGlobalAssets) maxGlobalAssets = d.totalAssets || 0; });
              const deptPercentage = maxGlobalAssets > 0 ? ((myDept?.totalAssets || 0) / maxGlobalAssets) * 100 : 0;
              const myTier = [...kpiTiers]
                .filter(t => deptPercentage >= t.minAssets)
                .sort((a,b) => b.minAssets - a.minAssets)[0];
              const deptTarget = myTier?.targets?.[activePhase.id] ?? 0;

              return (
                <div className="space-y-4 relative z-10">
                  <div className="p-4 bg-white/5 border border-white/10 rounded-2xl">
                    <div className="flex justify-between items-center mb-2">
                       <span className="text-[10px] font-black uppercase tracking-widest text-white/40">Institution Goal</span>
                       <span className="text-lg font-black">{instTarget}%</span>
                    </div>
                    <div className="h-1.5 w-full bg-white/10 rounded-full overflow-hidden">
                       <GoalBar value={instTarget} color="bg-blue-500" />
                    </div>
                  </div>

                  <div className="p-4 bg-white/5 border border-white/10 rounded-2xl">
                    <div className="flex justify-between items-center mb-2">
                       <span className="text-[10px] font-black uppercase tracking-widest text-white/40">Your Dept Goal</span>
                       <span className="text-lg font-black">{deptTarget}%</span>
                    </div>
                    <div className="h-1.5 w-full bg-white/10 rounded-full overflow-hidden">
                       <GoalBar value={deptTarget} color="bg-emerald-500" />
                    </div>
                    <p className="text-[9px] text-white/30 mt-2 font-medium">Based on {myTier?.name || 'Standard'} Tier</p>
                  </div>
                </div>
              );
            })()}
          </div>

          {/* Performance Insight */}
          <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm">
            <h3 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-blue-500" />
              Performance Metrics
            </h3>
            <div className="space-y-6">
              <div>
                <div className="flex justify-between items-center mb-2">
                  <span className="text-xs font-bold text-slate-500 uppercase">Inspection Accuracy</span>
                  <span className="text-xs font-black text-slate-900">98.2%</span>
                </div>
                <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full bg-blue-500 rounded-full w-[98.2%]"></div>
                </div>
              </div>
              
              <div>
                <div className="flex justify-between items-center mb-2">
                  <span className="text-xs font-bold text-slate-500 uppercase">On-Time Completion</span>
                  <span className="text-xs font-black text-slate-900">94.5%</span>
                </div>
                <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full bg-emerald-500 rounded-full w-[94.5%]"></div>
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-blue-50 border border-blue-100">
                <div className="flex items-start gap-3">
                  <AlertCircle className="w-4 h-4 text-blue-600 mt-0.5" />
                  <p className="text-[11px] text-blue-700 font-medium leading-relaxed">
                    You're performing above the institutional average for this phase. Keep up the high accuracy!
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      {uploadAudit && (
        <AuditUploadModal
          audit={uploadAudit}
          locationName={locations.find(l => l.id === uploadAudit.locationId)?.name || uploadAudit.locationId}
          onClose={() => setUploadAudit(null)}
          onComplete={async (id, reportPath) => {
            await onUpdateAudit(id, { status: 'Completed', reportPath });
          }}
        />
      )}
    </div>
  );
};
