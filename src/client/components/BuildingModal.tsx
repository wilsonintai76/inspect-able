
import React, { useState, useEffect } from 'react';
import { Building } from '@shared/types';
import { X, Building2, FileText, Check } from 'lucide-react';

interface BuildingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (building: Omit<Building, 'id'> | Partial<Building>) => Promise<void>;
  initialData?: Building | null;
}

export const BuildingModal: React.FC<BuildingModalProps> = ({
  isOpen,
  onClose,
  onSave,
  initialData,
}) => {
  const [formData, setFormData] = useState({
    name: '',
    abbr: '',
    description: '',
    type: 'Administrative' as 'Administrative' | 'Academic' | 'Residential' | 'Workshop/Laboratory' | 'Other',
  });

  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (initialData) {
      setFormData({
        name: initialData.name || '',
        abbr: initialData.abbr || '',
        description: initialData.description || '',
        type: initialData.type || 'Administrative',
      });
    } else {
      setFormData({
        name: '',
        abbr: '',
        description: '',
        type: 'Administrative',
      });
    }
  }, [initialData, isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      await onSave(formData);
      onClose();
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-120 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-300" onClick={onClose}></div>
      <div className="relative bg-white w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="bg-blue-600 p-6 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center">
              <Building2 className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-xl font-bold">{initialData ? 'Reconfigure Building' : 'Register New Building'}</h3>
              <p className="text-blue-100 text-xs mt-0.5">Manage institutional asset storage units.</p>
            </div>
          </div>
          <button title="Close" onClick={onClose} className="w-10 h-10 flex items-center justify-center rounded-2xl bg-white/10 hover:bg-white/20 transition-all active:scale-95">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="overflow-y-auto p-6 md:p-8 custom-scrollbar">
          <form id="building-form" onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-1.5">
              <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest ml-1">Official Building Name</label>
              <div className="relative">
                <Building2 className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300 w-4 h-4" />
                <input 
                  required
                  placeholder="e.g. Workshop Complex A"
                  className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                  value={formData.name}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest ml-1">Standard Abbreviation</label>
              <input 
                required
                placeholder="e.g. WS-A"
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-black focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                value={formData.abbr}
                onChange={e => setFormData({ ...formData, abbr: e.target.value.toUpperCase() })}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest ml-1">Building Category</label>
                <select 
                  title="Building Category"
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                  value={formData.type}
                  onChange={e => setFormData({ ...formData, type: e.target.value as any })}
                >
                  <option value="Administrative">Administrative</option>
                  <option value="Academic">Academic</option>
                  <option value="Residential">Residential (Hostel)</option>
                  <option value="Workshop/Laboratory">Workshop / Laboratory</option>
                  <option value="Other">Other</option>
                </select>
              </div>

            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest ml-1">Internal Reference / Notes</label>
              <div className="relative">
                <FileText className="absolute left-4 top-3.5 text-slate-300 w-4 h-4" />
                <textarea 
                  placeholder="Additional identification details..."
                  className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm min-h-25 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all resize-none font-medium"
                  value={formData.description}
                  onChange={e => setFormData({ ...formData, description: e.target.value })}
                />
              </div>
            </div>
          </form>
        </div>

        {/* Footer */}
        <div className="p-6 md:p-8 border-t border-slate-100 bg-slate-50/50 flex flex-col-reverse sm:flex-row gap-4 shrink-0">
          <button 
            type="button"
            onClick={onClose}
            className="flex-1 py-4 bg-white border border-slate-200 text-slate-600 font-black uppercase tracking-widest text-xs rounded-2xl hover:bg-slate-100 transition-all active:scale-95 shadow-sm"
          >
            Cancel
          </button>
          <button 
            type="submit"
            form="building-form"
            disabled={isSaving || !formData.name || !formData.abbr}
            className="flex-[1.5] py-4 bg-blue-600 text-white font-black uppercase tracking-widest text-xs rounded-2xl hover:bg-blue-700 transition-all active:scale-95 shadow-xl shadow-blue-500/20 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {isSaving ? 'Synching...' : (
              <>
                <Check className="w-4 h-4" />
                {initialData ? 'Update Record' : 'Establish Record'}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
