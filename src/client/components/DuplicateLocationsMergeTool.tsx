import React, { useState, useEffect } from 'react';
import { X, Combine, AlertTriangle, Building2, Layers, MapPin, Search, CheckCircle2 } from 'lucide-react';

interface DuplicateGroup {
  name: string;
  locations: {
    id: string;
    name: string;
    departmentId: string;
    departmentName: string;
    buildingName: string;
    totalAssets: number;
    uninspectedAssetCount: number;
    status: string;
  }[];
}

interface DuplicateLocationsMergeToolProps {
  onClose: () => void;
  showToast: (message: string, type?: 'success' | 'error' | 'warning' | 'info') => void;
}

export const DuplicateLocationsMergeTool: React.FC<DuplicateLocationsMergeToolProps> = ({ onClose, showToast }) => {
  const [duplicates, setDuplicates] = useState<DuplicateGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [merging, setMerging] = useState<string | null>(null);
  const [selections, setSelections] = useState<Record<string, string>>({});

  const fetchDuplicates = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/db/locations/duplicates');
      if (res.ok) {
        const data = await res.json();
        setDuplicates(data);
        
        // Auto-select the one with the most assets as master for each group
        const newSelections: Record<string, string> = {};
        data.forEach((group: DuplicateGroup) => {
          if (group.locations.length > 0) {
            const master = group.locations.reduce((prev, current) => 
              (current.totalAssets > prev.totalAssets) ? current : prev
            );
            newSelections[group.name] = master.id;
          }
        });
        setSelections(newSelections);
      } else {
        showToast('Failed to fetch duplicates', 'error');
      }
    } catch (e) {
      showToast('Error connecting to server', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDuplicates();
  }, []);

  const handleMerge = async (groupName: string, targetId: string, locations: any[]) => {
    const sourceIds = locations.filter(l => l.id !== targetId).map(l => l.id);
    if (sourceIds.length === 0) return;

    if (!confirm(`Are you sure you want to merge ${sourceIds.length} location(s) into the selected Master location? This action cannot be undone.`)) return;

    setMerging(groupName);
    try {
      const res = await fetch('/api/db/locations/merge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetId, sourceIds }),
      });

      if (res.ok) {
        showToast(`Successfully merged ${sourceIds.length} duplicate(s) for "${groupName}"!`, 'success');
        // Remove the group from the local list
        setDuplicates(prev => prev.filter(g => g.name !== groupName));
      } else {
        const d = await res.json() as any;
        showToast(d.error || 'Failed to merge locations', 'error');
      }
    } catch (e) {
      showToast('Error connecting to server during merge', 'error');
    } finally {
      setMerging(null);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-100 bg-slate-50/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center text-amber-600">
              <Combine className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-black text-slate-800">Merge Duplicate Locations</h2>
              <p className="text-sm font-medium text-slate-500">Detect and consolidate redundant database entries</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 bg-slate-50">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-12 text-slate-400">
              <Search className="w-8 h-8 mb-4 animate-pulse text-amber-400" />
              <p className="text-sm font-bold">Scanning for duplicates...</p>
            </div>
          ) : duplicates.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-slate-500 text-center">
              <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600 mb-4">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <h3 className="text-lg font-black text-slate-800 mb-1">Database is Clean!</h3>
              <p className="text-sm text-slate-500">No duplicate location names were found.</p>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex gap-3 text-amber-800 text-sm">
                <AlertTriangle className="w-5 h-5 shrink-0" />
                <div>
                  <p className="font-bold mb-1">Found {duplicates.length} location(s) with duplicate names.</p>
                  <p>Select which location should be kept as the <strong>Master Record</strong>. The other locations in the group will be merged into it, and their assets will be transferred. Note: You can merge across different departments.</p>
                </div>
              </div>

              {duplicates.map((group, idx) => (
                <div key={idx} className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
                  <div className="bg-slate-100/50 px-5 py-3 border-b border-slate-200 flex items-center justify-between">
                    <h4 className="font-bold text-slate-800 text-base">{group.name}</h4>
                    <span className="text-xs font-bold px-2 py-1 bg-slate-200 text-slate-600 rounded-lg">
                      {group.locations.length} Duplicates
                    </span>
                  </div>

                  <div className="p-2 divide-y divide-slate-100">
                    {group.locations.map(loc => {
                      const isSelected = selections[group.name] === loc.id;
                      return (
                        <div 
                          key={loc.id}
                          onClick={() => setSelections(prev => ({ ...prev, [group.name]: loc.id }))}
                          className={`flex items-center gap-4 p-3 rounded-xl cursor-pointer transition-colors ${
                            isSelected ? 'bg-amber-50/50 hover:bg-amber-50' : 'hover:bg-slate-50'
                          }`}
                        >
                          <div className="flex items-center justify-center w-5">
                            <input 
                              type="radio" 
                              checked={isSelected}
                              onChange={() => setSelections(prev => ({ ...prev, [group.name]: loc.id }))}
                              className="w-4 h-4 text-amber-600 focus:ring-amber-500 border-slate-300"
                            />
                          </div>
                          
                          <div className="flex-1 grid grid-cols-3 gap-4 items-center">
                            <div>
                              <div className="text-xs text-slate-400 font-medium mb-0.5">Department</div>
                              <div className="text-sm font-bold text-slate-700 truncate flex items-center gap-1.5">
                                <Building2 className="w-3.5 h-3.5 text-slate-400" />
                                {loc.departmentName || 'Unknown'}
                              </div>
                            </div>
                            <div>
                              <div className="text-xs text-slate-400 font-medium mb-0.5">Building</div>
                              <div className="text-sm font-semibold text-slate-600 truncate flex items-center gap-1.5">
                                <MapPin className="w-3.5 h-3.5 text-slate-400" />
                                {loc.buildingName || '-'}
                              </div>
                            </div>
                            <div>
                              <div className="text-xs text-slate-400 font-medium mb-0.5">Total Assets</div>
                              <div className="text-sm font-bold text-slate-700 flex items-center gap-1.5">
                                <Layers className="w-3.5 h-3.5 text-indigo-400" />
                                {loc.totalAssets}
                              </div>
                            </div>
                          </div>

                          {isSelected && (
                            <div className="px-3 py-1 bg-amber-100 text-amber-700 text-xs font-black rounded-lg uppercase tracking-wide">
                              Master
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  <div className="bg-slate-50 px-5 py-4 border-t border-slate-200 flex justify-end">
                    <button
                      disabled={merging === group.name || !selections[group.name]}
                      onClick={() => handleMerge(group.name, selections[group.name], group.locations)}
                      className="px-5 py-2.5 bg-slate-800 hover:bg-slate-900 text-white text-sm font-bold rounded-xl shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                      {merging === group.name ? (
                        <>
                          <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                          Merging...
                        </>
                      ) : (
                        <>
                          <Combine className="w-4 h-4" />
                          Merge {group.locations.length - 1} into Master
                        </>
                      )}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
