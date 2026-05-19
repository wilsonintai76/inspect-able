
import React, { useEffect } from 'react';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface ToastMessage {
  id: string;
  type: ToastType;
  message: string;
  duration?: number;
}

interface ToastProps {
  toast: ToastMessage;
  onClose: (id: string) => void;
}

export const Toast: React.FC<ToastProps> = ({ toast, onClose }) => {
  useEffect(() => {
    const timer = setTimeout(() => {
      onClose(toast.id);
    }, toast.duration || 3000);
    return () => clearTimeout(timer);
  }, [toast, onClose]);

  const getIcon = () => {
    switch (toast.type) {
      case 'success': return <CheckCircle2 className="w-5 h-5 text-emerald-500" />;
      case 'error': return <AlertCircle className="w-5 h-5 text-red-500" />;
      case 'warning': return <AlertCircle className="w-5 h-5 text-amber-500" />;
      default: return <Info className="w-5 h-5 text-blue-500" />;
    }
  };

  const getBgColor = () => {
    switch (toast.type) {
      case 'success': return 'bg-emerald-50 border-emerald-100';
      case 'error': return 'bg-red-50 border-red-100';
      case 'warning': return 'bg-amber-50 border-amber-100';
      default: return 'bg-blue-50 border-blue-100';
    }
  };

  return (
    <div className={`flex items-center gap-3 p-4 pr-3 ${getBgColor()} border rounded-2xl shadow-xl shadow-slate-200/50 animate-in fade-in slide-in-from-right-8 duration-300 max-w-sm w-full pointer-events-auto`}>
      <div className="shrink-0">
        {getIcon()}
      </div>
      <p className="text-sm font-bold text-slate-800 grow leading-tight">
        {toast.message}
      </p>
      <button 
        title="Dismiss"
        onClick={() => onClose(toast.id)}
        className="shrink-0 w-7 h-7 flex items-center justify-center rounded-lg hover:bg-white/50 text-slate-400 hover:text-slate-600 transition-all"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
};

export const ToastContainer: React.FC<{ toasts: ToastMessage[]; onClose: (id: string) => void }> = ({ toasts, onClose }) => {
  return (
    <div className="fixed bottom-6 right-6 z-1000 flex flex-col gap-3 pointer-events-none">
      {toasts.map(toast => (
        <Toast key={toast.id} toast={toast} onClose={onClose} />
      ))}
    </div>
  );
};
