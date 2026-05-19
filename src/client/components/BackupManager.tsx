import React from 'react';
import {
  DatabaseBackup, RefreshCw, CheckCircle, AlertCircle, Download,
  Upload, Trash2, CloudOff, Clock, HardDrive, RotateCcw, ChevronDown,
} from 'lucide-react';
import { getAuthHeaders } from '../services/honoClient';

interface BackupFile {
  key: string;
  size: number;
  uploaded: string;
}

interface BackupListResult {
  files: BackupFile[];
}

interface BackupCreateResult {
  success: boolean;
  key?: string;
  tablesSync?: number;
  rowsSync?: number;
  errors?: string[];
  error?: string;
}

interface RestoreResult {
  success: boolean;
  results?: Record<string, { deleted: number; inserted: number }>;
  errors?: string[];
  error?: string;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function formatKey(key: string): string {
  // backups/2026-05-19T02-00-00Z.json → 2026-05-19 02:00:00 UTC
  const name = key.replace('backups/', '').replace('.json', '');
  try {
    const iso = name.replace(/T(\d{2})-(\d{2})-(\d{2})Z/, 'T$1:$2:$3Z');
    const d = new Date(iso);
    return d.toLocaleString('en-MY', {
      year: 'numeric', month: 'short', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      timeZone: 'Asia/Kuala_Lumpur', hour12: false,
    }) + ' MYT';
  } catch {
    return name;
  }
}

export const BackupManager: React.FC = () => {
  const [files, setFiles] = React.useState<BackupFile[]>([]);
  const [loadingList, setLoadingList] = React.useState(false);
  const [isBacking, setIsBacking] = React.useState(false);
  const [isRestoring, setIsRestoring] = React.useState(false);
  const [downloadingKey, setDownloadingKey] = React.useState<string | null>(null);
  const [listError, setListError] = React.useState<string | null>(null);
  const [actionStatus, setActionStatus] = React.useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [showRestorePanel, setShowRestorePanel] = React.useState(false);
  const [restoreFile, setRestoreFile] = React.useState<File | null>(null);
  const [confirmText, setConfirmText] = React.useState('');
  const [restorePreview, setRestorePreview] = React.useState<{ tables: string[]; rows: number } | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const loadBackups = React.useCallback(async () => {
    setLoadingList(true);
    setListError(null);
    try {
      const res = await fetch('/api/db/backups', { headers: await getAuthHeaders() });
      const data = await res.json() as BackupListResult;
      setFiles(data.files || []);
    } catch (err: any) {
      setListError(err.message);
    } finally {
      setLoadingList(false);
    }
  }, []);

  React.useEffect(() => { loadBackups(); }, [loadBackups]);

  const handleBackupNow = async () => {
    setIsBacking(true);
    setActionStatus(null);
    try {
      const res = await fetch('/api/db/backup', {
        method: 'POST',
        headers: await getAuthHeaders(),
      });
      const data = await res.json() as BackupCreateResult;
      if (res.ok && data.success) {
        const msg = `Backup saved: ${data.tablesSync} tables, ${data.rowsSync} rows → ${data.key}`;
        setActionStatus({ type: 'success', message: msg });
        await loadBackups();
      } else {
        setActionStatus({ type: 'error', message: data.error || 'Backup failed.' });
      }
    } catch (err: any) {
      setActionStatus({ type: 'error', message: err.message });
    } finally {
      setIsBacking(false);
    }
  };

  const handleDownload = async (key: string) => {
    setDownloadingKey(key);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/db/backups/download?key=${encodeURIComponent(key)}`, { headers });
      if (!res.ok) throw new Error('Download failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = key.split('/').pop() ?? 'backup.json';
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      setActionStatus({ type: 'error', message: err.message });
    } finally {
      setDownloadingKey(null);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setRestoreFile(file);
    setConfirmText('');
    setRestorePreview(null);
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const parsed = JSON.parse(ev.target?.result as string);
        if (parsed.snapshot) {
          const tables = Object.keys(parsed.snapshot);
          const rows = tables.reduce((sum, t) => sum + (parsed.snapshot[t]?.length ?? 0), 0);
          setRestorePreview({ tables, rows });
        }
      } catch {
        setRestorePreview(null);
      }
    };
    reader.readAsText(file);
  };

  const handleRestore = async () => {
    if (!restoreFile || confirmText !== 'RESTORE') return;
    setIsRestoring(true);
    setActionStatus(null);
    try {
      const text = await restoreFile.text();
      const parsed = JSON.parse(text);
      const res = await fetch('/api/db/backups/restore', {
        method: 'POST',
        headers: { ...(await getAuthHeaders()), 'Content-Type': 'application/json' },
        body: JSON.stringify({ snapshot: parsed.snapshot }),
      });
      const data = await res.json() as RestoreResult;
      if (res.ok && data.success) {
        const totalInserted = Object.values(data.results ?? {}).reduce((s, r) => s + r.inserted, 0);
        const totalDeleted = Object.values(data.results ?? {}).reduce((s, r) => s + r.deleted, 0);
        const msg = `Restore complete: ${totalInserted} rows inserted, ${totalDeleted} rows cleared.${(data.errors?.length ?? 0) > 0 ? ' Warnings: ' + data.errors!.join('; ') : ''}`;
        setActionStatus({ type: 'success', message: msg });
        setShowRestorePanel(false);
        setRestoreFile(null);
        setConfirmText('');
        setRestorePreview(null);
      } else {
        setActionStatus({ type: 'error', message: data.error || 'Restore failed.' });
      }
    } catch (err: any) {
      setActionStatus({ type: 'error', message: err.message });
    } finally {
      setIsRestoring(false);
    }
  };

  return (
    <div className="rounded-[32px] border-2 border-blue-100 bg-blue-50 overflow-hidden">
      {/* Header */}
      <div className="p-8 pb-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center shrink-0">
              <DatabaseBackup className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-blue-900">Database Backup &amp; Restore</h3>
              <p className="text-sm text-blue-700 mt-0.5">
                Snapshots saved to Cloudflare R2. Auto-backup runs daily at 10:00 AM MYT.
              </p>
            </div>
          </div>
          <button
            title="Backup Now"
            onClick={handleBackupNow}
            disabled={isBacking}
            className="shrink-0 px-5 py-2.5 rounded-xl text-sm font-bold bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 transition-all"
          >
            {isBacking ? <RefreshCw className="w-4 h-4 animate-spin" /> : <DatabaseBackup className="w-4 h-4" />}
            {isBacking ? 'Backing up…' : 'Backup Now'}
          </button>
        </div>

        {actionStatus && (
          <div className={`mt-4 flex items-start gap-2 text-sm font-medium rounded-xl px-4 py-3 ${
            actionStatus.type === 'success' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-red-50 text-red-700 border border-red-200'
          }`}>
            {actionStatus.type === 'success'
              ? <CheckCircle className="w-4 h-4 shrink-0 mt-0.5" />
              : <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />}
            <span>{actionStatus.message}</span>
          </div>
        )}
      </div>

      {/* Backup List */}
      <div className="px-8 pb-4">
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-[10px] font-black uppercase tracking-widest text-blue-400">Saved Backups in R2</h4>
          <button
            title="Refresh list"
            onClick={loadBackups}
            disabled={loadingList}
            className="text-[11px] font-bold text-blue-600 hover:text-blue-800 flex items-center gap-1 transition-colors"
          >
            <RefreshCw className={`w-3 h-3 ${loadingList ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        {loadingList ? (
          <div className="flex items-center gap-2 text-sm text-blue-500 py-4">
            <RefreshCw className="w-4 h-4 animate-spin" />
            Loading backups…
          </div>
        ) : listError ? (
          <div className="flex items-center gap-2 text-sm text-red-600 py-4">
            <CloudOff className="w-4 h-4" />
            {listError}
          </div>
        ) : files.length === 0 ? (
          <div className="text-sm text-blue-400 py-4 text-center">
            No backups found. Click "Backup Now" to create your first snapshot.
          </div>
        ) : (
          <div className="space-y-2 max-h-60 overflow-y-auto custom-scrollbar pr-1">
            {files.map((f) => (
              <div key={f.key} className="flex items-center justify-between bg-white rounded-2xl px-4 py-3 border border-blue-100 gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <HardDrive className="w-4 h-4 text-blue-400 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-slate-800 truncate">{formatKey(f.key)}</p>
                    <div className="flex items-center gap-2 text-[11px] text-slate-400 font-medium mt-0.5">
                      <Clock className="w-3 h-3" />
                      {formatBytes(f.size)}
                    </div>
                  </div>
                </div>
                <button
                  title="Download backup"
                  onClick={() => handleDownload(f.key)}
                  disabled={downloadingKey === f.key}
                  className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold text-blue-600 bg-blue-50 hover:bg-blue-100 border border-blue-200 transition-all disabled:opacity-50"
                >
                  {downloadingKey === f.key
                    ? <RefreshCw className="w-3 h-3 animate-spin" />
                    : <Download className="w-3 h-3" />}
                  Download
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Restore Section */}
      <div className="px-8 pb-8">
        <div className="border-t border-blue-200 pt-5">
          <button
            title="Toggle restore panel"
            onClick={() => setShowRestorePanel(v => !v)}
            className="flex items-center gap-2 text-[11px] font-black uppercase tracking-widest text-amber-600 hover:text-amber-700 transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Restore from Backup
            <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showRestorePanel ? 'rotate-180' : ''}`} />
          </button>

          {showRestorePanel && (
            <div className="mt-4 bg-amber-50 border-2 border-amber-200 rounded-2xl p-5 space-y-4 animate-in fade-in slide-in-from-top-2 duration-200">
              <div className="flex items-start gap-2 text-amber-800">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <p className="text-xs font-bold leading-relaxed">
                  This will <span className="text-red-600">delete all existing data</span> and replace it with the contents of the backup file. This action cannot be undone.
                </p>
              </div>

              {/* File picker */}
              <div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".json"
                  title="Select backup JSON file"
                  aria-label="Select backup JSON file"
                  className="hidden"
                  onChange={handleFileSelect}
                />
                <button
                  title="Select backup file"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold border-2 border-dashed border-amber-300 text-amber-700 hover:bg-amber-100 transition-all w-full justify-center"
                >
                  <Upload className="w-4 h-4" />
                  {restoreFile ? restoreFile.name : 'Select backup .json file'}
                </button>
              </div>

              {/* Preview */}
              {restorePreview && (
                <div className="bg-white rounded-xl px-4 py-3 border border-amber-200 text-xs space-y-1">
                  <p className="font-black text-slate-700 uppercase tracking-wider">Backup Contents</p>
                  <p className="text-slate-600">{restorePreview.tables.length} tables · {restorePreview.rows.toLocaleString()} rows</p>
                  <p className="text-slate-400 font-mono truncate">{restorePreview.tables.join(', ')}</p>
                </div>
              )}

              {/* Confirmation */}
              {restoreFile && (
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-red-500 block">
                    Type RESTORE to confirm
                  </label>
                  <input
                    type="text"
                    title="Type RESTORE to confirm"
                    aria-label="Type RESTORE to confirm"
                    value={confirmText}
                    onChange={e => setConfirmText(e.target.value)}
                    placeholder="RESTORE"
                    className="w-full px-4 py-2.5 bg-white border-2 border-red-200 rounded-xl text-sm font-bold focus:border-red-400 focus:ring-4 focus:ring-red-100 outline-none transition-all"
                  />
                  <button
                    title="Restore database"
                    onClick={handleRestore}
                    disabled={confirmText !== 'RESTORE' || isRestoring}
                    className="w-full py-3 rounded-xl text-sm font-bold bg-red-600 text-white hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-all"
                  >
                    {isRestoring
                      ? <><RefreshCw className="w-4 h-4 animate-spin" /> Restoring…</>
                      : <><Trash2 className="w-4 h-4" /> Restore Database</>}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
