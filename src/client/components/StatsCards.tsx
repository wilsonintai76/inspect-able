
import React from 'react';
import { AuditSchedule } from '@shared/types';
import { ClipboardList, Clock, UserPlus, CheckCircle } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';

interface StatsCardsProps {
  schedules: AuditSchedule[];
}

export const StatsCards: React.FC<StatsCardsProps> = ({ schedules }) => {
  const { t } = useLanguage();
  const total = schedules?.length || 0;
  const pending = schedules?.filter(s => s.status === 'Pending').length || 0;
  const needsOfficers = schedules?.filter(s => !s.auditor1Id || !s.auditor2Id).length || 0;
  const completed = schedules?.filter(s => s.status === 'Completed').length || 0;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
      {/* Total Audits */}
      <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 flex items-center justify-between group hover:shadow-md transition-all duration-300">
        <div>
          <span className="text-slate-500 text-sm font-semibold block mb-2">{t('dashboard.stats_inspections')}</span>
          <div className="text-3xl font-black text-slate-900">{total}</div>
        </div>
        <div className="w-12 h-12 rounded-2xl bg-blue-50 flex items-center justify-center text-blue-500 group-hover:scale-110 transition-transform">
          <ClipboardList className="w-6 h-6" />
        </div>
      </div>

      {/* Pending */}
      <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 flex items-center justify-between group hover:shadow-md transition-all duration-300">
        <div>
          <span className="text-slate-500 text-sm font-semibold block mb-2">{t('dashboard.stats_pending')}</span>
          <div className="text-3xl font-black text-slate-900">{pending}</div>
        </div>
        <div className="w-12 h-12 rounded-2xl bg-amber-50 flex items-center justify-center text-amber-500 group-hover:scale-110 transition-transform">
          <Clock className="w-6 h-6" />
        </div>
      </div>

      {/* Open Slots */}
      <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 flex items-center justify-between group hover:shadow-md transition-all duration-300">
        <div>
          <span className="text-slate-500 text-sm font-semibold block mb-2">{t('dashboard.stats_open_slots')}</span>
          <div className="text-3xl font-black text-slate-900">{needsOfficers}</div>
        </div>
        <div className="w-12 h-12 rounded-2xl bg-emerald-50 flex items-center justify-center text-emerald-500 group-hover:scale-110 transition-transform">
          <UserPlus className="w-6 h-6" />
        </div>
      </div>

      {/* Completed */}
      <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 flex items-center justify-between group hover:shadow-md transition-all duration-300">
        <div>
          <span className="text-slate-500 text-sm font-semibold block mb-2">{t('dashboard.stats_completed')}</span>
          <div className="text-3xl font-black text-slate-900">{completed}</div>
        </div>
        <div className="w-12 h-12 rounded-2xl bg-indigo-50 flex items-center justify-center text-indigo-500 group-hover:scale-110 transition-transform">
          <CheckCircle className="w-6 h-6" />
        </div>
      </div>
    </div>
  );
};
