import React, { useState, useEffect } from 'react';
import { AuditSchedule } from '@shared/types';
import { Boxes, X, CheckCircle2, AlertTriangle } from 'lucide-react';

interface AssetStatusModalProps {
  audit: AuditSchedule;
  locationName: string;
  locationTotalAssets: number;
  onClose: () => void;
  onSave: (id: string, verifiedAssetCount: number | null, assetStatuses: Record<string, number> | null, newLocationTotal?: number) => Promise<void>;
}

export const AssetStatusModal: React.FC<AssetStatusModalProps> = ({
  audit,
  locationName,
  locationTotalAssets,
  onClose,
  onSave,
}) => {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [manualCount, setManualCount] = useState<string>(
    audit.verifiedAssetCount !== undefined && audit.verifiedAssetCount !== null 
      ? audit.verifiedAssetCount.toString() 
      : ''
  );
  
  const [manualStatuses, setManualStatuses] = useState<Record<string, string>>({
    'In Use': audit.assetStatuses?.['In Use']?.toString() || '',
    'Not In Use': audit.assetStatuses?.['Not In Use']?.toString() || '',
    'Broken': audit.assetStatuses?.['Broken']?.toString() || '',
    'Under Maintenance': audit.assetStatuses?.['Under Maintenance']?.toString() || '',
    'Borrowed': audit.assetStatuses?.['Borrowed']?.toString() || '',
    'Missing': audit.assetStatuses?.['Missing']?.toString() || ''
  });

  useEffect(() => {
    let sum = 0;
    let hasInput = false;
    for (const v of Object.values(manualStatuses)) {
      if (v.trim() !== '') {
        const val = parseInt(v, 10);
        if (!isNaN(val)) {
          sum += val;
          hasInput = true;
        }
      }
    }
    if (hasInput) {
      setManualCount(sum.toString());
    }
  }, [manualStatuses]);

  const handleSave = async () => {
    setSaving(true);
    setError(null);

    try {
      const finalCount = manualCount.trim() !== '' ? parseInt(manualCount, 10) : null;
      
      const finalStatuses: Record<string, number> = {};
      let hasStatuses = false;
      let totalStatusCount = 0;
      for (const [k, v] of Object.entries(manualStatuses)) {
        if (v.trim() !== '') {
          const val = parseInt(v, 10);
          if (!isNaN(val) && val > 0) {
            finalStatuses[k] = val;
            hasStatuses = true;
            totalStatusCount += val;
          }
        }
      }

      if (!hasStatuses || totalStatusCount === 0) {
        throw new Error('Please enter at least one asset status count.');
      }

      if (totalStatusCount !== locationTotalAssets) {
        if (!window.confirm(`The asset status breakdown total (${totalStatusCount}) does not match the location's total assets (${locationTotalAssets}).\n\nDo you want to proceed and update the location's total assets to ${totalStatusCount}?`)) {
          setSaving(false);
          return;
        }
      }

      await onSave(
        audit.id, 
        isNaN(finalCount!) ? null : finalCount, 
        hasStatuses ? finalStatuses : null,
        totalStatusCount !== locationTotalAssets ? totalStatusCount : undefined
      );
      onClose();
    } catch (err: any) {
      setError(err.message || 'An unexpected error occurred while saving.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-4">
      <div 
        className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200" 
        onClick={onClose}
      ></div>
      <div className="relative bg-white w-full max-w-lg rounded-[32px] shadow-2xl overflow-hidden animate-in zoom-in duration-200 flex flex-col">
        {/* Header */}
        <div className="bg-slate-900 p-6 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-emerald-500/10 border border-emerald-500/20 rounded-xl flex items-center justify-center text-emerald-400">
              <Boxes className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm md:text-base font-black text-white uppercase tracking-wider">Asset Status</h3>
              <p className="text-slate-400 text-[10px] font-bold uppercase tracking-wider">Update status breakdown</p>
            </div>
          </div>
          <button 
            title="Close"
            onClick={onClose} 
            className="w-8 h-8 flex items-center justify-center rounded-full bg-white/10 text-slate-300 hover:bg-white/20 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200/60 space-y-1">
            <div className="text-[9px] font-black uppercase text-slate-400 tracking-widest">Asset Location</div>
            <div className="text-sm font-bold text-slate-900">{locationName}</div>
          </div>

          <div className="w-full text-left space-y-3 bg-white">
            <div>
              <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest block mb-1">
                Total Verified Assets
              </label>
              <input 
                type="number"
                value={manualCount}
                readOnly
                placeholder="Auto-calculated from status breakdown"
                className="w-full bg-slate-100 border border-slate-200 rounded-lg px-3 py-2 text-sm font-bold text-slate-500 cursor-not-allowed focus:outline-none transition-all"
              />
            </div>

            <div className="pt-3 border-t border-slate-100">
              <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest block mb-3">
                Asset Status Breakdown
              </label>
              <div className="grid grid-cols-3 gap-2">
                {Object.keys(manualStatuses).map(status => (
                  <div key={status}>
                    <label className="text-[9px] font-bold text-slate-400 block mb-1">{status}</label>
                    <input 
                      type="number"
                      value={manualStatuses[status]}
                      onChange={(e) => setManualStatuses(prev => ({ ...prev, [status]: e.target.value }))}
                      placeholder="0"
                      className="w-full bg-slate-50 border border-slate-200 rounded-md px-2 py-1 text-xs font-bold text-slate-700 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all"
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>

          {error && (
            <div className="p-3.5 bg-rose-50 border border-rose-100 rounded-2xl flex items-start gap-2.5 text-rose-600 animate-in fade-in duration-150">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <div className="text-[11px] font-bold leading-normal">{error}</div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-200 bg-slate-50 flex gap-3 justify-end shrink-0">
          <button 
            onClick={onClose}
            disabled={saving}
            className="px-5 py-2.5 rounded-xl font-bold text-slate-500 hover:bg-slate-200 transition-colors text-xs uppercase tracking-widest"
          >
            Cancel
          </button>
          <button 
            onClick={handleSave}
            disabled={saving}
            className="px-5 py-2.5 rounded-xl font-black text-white bg-emerald-600 hover:bg-emerald-700 shadow-lg shadow-emerald-500/20 active:scale-95 transition-all text-xs uppercase tracking-widest flex items-center gap-2 disabled:opacity-50 disabled:pointer-events-none disabled:shadow-none"
          >
            {saving ? (
              <>
                <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                Saving...
              </>
            ) : (
              'Save Status'
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
