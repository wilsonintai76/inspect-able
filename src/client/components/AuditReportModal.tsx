
import React, { useEffect, useState } from 'react';
import { AuditSchedule } from '@shared/types';
import { generateAuditReport } from '../services/aiService';
import { FileText, X, Stamp, Check, Copy } from 'lucide-react';

interface AuditReportModalProps {
  audit: AuditSchedule;
  resolvedData?: {
    locationName: string;
    departmentName: string;
    auditor1Name: string;
    auditor2Name: string;
    supervisorName: string;
  };
  onClose: () => void;
}

export const AuditReportModal: React.FC<AuditReportModalProps> = ({ audit, resolvedData, onClose }) => {
  const [reportText, setReportText] = useState('');
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let mounted = true;
    const fetchReport = async () => {
      const text = await generateAuditReport(audit, resolvedData);
      if (mounted) {
        setReportText(text);
        setLoading(false);
      }
    };
    fetchReport();
    return () => { mounted = false; };
  }, [audit, resolvedData]);

  const handleCopy = () => {
    navigator.clipboard.writeText(reportText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-200 flex items-center justify-center p-4">
      <div 
        className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200" 
        onClick={onClose}
      ></div>
      <div className="relative bg-white w-full max-w-2xl rounded-[32px] shadow-2xl overflow-hidden animate-in zoom-in duration-200 flex flex-col max-h-[90vh]">
        <div className="bg-slate-900 p-6 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white/10 rounded-xl flex items-center justify-center text-white text-lg">
                <FileText className="w-6 h-6" />
            </div>
            <div>
                <h3 className="text-lg font-bold text-white">Movable Asset Inspection Report Generator</h3>
                <p className="text-slate-400 text-xs">AI-Drafted 1PP Compliance Record</p>
            </div>
          </div>
          <button title="Close" onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full bg-white/10 text-slate-300 hover:bg-white/20 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-8 overflow-y-auto bg-slate-50 grow">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-12 space-y-4">
               <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
               <p className="text-slate-500 font-bold animate-pulse">Drafting Official Document...</p>
            </div>
          ) : (
            <div className="bg-white p-8 shadow-sm border border-slate-200 font-mono text-xs md:text-sm leading-relaxed text-slate-700 whitespace-pre-wrap rounded-xl relative">
               <div className="absolute top-4 right-4 opacity-10 pointer-events-none">
                  <Stamp className="w-16 h-16 text-slate-900" />
               </div>
               {reportText}
            </div>
          )}
        </div>

        <div className="p-4 border-t border-slate-200 bg-white shrink-0 flex gap-3 justify-end">
            <button 
                onClick={onClose}
                className="px-6 py-2.5 rounded-xl font-bold text-slate-500 hover:bg-slate-100 transition-colors text-sm"
            >
                Close
            </button>
            <button 
                onClick={handleCopy}
                disabled={loading}
                className="px-6 py-2.5 rounded-xl font-bold text-white bg-blue-600 hover:bg-blue-700 shadow-lg shadow-blue-500/20 active:scale-95 transition-all text-sm flex items-center gap-2 disabled:opacity-50"
            >
                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                {copied ? 'Copied to Clipboard' : 'Copy Report'}
            </button>
        </div>
      </div>
    </div>
  );
};
