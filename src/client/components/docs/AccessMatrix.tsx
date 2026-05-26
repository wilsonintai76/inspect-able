
import React from 'react';
import { CheckCircle2, XCircle } from 'lucide-react';

export const AccessMatrix: React.FC = () => {
  const rows = [
    { feature: 'Define Inspection Phases', admin: true, coord: true, auditor: false },
    { feature: 'Issue Staff Certificates', admin: true, coord: false, auditor: false },
    { feature: 'Generate Inspection Matrix', admin: true, coord: false, auditor: false },
    { feature: 'Self-Assign (Requires Valid Cert)', admin: true, coord: true, auditor: true },
    { feature: 'Complete Inspection Status', admin: true, coord: true, auditor: true },
    { feature: 'Manage Site Locations', admin: true, coord: true, auditor: false },
    { feature: 'View KPI Trends', admin: true, coord: true, auditor: true }
  ];

  return (
    <div className="bg-white rounded-[40px] border border-slate-200 shadow-sm overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-left min-w-150">
          <thead>
            <tr className="bg-slate-50/50 border-b border-slate-100">
              <th className="px-8 py-6 text-[10px] font-black uppercase text-slate-400 tracking-widest">Core Functionality</th>
              <th className="px-8 py-6 text-[10px] font-black uppercase text-slate-400 tracking-widest text-center">Admin</th>
              <th className="px-8 py-6 text-[10px] font-black uppercase text-slate-400 tracking-widest text-center">Coordinator</th>
              <th className="px-8 py-6 text-[10px] font-black uppercase text-slate-400 tracking-widest text-center">Inspector</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {rows.map((row, i) => (
              <tr key={i} className="hover:bg-slate-50/50 transition-colors">
                <td className="px-8 py-5 text-sm font-bold text-slate-700">{row.feature}</td>
                <td className="px-8 py-5 text-center">
                  {row.admin ? <CheckCircle2 className="w-5 h-5 text-blue-500 mx-auto" /> : <XCircle className="w-5 h-5 text-slate-200 mx-auto" />}
                </td>
                <td className="px-8 py-5 text-center">
                  {row.coord ? <CheckCircle2 className="w-5 h-5 text-blue-500 mx-auto" /> : <XCircle className="w-5 h-5 text-slate-200 mx-auto" />}
                </td>
                <td className="px-8 py-5 text-center">
                  {row.auditor ? <CheckCircle2 className="w-5 h-5 text-blue-500 mx-auto" /> : <XCircle className="w-5 h-5 text-slate-200 mx-auto" />}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
