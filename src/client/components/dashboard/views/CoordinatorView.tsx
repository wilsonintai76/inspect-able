import React from 'react';
import { 
  Users, 
  ShieldAlert, 
  MapPin, 
  Package, 
  AlertTriangle, 
  Check, 
  UserCheck 
} from 'lucide-react';
import { Department, Location } from '@shared/types';
import { StatCard } from '../Widgets';

interface CoordinatorViewProps {
  coordDeptId: string | undefined;
  coordDept: Department | undefined;
  coordLocations: Location[];
  coordStats: {
    totalLocs: number;
    totalAssets: number;
    completedAssets: number;
    progress: number;
    pending: number;
    inProgress: number;
    completed: number;
  };
  coordStaffGaps: string[];
  coordOfficers: any[];
}

export const CoordinatorView: React.FC<CoordinatorViewProps> = ({
  coordDeptId,
  coordDept,
  coordLocations,
  coordStats,
  coordStaffGaps,
  coordOfficers,
}) => {
  if (!coordDeptId) {
    return (
      <div className="rounded-3xl border border-dashed border-slate-300 p-8 text-center bg-slate-50">
        <ShieldAlert className="w-12 h-12 text-slate-400 mx-auto mb-3" />
        <h3 className="text-lg font-bold text-slate-800 mb-1">No Department Scope</h3>
        <p className="text-sm text-slate-500 max-w-md mx-auto">
          You are currently not assigned to any department. Please contact the system administrator to set your department assignment.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Department Info Header */}
      <div className="bg-slate-900 text-white rounded-3xl p-6 relative overflow-hidden shadow-xl">
        <div className="absolute top-0 right-0 p-8 opacity-10">
          <Users className="w-32 h-32 text-white" />
        </div>
        <div className="relative z-10">
          <span className="text-[10px] font-black text-indigo-300 uppercase tracking-widest bg-indigo-950/60 px-2.5 py-1 rounded-md">
            Coordinator Workspace
          </span>
          <h2 className="text-2xl font-black mt-2 tracking-tight">
            {coordDept?.name || 'Loading Department'} ({coordDept?.abbr || 'N/A'})
          </h2>
          <p className="text-xs text-slate-300 mt-1 max-w-xl">
            Scoped insights and staffing matrices for {coordLocations.length} active locations and {coordStats.totalAssets.toLocaleString()} department assets.
          </p>
          
          {/* Department progress line */}
          <div className="mt-6">
            <div className="flex justify-between items-center text-xs mb-1">
              <span className="font-bold text-slate-400">Department Audit Progress</span>
              <span className="font-black text-white">{coordStats.progress}% Completed</span>
            </div>
            <div className="w-full bg-slate-800 rounded-full h-3" style={{ '--progress': `${coordStats.progress}%` } as React.CSSProperties}>
              <div className="bg-indigo-500 h-3 rounded-full transition-all duration-500 w-(--progress)"></div>
            </div>
          </div>
        </div>
      </div>

      {/* Coordinator Stat Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard icon={MapPin} label="Dept Locations" value={coordStats.totalLocs} color="text-slate-800" />
        <StatCard icon={Package} label="Dept Assets" value={coordStats.totalAssets.toLocaleString()} color="text-blue-600" />
        <StatCard icon={Users} label="Registered Officers" value={coordOfficers.length} color="text-indigo-600" />
      </div>

      {/* Status Breakdown Bar */}
      <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-sm">
        <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Audit Schedules Status</h4>
        <div className="grid grid-cols-3 gap-4">
          <div className="p-3 bg-slate-50 border border-slate-100 rounded-2xl flex items-center justify-between">
            <div>
              <p className="text-[9px] font-bold text-slate-400 uppercase">Pending Staffing</p>
              <p className="text-lg font-black text-slate-800">{coordStats.pending}</p>
            </div>
            <span className="w-2.5 h-2.5 rounded-full bg-slate-400"></span>
          </div>
          <div className="p-3 bg-amber-50/50 border border-amber-100 rounded-2xl flex items-center justify-between">
            <div>
              <p className="text-[9px] font-bold text-amber-600 uppercase">In Progress</p>
              <p className="text-lg font-black text-amber-700">{coordStats.inProgress}</p>
            </div>
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse"></span>
          </div>
          <div className="p-3 bg-emerald-50/50 border border-emerald-100 rounded-2xl flex items-center justify-between">
            <div>
              <p className="text-[9px] font-bold text-emerald-600 uppercase">Completed</p>
              <p className="text-lg font-black text-emerald-700">{coordStats.completed}</p>
            </div>
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
          </div>
        </div>
      </div>

      {/* Staffing/Capacity Gaps Warnings */}
      {coordStaffGaps.length > 0 && (
        <div className="bg-amber-50/60 border border-amber-100 rounded-3xl p-6">
          <div className="flex gap-4">
            <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center text-amber-600 shrink-0">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-sm font-black text-amber-800 uppercase tracking-wider mb-2">Department Capacity Deficits</h4>
              <ul className="space-y-1.5 text-xs text-amber-700 font-medium">
                {coordStaffGaps.map((gap, i) => (
                  <li key={i} className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                    {gap}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Department Officers Roster */}
      <div className="bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-sm">
        <div className="p-5 border-b border-slate-100 flex justify-between items-center">
          <h3 className="text-sm font-black text-slate-800 flex items-center gap-2">
            <Users className="w-4 h-4 text-indigo-500" />
            Registered QAIs & Staff Workload
          </h3>
          <span className="text-[10px] text-slate-400 font-bold">{coordOfficers.length} total staff</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-[10px] font-black text-slate-400 uppercase">
              <tr>
                <th className="px-5 py-3">Officer Name</th>
                <th className="px-4 py-3">Designation</th>
                <th className="px-4 py-3 text-center">Certification Status</th>
                <th className="px-4 py-3 text-center">Assigned Audits</th>
                <th className="px-4 py-3 text-center">Total Assigned Assets</th>
                <th className="px-5 py-3 text-right">Workload Risk</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {coordOfficers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-6 text-center text-slate-400">
                    No registered staff in this department.
                  </td>
                </tr>
              ) : (
                coordOfficers.map(officer => (
                  <tr key={officer.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-5 py-3">
                      <div className="font-bold text-slate-800">{officer.name}</div>
                      <div className="text-[10px] text-slate-400">{officer.email}</div>
                    </td>
                    <td className="px-4 py-3 font-medium text-slate-500">
                      {officer.designation || 'Staff'}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {officer.isCertified ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-emerald-50 text-emerald-700 rounded-full text-[10px] font-extrabold border border-emerald-100">
                          <Check className="w-2.5 h-2.5" /> Certified
                        </span>
                      ) : officer.certificationExpiry ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-rose-50 text-rose-700 rounded-full text-[10px] font-extrabold border border-rose-100">
                          Expired ({officer.certificationExpiry})
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-slate-100 text-slate-500 rounded-full text-[10px] font-extrabold border border-slate-200">
                          Not Certified
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center font-bold text-slate-800">
                      {officer.assignedSchedules}
                    </td>
                    <td className="px-4 py-3 text-center font-bold text-slate-800">
                      {officer.assignedAssets.toLocaleString()}
                    </td>
                    <td className="px-5 py-3 text-right">
                      {officer.isOverloaded ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-red-50 text-red-600 rounded-lg text-[10px] font-bold border border-red-100">
                          <ShieldAlert className="w-3 h-3" /> Overloaded
                        </span>
                      ) : officer.assignedAssets > 0 ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-emerald-50 text-emerald-600 rounded-lg text-[10px] font-bold border border-emerald-100">
                          <UserCheck className="w-3 h-3" /> Optimal
                        </span>
                      ) : (
                        <span className="text-[10px] font-medium text-slate-400">No workload</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
