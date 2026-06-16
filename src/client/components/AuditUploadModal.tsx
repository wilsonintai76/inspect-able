import React, { useState, useEffect } from 'react';
import { AuditSchedule, AuditReport } from '@shared/types';
import { X, UploadCloud, FileText, CheckCircle2, AlertTriangle, ExternalLink, Sparkles, Trash2, History } from 'lucide-react';
import { parsePdfText } from '../lib/pdfParser';

interface AuditUploadModalProps {
  audit: AuditSchedule;
  locationName: string;
  locationTotalAssets: number;
  onClose: () => void;
  onComplete: (
    id: string,
    reportPath: string,
    totalAssetsInspected: number | null,
    assetStatusSummary: string | null,
    verifiedAssetCount: number | null,
    assetStatuses: Record<string, number> | null,
    newLocationTotal?: number
  ) => Promise<void>;
}

export const AuditUploadModal: React.FC<AuditUploadModalProps> = ({
  audit,
  locationName,
  locationTotalAssets,
  onClose,
  onComplete,
}) => {
  const [file, setFile] = useState<File | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Multi-upload: existing reports for this audit
  const [reports, setReports] = useState<AuditReport[]>([]);
  const [loadingReports, setLoadingReports] = useState(true);

  // Fetch existing reports on mount
  useEffect(() => {
    const fetchReports = async () => {
      try {
        const res = await fetch(`/api/audits/${audit.id}/reports`);
        if (res.ok) {
          const data = await res.json() as AuditReport[];
          setReports(data);
        }
      } catch { /* silent */ }
      finally { setLoadingReports(false); }
    };
    fetchReports();
  }, [audit.id]);

  // Legacy/main State
  const [extractedCount, setExtractedCount] = useState<number | null>(null);
  const [extractedStatuses, setExtractedStatuses] = useState<Record<string, number> | null>(null);
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractionNote, setExtractionNote] = useState('');
  const [manualCount, setManualCount] = useState<string>('');
  const [manualStatuses, setManualStatuses] = useState<Record<string, string>>({
    'In Use': '',
    'Not In Use': '',
    'Broken': '',
    'Under Maintenance': '',
    'Borrowed': '',
    'Missing': ''
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

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const droppedFile = e.dataTransfer.files[0];
      validateAndSetFile(droppedFile);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      validateAndSetFile(e.target.files[0]);
    }
  };

  const extractPdfData = async (selectedFile: File) => {
    setExtracting(true);
    setIsExtracting(true);
    setExtractionNote('');
    setExtractedCount(null);
    try {
      const fullText = await parsePdfText(selectedFile);

      // AI Extraction (legacy/main)
      if (fullText.length > 50) {
        const res = await fetch('/api/ai/extract-report-data', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: fullText }),
        });
        if (res.ok) {
          const data = await res.json() as { verifiedAssetCount: number | null, assetStatuses?: Record<string, number> | null, notes: string };
          setExtractedCount(data.verifiedAssetCount);
          if (data.verifiedAssetCount !== null) {
            setManualCount(data.verifiedAssetCount.toString());
          }
          if (data.assetStatuses) {
            setExtractedStatuses(data.assetStatuses);
            const ms: Record<string, string> = { ...manualStatuses };
            for (const [k, v] of Object.entries(data.assetStatuses)) {
              if (ms[k] !== undefined) ms[k] = v.toString();
            }
            setManualStatuses(ms);
          }
          setExtractionNote(data.notes || '');
        }
      }
    } catch (err) {
      console.error("PDF Extraction Error:", err);
    } finally {
      setExtracting(false);
      setIsExtracting(false);
    }
  };

  const validateAndSetFile = (selectedFile: File) => {
    setError(null);
    if (selectedFile.type !== 'application/pdf' && !selectedFile.name.endsWith('.pdf')) {
      setError('Invalid file type. Only KEW-PA 11 PDF documents are accepted.');
      setFile(null);
      return;
    }
    // Limit to 10MB
    if (selectedFile.size > 10 * 1024 * 1024) {
      setError('File size exceeds the 10MB limit.');
      setFile(null);
      return;
    }
    setFile(selectedFile);
    extractPdfData(selectedFile);
  };

  const handleUploadAndComplete = async () => {
    if (!file) {
      setError('Please select a KEW-PA 11 PDF file to upload.');
      return;
    }

    setUploading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch('/api/media/upload', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const errData = (await res.json().catch(() => ({}))) as any;
        throw new Error(errData.error || 'Failed to upload file to storage.');
      }

      const data = await res.json() as { key: string; url: string };

      // Save to audit_reports table (multi-KEWPA)
      try {
        const reportRes = await fetch(`/api/audits/${audit.id}/reports`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ filePath: data.url, fileName: file.name }),
        });
        if (reportRes.ok) {
          const newReport = await reportRes.json() as AuditReport;
          setReports(prev => [newReport, ...prev]);
        }
      } catch { /* non-critical */ }
      
      const finalCount = manualCount.trim() !== '' ? parseInt(manualCount, 10) : (extractedCount ?? null);
      
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
        throw new Error('Inspection not completed or wrong PDF format. The asset status breakdown is empty.');
      }

      if (totalStatusCount !== locationTotalAssets) {
        if (!window.confirm(`The asset status breakdown total (${totalStatusCount}) does not match the location's total assets (${locationTotalAssets}).\n\nDo you want to proceed and update the location's total assets to ${totalStatusCount}?`)) {
          setUploading(false);
          return;
        }
      }

      let computedStatus = "Semua aset dalam keadaan baik (Sedang Digunakan)";
      const brokenCount = parseInt(manualStatuses['Broken'] || '0', 10);
      const missingCount = parseInt(manualStatuses['Missing'] || '0', 10);
      if ((!isNaN(brokenCount) && brokenCount > 0) || (!isNaN(missingCount) && missingCount > 0)) {
        computedStatus = "Terdapat kerosakan/kehilangan aset. Sila semak laporan.";
      }

      await onComplete(
        audit.id, 
        data.url, 
        finalCount, 
        computedStatus,
        isNaN(finalCount!) ? null : finalCount, 
        hasStatuses ? finalStatuses : (extractedStatuses ?? null),
        totalStatusCount !== locationTotalAssets ? totalStatusCount : undefined
      );
      onClose();
    } catch (err: any) {
      setError(err.message || 'An unexpected error occurred during upload.');
    } finally {
      setUploading(false);
    }
  };

  const handleDeleteReport = async (reportId: string) => {
    try {
      const res = await fetch(`/api/audits/${audit.id}/reports/${reportId}`, { method: 'DELETE' });
      if (res.ok) {
        setReports(prev => prev.filter(r => r.id !== reportId));
      }
    } catch { /* silent */ }
  };

  return (
    <div className="fixed inset-0 z-200 flex items-center justify-center p-4">
      <div 
        className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200" 
        onClick={onClose}
      ></div>
      <div className="relative bg-white w-full max-w-lg rounded-[32px] shadow-2xl overflow-hidden animate-in zoom-in duration-200 flex flex-col">
        {/* Header */}
        <div className="bg-slate-900 p-6 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-emerald-500/10 border border-emerald-500/20 rounded-xl flex items-center justify-center text-emerald-400">
              <UploadCloud className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm md:text-base font-black text-white uppercase tracking-wider">Complete Inspection</h3>
              <p className="text-slate-400 text-[10px] font-bold uppercase tracking-wider">Upload KEW-PA 11 Document</p>
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
        <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto">
          <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200/60 space-y-1">
            <div className="text-[9px] font-black uppercase text-slate-400 tracking-widest">Asset Location</div>
            <div className="text-sm font-bold text-slate-900">{locationName}</div>
            {audit.date && (
              <div className="text-[10px] text-slate-500 font-bold flex items-center gap-1.5 pt-1">
                <span>Date: {audit.date}</span>
              </div>
            )}
          </div>

          {/* Previous KEW-PA 11 Uploads */}
          {!loadingReports && reports.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-[10px] font-black uppercase text-slate-500 tracking-widest">
                <History className="w-3.5 h-3.5" /> Previous Uploads ({reports.length})
              </div>
              <div className="space-y-1.5 max-h-40 overflow-y-auto">
                {reports.map((r) => (
                  <div key={r.id} className="flex items-center justify-between p-3 bg-slate-50 border border-slate-200 rounded-xl">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <FileText className="w-4 h-4 text-emerald-600 shrink-0" />
                      <div className="min-w-0">
                        <div className="text-[11px] font-bold text-slate-700 truncate">{r.fileName || 'KEW-PA 11'}</div>
                        <div className="text-[9px] text-slate-400 font-medium">{r.uploadedAt ? new Date(r.uploadedAt).toLocaleDateString('en-GB') : ''}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <a href={r.filePath} target="_blank" rel="noreferrer"
                        className="px-2.5 py-1.5 text-[9px] font-black uppercase text-emerald-600 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100 transition-colors">
                        View
                      </a>
                      <button onClick={() => handleDeleteReport(r.id)}
                        className="flex items-center gap-1 px-2 py-1 text-[9px] font-bold text-rose-500 hover:bg-rose-50 rounded-lg transition-colors"
                        title="Delete this upload">
                        <Trash2 className="w-3 h-3" /> Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Current Document if already exists */}
          {audit.reportPath && (audit.reportPath.startsWith('http') || audit.reportPath.startsWith('/')) && (
            <div className="p-4 bg-emerald-50 border border-emerald-100 rounded-2xl flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-emerald-100 rounded-lg flex items-center justify-center text-emerald-600">
                  <CheckCircle2 className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-[9px] font-black text-emerald-700 uppercase tracking-widest leading-none mb-1">Already Documented</div>
                  <div className="text-[10px] text-emerald-600 font-medium">
                    KEW-PA 11 PDF is stored in Cloudflare R2
                  </div>
                </div>
              </div>
              <a 
                href={audit.reportPath}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1.5 px-3 py-1.5 bg-white text-emerald-600 border border-emerald-200 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-emerald-50 transition-colors shadow-sm"
              >
                View PDF <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          )}

          {/* Uploader Box */}
          <div 
            onDragEnter={handleDrag}
            onDragOver={handleDrag}
            onDragLeave={handleDrag}
            onDrop={handleDrop}
            className={`border-2 border-dashed rounded-3xl p-8 flex flex-col items-center justify-center gap-3 text-center transition-all ${
              dragActive 
                ? 'border-blue-500 bg-blue-50/50 scale-[0.99]' 
                : file 
                ? 'border-emerald-500 bg-emerald-50/10' 
                : 'border-slate-300 hover:border-blue-500 hover:bg-slate-50/40'
            }`}
          >
            {file ? (
              <>
                <div className="w-14 h-14 bg-emerald-100 border border-emerald-200 rounded-2xl flex items-center justify-center text-emerald-600 shadow-md shadow-emerald-500/5 animate-bounce">
                  <FileText className="w-7 h-7" />
                </div>
                <div className="space-y-1">
                  <div className="text-xs font-bold text-slate-800 break-all px-4">{file.name}</div>
                  <div className="text-[10px] text-slate-400 font-bold font-mono">{(file.size / (1024 * 1024)).toFixed(2)} MB</div>
                </div>
                <button 
                  onClick={() => setFile(null)}
                  disabled={uploading}
                  className="text-[9px] font-black uppercase text-rose-500 tracking-widest hover:text-rose-600 transition-colors mt-1"
                >
                  Change File
                </button>
                
                {isExtracting ? (
                  <div className="mt-4 flex items-center gap-2 text-[10px] text-blue-600 font-bold bg-blue-50 px-3 py-1.5 rounded-lg border border-blue-100">
                    <div className="w-3 h-3 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                    Extracting asset data via AI...
                  </div>
                ) : (
                  <div className="mt-4 w-full text-left space-y-3 bg-white p-4 rounded-xl border border-slate-200">
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
                      {extractedCount !== null && manualCount === extractedCount.toString() && (
                         <div className="text-[9px] text-emerald-600 font-bold mt-1.5 flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3" /> Auto-extracted by AI
                         </div>
                      )}
                      {extractedCount === null && (
                         <div className="text-[9px] text-amber-600 font-bold mt-1.5 flex items-start gap-1">
                            <AlertTriangle className="w-3 h-3 shrink-0 mt-0.5" /> AI could not extract the count. Please enter manually.
                         </div>
                      )}
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
                )}
              </>
            ) : (
              <>
                <div className="w-14 h-14 bg-slate-100 border border-slate-200 rounded-2xl flex items-center justify-center text-slate-400 shadow-inner">
                  <UploadCloud className="w-7 h-7" />
                </div>
                <div className="space-y-1">
                  <div className="text-xs font-bold text-slate-700">Drag & Drop KEW-PA 11 PDF here</div>
                  <p className="text-[10px] text-slate-400 font-medium">Or click below to browse your computer (Max 10MB)</p>
                </div>
                <label className="mt-2 px-4 py-2 bg-slate-100 border border-slate-200 rounded-xl text-[10px] font-black uppercase tracking-widest text-slate-600 hover:bg-slate-200 transition-all cursor-pointer shadow-sm hover:scale-[1.02] active:scale-95">
                  Browse File
                  <input 
                    type="file" 
                    accept=".pdf,application/pdf"
                    className="hidden" 
                    onChange={handleFileChange}
                  />
                </label>
              </>
            )}
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
            disabled={uploading}
            className="px-5 py-2.5 rounded-xl font-bold text-slate-500 hover:bg-slate-200 transition-colors text-xs uppercase tracking-widest"
          >
            Cancel
          </button>
          <button 
            onClick={handleUploadAndComplete}
            disabled={!file || uploading || extracting}
            className="px-5 py-2.5 rounded-xl font-black text-white bg-emerald-600 hover:bg-emerald-700 shadow-lg shadow-emerald-500/20 active:scale-95 transition-all text-xs uppercase tracking-widest flex items-center gap-2 disabled:opacity-50 disabled:pointer-events-none disabled:shadow-none"
          >
            {uploading ? (
              <>
                <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                Uploading & Saving...
              </>
            ) : (
              'Upload & Complete'
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
