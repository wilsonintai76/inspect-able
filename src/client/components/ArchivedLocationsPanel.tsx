import React from 'react';
import { Archive } from 'lucide-react';
import { Department, Location } from '@shared/types';

interface ArchivedLocationsPanelProps {
  locations: Location[];
  departments: Department[];
  onRestore: (id: string) => Promise<void>;
  onPurge: (id: string) => Promise<void>;
  showToast?: (message: string, type?: string) => void;
}

export const ArchivedLocationsPanel: React.FC<ArchivedLocationsPanelProps> = ({
  locations,
  departments,
  onRestore,
  onPurge,
  showToast,
}) => {
  const archived = locations.filter(l => l.status === 'Archived');

  return (
    <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden mb-8">
      <div className="p-8 border-b border-slate-100 bg-slate-50/50">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-amber-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-amber-600/20">
            <Archive className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-xl font-black text-slate-900 tracking-tight">Archived Locations</h3>
            <p className="text-slate-500 text-xs font-semibold">Restore or permanently purge archived locations</p>
          </div>
        </div>
      </div>
      <div className="p-8">
        {archived.length === 0 ? (
          <div className="text-center py-8 text-slate-400">
            <Archive className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm font-medium">No archived locations</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="py-2 px-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Name</th>
                  <th className="py-2 px-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Dept</th>
                  <th className="py-2 px-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Assets</th>
                  <th className="py-2 px-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Archived By</th>
                  <th className="py-2 px-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {archived.map(loc => {
                  const dept = departments.find(d => d.id === loc.departmentId);
                  return (
                    <tr key={loc.id} className="border-b border-slate-50 hover:bg-slate-50/50">
                      <td className="py-2.5 px-3 text-sm font-bold text-slate-900">{loc.name}</td>
                      <td className="py-2.5 px-3 text-xs text-slate-500">{dept?.name || loc.departmentId || '-'}</td>
                      <td className="py-2.5 px-3 text-xs text-slate-500">{loc.totalAssets ?? 0}</td>
                      <td className="py-2.5 px-3 text-xs text-slate-400">{loc.archivedBy || '-'}</td>
                      <td className="py-2.5 px-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={async () => {
                              await onRestore(loc.id);
                              showToast?.('Location restored', 'success');
                            }}
                            className="px-3 py-1.5 bg-emerald-50 text-emerald-700 rounded-lg text-[10px] font-bold hover:bg-emerald-100 transition-colors"
                          >
                            Restore
                          </button>
                          <button
                            onClick={() => {
                              if (window.confirm('PERMANENTLY DELETE "' + loc.name + '"? This cannot be undone.')) {
                                onPurge(loc.id);
                                showToast?.('Location purged', 'success');
                              }
                            }}
                            className="px-3 py-1.5 bg-red-50 text-red-600 rounded-lg text-[10px] font-bold hover:bg-red-100 transition-colors"
                          >
                            Purge
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
