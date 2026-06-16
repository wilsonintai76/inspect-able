import React from 'react';
import { useCallback } from 'react';
import { AuditSchedule, User, AuditPhase, SystemActivity } from '@shared/types';
import { gateway } from '../services/dataGateway';
import { ToastType } from '../components/Toast';

interface UseAuditActionsProps {
  schedules: AuditSchedule[];
  setSchedules: React.Dispatch<React.SetStateAction<AuditSchedule[]>>;
  users: User[];
  auditPhases: AuditPhase[];
  setActivities: React.Dispatch<React.SetStateAction<SystemActivity[]>>;
  setIsProcessing: React.Dispatch<React.SetStateAction<boolean>>;
  showToast: (message: string, type?: ToastType, duration?: number) => void;
  showError: (error: any, title?: string) => void;
  customConfirm: (title: string, message: string, onConfirm: () => void, isDestructive?: boolean) => void;
}

export const useAuditActions = (props: UseAuditActionsProps) => {
  const { schedules, setSchedules, users, auditPhases, setActivities, setIsProcessing, showToast, showError, customConfirm } = props;

  const isAuditLocked = (audit: AuditSchedule) => audit.isLocked === true;

  const handleToggleLock = async (id: string) => {
    const audit = schedules.find(a => a.id === id);
    if (!audit) return;
    try {
      const currentlyLocked = isAuditLocked(audit);
      const newLocked = !currentlyLocked;
      await gateway.updateAudit(id, { isLocked: newLocked });
      setSchedules(prev => prev.map(s => {
        if (s.id !== id) return s;
        const updated = { ...s, isLocked: newLocked };
        if (!newLocked && s.status === 'In Progress') updated.status = 'Pending';
        return updated;
      }));
      showToast(newLocked ? 'Locked' : 'Unlocked');
    } catch (e) { showError(e); }
  };

  const handleAssign = async (id: string, slot: 1 | 2, userId: string) => {
    const snapshot = schedules.find(s => s.id === id);
    try {
      const audit = snapshot;
      if (!audit) return;
      const u = users.find(user => user.id === userId);
      if (!(u?.certificationExpiry && u.certificationExpiry >= new Date().toISOString().split('T')[0])) throw new Error("Cert required.");
      const slotUpdate: Partial<AuditSchedule> = slot === 1 ? { auditor1Id: userId } : { auditor2Id: userId };
      
      // Optimistic update
      setSchedules(prev => prev.map(s => {
        if (s.id !== id) return s;
        const updated = { ...s, ...slotUpdate };
        if (updated.status === 'Pending' && updated.date && updated.supervisorId && updated.auditor1Id && updated.auditor2Id) {
          updated.status = 'In Progress';
          updated.isLocked = true;
          const matchingPhase = auditPhases.find(p => {
            const d = new Date(updated.date!);
            return d >= new Date(p.startDate) && d <= new Date(p.endDate);
          });
          if (matchingPhase) updated.phaseId = matchingPhase.id;
        } else if (updated.status === 'In Progress' && (!updated.date || !updated.supervisorId || !updated.auditor1Id || !updated.auditor2Id)) {
          updated.status = 'Pending';
        }
        return updated;
      }));

      await gateway.updateAudit(id, slotUpdate);
      
      const projected = { ...audit, ...slotUpdate };
      const willStart = projected.date && projected.supervisorId && projected.auditor1Id && projected.auditor2Id;
      showToast(willStart ? 'Assigned and scheduled!' : 'Assigned');
    } catch (e) {
      // Rollback
      if (snapshot) setSchedules(prev => prev.map(s => s.id === id ? snapshot : s));
      showError(e);
    }
  };

  const handleUnassign = async (id: string, slot: 1 | 2) => {
    const snapshot = schedules.find(s => s.id === id);
    try {
      const slotUpdate: Partial<AuditSchedule> = slot === 1 ? { auditor1Id: null } : { auditor2Id: null };
      
      // Optimistic update
      setSchedules(prev => prev.map(s => {
        if (s.id !== id) return s;
        const updated = { ...s, ...slotUpdate };
        if (updated.status === 'In Progress' && (!updated.date || !updated.supervisorId || !updated.auditor1Id || !updated.auditor2Id)) {
          updated.status = 'Pending';
        }
        return updated;
      }));

      await gateway.updateAudit(id, slotUpdate);
    } catch (e) { 
      // Rollback
      if (snapshot) setSchedules(prev => prev.map(s => s.id === id ? snapshot : s));
      showError(e); 
    }
  };

  const handleDeleteAudit = async (id: string) => {
    customConfirm("Delete Audit", "Are you sure?", async () => {
      try { await gateway.deleteAudit(id); setSchedules(prev => prev.filter(s => s.id !== id)); showToast('Deleted'); }
      catch (e) { showError(e); }
    });
  };

  const handleUpdateAudit = async (id: string, updates: Partial<AuditSchedule>) => {
    const snapshot = schedules.find(s => s.id === id);
    try {
      const audit = snapshot;
      if (audit) {
        const currentStatus = updates.status || audit.status;
        const finalDate = updates.date !== undefined ? updates.date : audit.date;
        const finalSupervisor = updates.supervisorId !== undefined ? updates.supervisorId : audit.supervisorId;
        const finalAuditor1 = updates.auditor1Id !== undefined ? updates.auditor1Id : audit.auditor1Id;
        const finalAuditor2 = updates.auditor2Id !== undefined ? updates.auditor2Id : audit.auditor2Id;
        if (currentStatus === 'Pending' && finalDate && finalSupervisor && finalAuditor1 && finalAuditor2) {
          updates.status = 'In Progress';
          updates.isLocked = true;
          // Phase assigned only now — when all slots filled and status → In Progress
          const matchingPhase = auditPhases.find(p => {
            const d = new Date(finalDate);
            return d >= new Date(p.startDate) && d <= new Date(p.endDate);
          });
          if (matchingPhase) updates.phaseId = matchingPhase.id;
        } else if (currentStatus === 'In Progress' && (!finalDate || !finalSupervisor || !finalAuditor1 || !finalAuditor2)) {
          updates.status = 'Pending';
        }
      }
      // Optimistic update — reflect change immediately so UI feels instant
      setSchedules(prev => prev.map(s => s.id === id ? { ...s, ...updates } : s));
      await gateway.updateAudit(id, updates);
    } catch (e) {
      // Roll back optimistic update on failure
      if (snapshot) setSchedules(prev => prev.map(s => s.id === id ? snapshot : s));
      showError(e);
    }
  };

  const handleUpdateAuditDate = async (id: string, date: string) => {
    const snapshot = schedules.find(s => s.id === id);
    try {
      const audit = snapshot;
      let resolvedPhaseId: string | null = null;
      if (date) {
        resolvedPhaseId = auditPhases.find(p => date >= p.startDate && date <= p.endDate)?.id ?? null;
      }
      let updates: Partial<AuditSchedule> = { date };
      if (audit) {
        const currentStatus = updates.status || audit.status;
        if (currentStatus === 'Pending' && date && audit.supervisorId && audit.auditor1Id && audit.auditor2Id) {
          updates.status = 'In Progress';
          updates.isLocked = true;
          // Phase only assigned when transitioning to In Progress (all slots filled)
          if (resolvedPhaseId) updates.phaseId = resolvedPhaseId;
        } else if (currentStatus === 'In Progress' && (!date || !audit.supervisorId || !audit.auditor1Id || !audit.auditor2Id)) {
          updates.status = 'Pending';
        }
      }
      // Optimistic update — reflect the date immediately so UI feels instant
      setSchedules(prev => prev.map(s => s.id === id ? { ...s, ...updates } : s));
      await gateway.updateAudit(id, updates);
    } catch (e) {
      // Roll back optimistic update on failure
      if (snapshot) setSchedules(prev => prev.map(s => s.id === id ? snapshot : s));
      showError(e);
    }
  };

  const handleToggleStatus = async (id: string) => {
    try {
      const s = schedules.find(x => x.id === id); if (!s) return;
      const status = s.status === 'In Progress' ? 'Completed' : 'In Progress';
      const updates: Partial<AuditSchedule> = { status };
      if (status === 'Completed') updates.isLocked = true;
      await gateway.updateAudit(id, updates);
      setSchedules(prev => prev.map(x => x.id === id ? { ...x, ...updates } : x));
    } catch (e) { showError(e); }
  };

  const handleBulkAddAudits = async (newAudits: Omit<AuditSchedule, 'id'>[]) => {
    try {
      const created = await gateway.bulkAddAudits(newAudits);
      setSchedules(prev => [...prev, ...created]);
      showToast(`Added ${created.length} audits`);
    } catch (e) { showError(e); }
  };

  return { isAuditLocked, handleToggleLock, handleAssign, handleUnassign, handleDeleteAudit,
    handleUpdateAudit, handleUpdateAuditDate, handleToggleStatus, handleBulkAddAudits };
};
