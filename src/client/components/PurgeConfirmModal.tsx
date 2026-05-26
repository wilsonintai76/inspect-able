import React, { useState, useEffect } from 'react';
import { Flame, X, AlertTriangle } from 'lucide-react';

interface PurgeConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  itemType: 'department' | 'location';
  itemName: string;
  archivedBy?: string | null;
  archivedAt?: string | null;
}

export const PurgeConfirmModal: React.FC<PurgeConfirmModalProps> = ({
  isOpen, onClose, onConfirm, itemType, itemName, archivedBy, archivedAt,
}) => {
  const [confirmText, setConfirmText] = useState('');

  useEffect(() => {
    if (isOpen) setConfirmText('');
  }, [isOpen]);

  if (!isOpen) return null;

  const isMatch = confirmText === itemName;

  const formattedDate = archivedAt
    ? new Date(archivedAt).toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric' })
    : null;

  return (
    <div className="fixed inset-0 z-200 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-3xl shadow-2xl w-full max-w-md border border-red-100 overflow-hidden">
        {/* Header */}
        <div className="bg-red-600 px-6 py-5 flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-white/20 flex items-center justify-center">
              <Flame className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-white font-black text-base leading-tight">Permanently Delete {itemType === 'department' ? 'Department' : 'Location'}</h2>
              <p className="text-red-200 text-xs mt-0.5">This action cannot be undone</p>
            </div>
          </div>
          <button title="Close" onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-xl bg-white/10 hover:bg-white/20 text-white transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          {/* Warning */}
          <div className="flex gap-3 bg-red-50 border border-red-100 rounded-2xl p-4">
            <AlertTriangle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
            <div className="text-sm text-red-700 space-y-1">
              <p className="font-bold">All data will be permanently erased.</p>
              <p className="text-red-600 text-xs">
                {itemType === 'department'
                  ? 'Any locations belonging to this department will be unlinked. Associated inspection schedules are not removed.'
                  : 'All inspection schedule entries for this location will also be deleted.'}
              </p>
            </div>
          </div>

          {/* Who archived it */}
          {(archivedBy || formattedDate) && (
            <div className="bg-slate-50 border border-slate-100 rounded-2xl px-4 py-3 text-xs text-slate-500 space-y-0.5">
              {archivedBy && <p><span className="font-semibold text-slate-600">Archived by:</span> {archivedBy}</p>}
              {formattedDate && <p><span className="font-semibold text-slate-600">Archived on:</span> {formattedDate}</p>}
            </div>
          )}

          {/* Type-to-confirm */}
          <div className="space-y-2">
            <label className="block text-sm font-bold text-slate-700">
              Type <span className="font-black text-red-600 select-all bg-red-50 px-1.5 py-0.5 rounded-lg border border-red-100">{itemName}</span> to confirm
            </label>
            <input
              type="text"
              value={confirmText}
              onChange={e => setConfirmText(e.target.value)}
              onPaste={e => e.preventDefault()}
              placeholder={`Type "${itemName}" here`}
              autoFocus
              className={`w-full px-4 py-3 rounded-2xl border text-sm font-mono transition-all outline-none focus:ring-2 ${
                confirmText.length > 0
                  ? isMatch
                    ? 'border-green-300 bg-green-50 focus:ring-green-200 text-green-800'
                    : 'border-red-300 bg-red-50/50 focus:ring-red-200 text-red-800'
                  : 'border-slate-200 bg-slate-50 focus:ring-blue-200'
              }`}
            />
            {confirmText.length > 0 && !isMatch && (
              <p className="text-xs text-red-500 font-medium">Name doesn't match — keep typing</p>
            )}
          </div>

          {/* Action buttons */}
          <div className="flex gap-3 pt-1">
            <button
              onClick={onClose}
              className="flex-1 py-3 rounded-2xl border border-slate-200 text-slate-600 text-sm font-bold hover:bg-slate-50 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => { if (isMatch) { onConfirm(); onClose(); } }}
              disabled={!isMatch}
              className={`flex-1 py-3 rounded-2xl text-sm font-black flex items-center justify-center gap-2 transition-all ${
                isMatch
                  ? 'bg-red-600 text-white hover:bg-red-700 shadow-lg shadow-red-500/20 active:scale-95'
                  : 'bg-slate-100 text-slate-300 cursor-not-allowed'
              }`}
            >
              <Flame className="w-4 h-4" />
              Purge Forever
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
