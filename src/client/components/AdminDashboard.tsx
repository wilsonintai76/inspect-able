
import React, { useMemo } from 'react';
import { 
  Users, MapPin, Calendar, Clock, AlertTriangle, 
  CheckCircle2, XCircle, Activity, ShieldAlert,
  Search, Filter, ArrowUpRight, Check, X,
  AlertCircle, History, GraduationCap
} from 'lucide-react';
import { 
  User, Location, AuditSchedule, SystemActivity, 
  Department, Building, AuditPhase 
} from '@shared/types';
import { PageHeader } from './PageHeader';

interface AdminDashboardProps {
  users: User[];
  locations: Location[];
  schedules: AuditSchedule[];
  activities: SystemActivity[];
  departments: Department[];
  buildings: Building[];
  phases: AuditPhase[];
  onApproveArchive: (locationId: string) => void;
  onRejectArchive: (locationId: string) => void;
  onApproveCert: (user: User) => void;
  /** When set, scopes all data to this department (Coordinator view) */
  coordinatorDeptId?: string;
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({
  users, locations, schedules, activities, departments, buildings, phases,
  onApproveArchive, onRejectArchive, onApproveCert, coordinatorDeptId
}) => {
  const isDeptScoped = !!coordinatorDeptId;

  // Scope all data to coordinator's department when coordinatorDeptId is set
  const scopedLocations  = isDeptScoped ? locations.filter(l => l.departmentId === coordinatorDeptId)  : locations;
  const scopedSchedules  = isDeptScoped ? schedules.filter(s => s.departmentId === coordinatorDeptId)  : schedules;
  const scopedUsers      = isDeptScoped ? users.filter(u => u.departmentId === coordinatorDeptId)       : users;

  // 1. Pending Location Deletions
  const pendingDeletions = useMemo(() => 
    scopedLocations.filter(l => l.status === 'Pending_Delete'),
    [scopedLocations]
  );

  // 2. Audit Gaps
  const auditGaps = useMemo(() => {
    const missingDate = scopedSchedules.filter(s => !s.date);
    const missingAuditors = scopedSchedules.filter(s => !s.auditor1Id && !s.auditor2Id);
    
    return {
      date: missingDate,
      auditors: missingAuditors,
      total: Array.from(new Set([...missingDate.map(s => s.id), ...missingAuditors.map(s => s.id)])).length
    };
  }, [scopedSchedules]);

  // 3. User Onboarding Compliance
  const incompleteUsers = useMemo(() => 
    scopedUsers.filter(u => !u.departmentId || !u.designation || !u.contactNumber || u.status === 'Pending'),
    [scopedUsers]
  );

  // 4. Certification Watch
  const certWatch = useMemo(() => {
    const now = new Date();
    const thirtyDaysOut = new Date();
    thirtyDaysOut.setDate(now.getDate() + 30);

    const expired = scopedUsers.filter(u => u.certificationExpiry && new Date(u.certificationExpiry) < now);
    const expiringSoon = scopedUsers.filter(u => 
      u.certificationExpiry && 
      new Date(u.certificationExpiry) >= now && 
      new Date(u.certificationExpiry) <= thirtyDaysOut
    );

    return { expired, expiringSoon };
  }, [scopedUsers]);

  // 5. Certificate Renewal Requests
  const renewalRequests = useMemo(() =>
    scopedUsers.filter(u => u.renewalRequested),
    [scopedUsers]
  );

  // Utility to get building abbreviation
  const getBuildingAbbr = (buildingId?: string | null) => {
    if (!buildingId) return 'N/A';
    return buildings.find(b => b.id === buildingId)?.abbr || 'N/A';
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-500">
      <PageHeader
        title={isDeptScoped ? 'Department Admin Hub' : 'Institutional Admin Hub'}
        description={isDeptScoped ? 'Department oversight, pending approvals, and audit status for your department.' : 'Global system oversight, pending approvals, and institutional audit trail.'}
        icon={ShieldAlert}
      />

      {/* TOP STATS GRID */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard 
          icon={AlertTriangle} 
          label="Pending Deletions" 
          value={pendingDeletions.length} 
          color="amber"
        />
        <StatCard 
          icon={Calendar} 
          label="Unscheduled Audits" 
          value={auditGaps.date.length} 
          color="rose"
        />
        <StatCard 
          icon={Users} 
          label="Incomplete Profiles" 
          value={incompleteUsers.length} 
          color="indigo"
        />
        <StatCard 
          icon={Clock} 
          label="Certifications At Risk" 
          value={certWatch.expired.length + certWatch.expiringSoon.length + renewalRequests.length} 
          color="orange"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* LEFT COLUMN: PENDING TASKS & GAPS */}
        <div className="lg:col-span-2 space-y-8">
          
          {/* 1. APPROVAL QUEUE */}
          <section className="bg-white rounded-[32px] border border-slate-200 overflow-hidden shadow-sm">
            <div className="px-8 py-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center text-amber-600 shadow-sm border border-amber-200">
                  <Activity className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900">Archive Approval Queue</h3>
                  <p className="text-xs text-slate-500 font-medium">Locations waiting for final decommission approval.</p>
                </div>
              </div>
              <span className="px-3 py-1 bg-amber-100 text-amber-700 rounded-full text-[10px] font-black uppercase tracking-widest border border-amber-200">
                {pendingDeletions.length} Pending
              </span>
            </div>
            
            <div className="divide-y divide-slate-50">
              {pendingDeletions.map(loc => {
                const dept = departments.find(d => d.id === loc.departmentId);
                return (
                  <div key={loc.id} className="p-6 flex items-center justify-between hover:bg-slate-50/50 transition-colors group">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-2xl bg-white border border-slate-200 flex items-center justify-center text-slate-400 group-hover:border-amber-200 group-hover:text-amber-500 transition-colors shrink-0">
                        <MapPin className="w-6 h-6" />
                      </div>
                      <div>
                        <div className="font-bold text-slate-900 flex items-center gap-2">
                          {loc.name}
                          <span className="text-[10px] text-slate-400 font-normal py-0.5 px-2 bg-slate-100 rounded-lg">
                            {getBuildingAbbr(loc.buildingId)} | {loc.level}
                          </span>
                        </div>
                        <div className="text-xs text-slate-500 font-medium">{dept?.name || 'Unknown Dept'}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button 
                        onClick={() => onApproveArchive(loc.id)}
                        className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-xl text-xs font-bold hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-600/10 active:scale-95"
                      >
                        <Check className="w-4 h-4" />
                        Approve
                      </button>
                      <button 
                        onClick={() => onRejectArchive(loc.id)}
                        className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-600 rounded-xl text-xs font-bold hover:bg-slate-50 transition-all active:scale-95"
                      >
                        <X className="w-4 h-4" />
                        Reject
                      </button>
                    </div>
                  </div>
                );
              })}
              {pendingDeletions.length === 0 && (
                <div className="p-12 text-center">
                  <div className="w-12 h-12 bg-slate-50 rounded-2xl flex items-center justify-center mx-auto mb-3 opacity-50">
                    <CheckCircle2 className="w-6 h-6 text-slate-400" />
                  </div>
                  <p className="text-sm font-medium text-slate-400 italic">No archive requests currently pending.</p>
                </div>
              )}
            </div>
          </section>

          {/* 2. CERT RENEWAL REQUESTS */}
          <section className="bg-white rounded-[32px] border border-slate-200 overflow-hidden shadow-sm">
            <div className="px-8 py-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600 shadow-sm border border-blue-100">
                  <GraduationCap className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900">Certificate Renewal Requests</h3>
                  <p className="text-xs text-slate-500 font-medium">Officers who have applied for certification renewal.</p>
                </div>
              </div>
              <span className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-[10px] font-black uppercase tracking-widest border border-blue-200">
                {renewalRequests.length} Pending
              </span>
            </div>
            <div className="divide-y divide-slate-50">
              {renewalRequests.map(u => {
                const dept = departments.find(d => d.id === u.departmentId);
                const requestedDate = u.renewalRequested ? new Date(u.renewalRequested).toLocaleDateString() : '—';
                return (
                  <div key={u.id} className="p-6 flex items-center justify-between hover:bg-slate-50/50 transition-colors group">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-2xl bg-white border border-slate-200 flex items-center justify-center text-slate-400 group-hover:border-blue-200 group-hover:text-blue-500 transition-colors shrink-0">
                        <GraduationCap className="w-6 h-6" />
                      </div>
                      <div>
                        <div className="font-bold text-slate-900">{u.name}</div>
                        <div className="text-xs text-slate-500 font-medium">{dept?.name || 'Unknown Dept'}</div>
                        <div className="text-[10px] text-slate-400 font-medium mt-0.5">Applied: {requestedDate}</div>
                      </div>
                    </div>
                    <button
                      onClick={() => onApproveCert(u)}
                      className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl text-xs font-bold hover:bg-blue-700 transition-all shadow-lg shadow-blue-600/10 active:scale-95"
                    >
                      <Check className="w-4 h-4" />
                      Approve & Issue Cert
                    </button>
                  </div>
                );
              })}
              {renewalRequests.length === 0 && (
                <div className="p-12 text-center">
                  <div className="w-12 h-12 bg-slate-50 rounded-2xl flex items-center justify-center mx-auto mb-3 opacity-50">
                    <CheckCircle2 className="w-6 h-6 text-slate-400" />
                  </div>
                  <p className="text-sm font-medium text-slate-400 italic">No pending certificate renewal requests.</p>
                </div>
              )}
            </div>
          </section>

          {/* 3. AUDIT GAPS SUMMARY */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
             <DataGapCard 
                title="Missing Date Assets" 
                icon={Calendar} 
                items={auditGaps.date} 
                locations={scopedLocations}
                departments={departments}
                color="rose"
             />
             <DataGapCard 
                title="Unassigned Officers" 
                icon={Users} 
                items={auditGaps.auditors} 
                locations={scopedLocations}
                departments={departments}
                color="indigo"
             />
          </div>

          {/* 3. USER ONBOARDING COMPLIANCE */}
          <section className="bg-white rounded-[32px] border border-slate-200 overflow-hidden shadow-sm">
             <div className="px-8 py-6 border-b border-slate-100 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600 shadow-sm border border-indigo-100">
                        <Users className="w-5 h-5" />
                    </div>
                    <h3 className="text-lg font-bold text-slate-900">Incomplete User Onboarding</h3>
                </div>
             </div>
             <div className="max-h-100 overflow-y-auto scrollbar-thin scrollbar-thumb-slate-200">
                <table className="w-full text-left border-collapse">
                    <thead className="bg-slate-50/50 sticky top-0 z-10 border-b border-slate-100">
                        <tr>
                            <th className="px-6 py-4 text-[10px] font-black uppercase text-slate-400 tracking-widest">Username</th>
                            <th className="px-6 py-4 text-[10px] font-black uppercase text-slate-400 tracking-widest">Missing Fields</th>
                            <th className="px-6 py-4 text-[10px] font-black uppercase text-slate-400 tracking-widest text-right">Status</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                        {incompleteUsers.map(u => (
                            <tr key={u.id} className="hover:bg-slate-50/30 transition-colors">
                                <td className="px-6 py-4">
                                    <div className="font-bold text-slate-900 text-sm">{u.name}</div>
                                    <div className="text-[10px] text-slate-400 font-medium">{u.email}</div>
                                </td>
                                <td className="px-6 py-4">
                                    <div className="flex flex-wrap gap-1.5">
                                        {!u.departmentId && <span className="px-2 py-0.5 bg-rose-50 text-rose-600 rounded-md text-[9px] font-bold border border-rose-100">Dept</span>}
                                        {!u.designation && <span className="px-2 py-0.5 bg-rose-50 text-rose-600 rounded-md text-[9px] font-bold border border-rose-100">Designation</span>}
                                        {!u.contactNumber && <span className="px-2 py-0.5 bg-rose-50 text-rose-600 rounded-md text-[9px] font-bold border border-rose-100">Phone</span>}
                                        {u.status === 'Pending' && <span className="px-2 py-0.5 bg-amber-50 text-amber-600 rounded-md text-[9px] font-bold border border-amber-100">Verification</span>}
                                    </div>
                                </td>
                                <td className="px-6 py-4 text-right">
                                    <span className="px-2 py-1 rounded-full bg-slate-100 text-slate-500 text-[10px] font-black uppercase tracking-tighter">
                                        Incomplete
                                    </span>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
             </div>
          </section>

        </div>

        {/* RIGHT COLUMN: CERT WATCH & ACTIVITY LOG */}
        <div className="space-y-8">
          
          {/* CERTIFICATION WATCH */}
          <section className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm">
            <div className="flex items-center justify-between mb-6">
              <h3 className="font-bold text-slate-900 flex items-center gap-2">
                <Clock className="w-4 h-4 text-orange-500" />
                Cert Watch
              </h3>
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">30 Day Window</span>
            </div>
            
            <div className="space-y-4">
               {certWatch.expired.map(u => (
                 <div key={u.id} className="p-3 rounded-2xl bg-rose-50 border border-rose-100 flex items-center justify-between">
                    <div>
                        <div className="text-xs font-bold text-rose-700">{u.name}</div>
                        <div className="text-[10px] text-rose-500 font-medium uppercase tracking-tight">Expired Cert</div>
                    </div>
                    <XCircle className="w-4 h-4 text-rose-400" />
                 </div>
               ))}
               {certWatch.expiringSoon.map(u => (
                 <div key={u.id} className="p-3 rounded-2xl bg-orange-50 border border-orange-100 flex items-center justify-between">
                    <div>
                        <div className="text-xs font-bold text-orange-700">{u.name}</div>
                        <div className="text-[10px] text-orange-500 font-medium uppercase tracking-tight">Expiring Soon</div>
                    </div>
                    <AlertCircle className="w-4 h-4 text-orange-400" />
                 </div>
               ))}
               {certWatch.expired.length === 0 && certWatch.expiringSoon.length === 0 && (
                 <div className="py-8 text-center bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                    <CheckCircle2 className="w-8 h-8 text-emerald-300 mx-auto mb-2" />
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">All Certs Valid</p>
                 </div>
               )}
            </div>
          </section>

          {/* ACTIVITY LOG */}
          <section className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm flex flex-col h-150">
             <div className="flex items-center justify-between mb-6 shrink-0">
               <h3 className="font-bold text-slate-900 flex items-center gap-2">
                 <History className="w-4 h-4 text-blue-500" />
                 System Activity
               </h3>
               <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Live Trail</span>
             </div>

             <div className="grow overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-slate-100 space-y-4">
                {activities.slice().reverse().map(activity => (
                  <div key={activity.id} className="relative pl-6 pb-4 border-l border-slate-100 last:pb-0">
                    <div className={`absolute -left-1.25 top-0 w-2.5 h-2.5 rounded-full border-2 border-white shadow-sm ${
                        activity.type.includes('DELETE') ? 'bg-rose-500' :
                        activity.type.includes('CREATE') ? 'bg-emerald-500' :
                        activity.type.includes('UPDATE') ? 'bg-blue-500' :
                        'bg-slate-400'
                    }`}></div>
                    <div className="text-[11px] font-bold text-slate-800 leading-snug">
                       {activity.message}
                    </div>
                    <div className="mt-1 flex items-center gap-2 text-[9px] font-black text-slate-400 uppercase tracking-wider">
                       {activity.timestamp ? new Date(activity.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Just now'}
                       <span className="opacity-30">•</span>
                       {activity.type.replace(/_/g, ' ')}
                    </div>
                  </div>
                ))}
             </div>
          </section>

        </div>
      </div>
    </div>
  );
};

// --- SUB-COMPONENTS ---

const StatCard: React.FC<{ icon: any, label: string, value: number, color: string }> = ({ icon: Icon, label, value, color }) => {
  const colors: any = {
    amber: "bg-amber-50 text-amber-600 border-amber-100",
    rose: "bg-rose-50 text-rose-600 border-rose-100",
    indigo: "bg-indigo-50 text-indigo-600 border-indigo-100",
    orange: "bg-orange-50 text-orange-600 border-orange-100"
  };
  
  return (
    <div className="bg-white p-6 rounded-[28px] border border-slate-200 shadow-sm hover:border-slate-300 transition-colors">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-4 border ${colors[color] || 'bg-slate-100 text-slate-600 border-slate-200'}`}>
        <Icon className="w-5 h-5" />
      </div>
      <div className="text-2xl font-black text-slate-900">{value}</div>
      <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1.5">{label}</div>
    </div>
  );
};

const DataGapCard: React.FC<{ title: string, icon: any, items: AuditSchedule[], locations: Location[], departments: Department[], color: string }> = ({ 
    title, icon: Icon, items, locations, departments, color 
}) => {
    const colorClasses: any = {
        rose: "bg-rose-50 text-rose-600 border-rose-100",
        indigo: "bg-indigo-50 text-indigo-600 border-indigo-100"
    };

    return (
        <section className="bg-white rounded-[32px] border border-slate-200 overflow-hidden shadow-sm">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                    <Icon className={`w-4 h-4 ${color === 'rose' ? 'text-rose-500' : 'text-indigo-500'}`} />
                    <h3 className="font-bold text-slate-900 text-sm tracking-tight">{title}</h3>
                </div>
                <span className={`px-2 py-0.5 rounded-lg text-[9px] font-black uppercase tracking-widest border ${colorClasses[color]}`}>
                    {items.length} Gaps
                </span>
            </div>
            <div className="max-h-60 overflow-y-auto scrollbar-thin scrollbar-thumb-slate-100 divide-y divide-slate-50">
                {items.map(audit => {
                    const loc = locations.find(l => l.id === audit.locationId);
                    const dept = departments.find(d => d.id === audit.departmentId);
                    return (
                        <div key={audit.id} className="px-6 py-3 flex items-center gap-3 hover:bg-slate-50/50 transition-colors">
                            <div className="w-8 h-8 rounded-lg bg-slate-50 border border-slate-100 flex items-center justify-center text-[10px] font-black text-slate-300">
                                {loc?.abbr || '?'}
                            </div>
                            <div className="min-w-0">
                                <div className="text-xs font-bold text-slate-800 truncate">{loc?.name || 'Invalid Location'}</div>
                                <div className="text-[9px] text-slate-400 font-bold uppercase truncate">{dept?.name || 'Unknown Dept'}</div>
                            </div>
                        </div>
                    );
                })}
                {items.length === 0 && (
                    <div className="py-10 text-center">
                        <CheckCircle2 className="w-6 h-6 text-emerald-300 mx-auto mb-2 opacity-50" />
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Compliant</p>
                    </div>
                )}
            </div>
        </section>
    );
};
