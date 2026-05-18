
import React, { useState } from 'react';
import { User } from '@shared/types';
import { Award, Stamp, Calendar, CalendarCheck } from 'lucide-react';
import { BRANDING } from '../constants';

interface IssueCertificateModalProps {
  user: User;
  onClose: () => void;
  onIssue: (issuedDate: string, expiryDate: string) => void;
  onRevoke?: () => void;
}

export const IssueCertificateModal: React.FC<IssueCertificateModalProps> = ({ user, onClose, onIssue, onRevoke }) => {
  const today = new Date().toISOString().split('T')[0];
  const [validity, setValidity] = useState('12'); // Months
  const [issueDate, setIssueDate] = useState(today);

  const calculateExpiry = () => {
    const expiry = new Date(issueDate);
    expiry.setMonth(expiry.getMonth() + parseInt(validity));
    return expiry.toISOString().split('T')[0];
  };

  const handleIssue = () => {
    onIssue(issueDate, calculateExpiry());
  };

  return (
    <div className="fixed inset-0 z-200 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm animate-in fade-in" onClick={onClose}></div>
      <div className="relative bg-white w-full max-w-md rounded-[32px] shadow-2xl overflow-hidden animate-in zoom-in duration-200">
        <div className="bg-slate-900 p-8 text-white relative overflow-hidden">
          <Award className="absolute -right-4 -bottom-4 text-white/5 w-32 h-32" />
          <div className="relative z-10 text-center">
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4 overflow-hidden">
              <img 
                src={BRANDING.logoBrand} 
                alt="Logo" 
                className="w-full h-full object-contain" 
              />
            </div>
            <h3 className="text-xl font-black uppercase tracking-tight">Issue Institutional Cert</h3>
            <p className="text-slate-400 text-xs mt-1">Official validation for: <strong>{user.name}</strong></p>
          </div>
        </div>

        <div className="p-8 space-y-6">
          <div className="space-y-3">
             <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest block">Issue Date (Start of Validity)</label>
             <div className="relative group">
                <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4 transition-colors group-focus-within:text-blue-500" />
                <input 
                   type="date"
                   title="Issue Date"
                   placeholder="YYYY-MM-DD"
                   className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-semibold focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 outline-none transition-all"
                   value={issueDate}
                   onChange={(e) => setIssueDate(e.target.value)}
                />
             </div>
          </div>

          <div className="space-y-3">
             <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest block text-center">Select Validity Duration</label>
             <div className="grid grid-cols-3 gap-3">
                {[
                  { label: '6 Months', value: '6' },
                  { label: '1 Year', value: '12' },
                  { label: '2 Years', value: '24' }
                ].map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setValidity(opt.value)}
                    className={`px-2 py-3 rounded-xl text-[9px] font-black uppercase tracking-tight transition-all border-2 ${
                      validity === opt.value 
                        ? 'bg-blue-600 text-white border-blue-600 shadow-lg shadow-blue-500/20' 
                        : 'bg-white text-slate-600 border-slate-100 hover:border-slate-200'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
             </div>
          </div>

          <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
             <div className="flex justify-between items-center mb-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase">Calculated Expiry</span>
                <CalendarCheck className="w-4 h-4 text-blue-500" />
             </div>
             <p className="text-sm font-black text-slate-900 font-mono">
                {calculateExpiry()}
             </p>
          </div>

          <div className="space-y-3 pt-2">
            <button 
              onClick={handleIssue}
              className="w-full py-4 bg-slate-900 text-white font-black text-xs uppercase tracking-widest rounded-2xl shadow-xl hover:bg-black transition-all active:scale-95"
            >
              {user.certificationExpiry ? 'Update & Restamp Certificate' : 'Confirm & Stamp Certificate'}
            </button>
            
            {user.certificationExpiry && onRevoke && (
                <button 
                    onClick={() => onRevoke?.()}
                    className="w-full py-4 bg-rose-50 text-rose-600 font-black text-xs uppercase tracking-widest rounded-2xl border border-rose-100 hover:bg-rose-100 transition-all active:scale-95"
                >
                    Revoke Institutional Certificate
                </button>
            )}

            <button 
              onClick={onClose}
              className="w-full py-4 text-slate-400 font-bold text-xs uppercase hover:text-slate-600 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
