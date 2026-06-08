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
        if (newLocked && s.status === 'Awaiting Approval') updated.status = 'In Progress';
        else if (!newLocked && s.status === 'In Progress') updated.status = 'Awaiting Approval';
        return updated;
      }));
      showToast(newLocked ? 'Approved & In Progress' : 'Approval Revoked');
    } catch (e) { showError(e); }
  };

  const handleAssign = async (id: string, slot: 1 | 2, userId: string) => {
    try {
      const audit = schedules.find(s => s.id === id);
      if (!audit) return;
      const u = users.find(user => user.id === userId);
      if (!(u?.certificationExpiry && u.certificationExpiry >= new Date().toISOString().split('T')[0])) throw new Error("Cert required.");
      const slotUpdate: Partial<AuditSchedule> = slot === 1 ? { auditor1Id: userId } : { auditor2Id: userId };
      await gateway.updateAudit(id, slotUpdate);
      setSchedules(prev => prev.map(s => {
        if (s.id !== id) return s;
        const updated = { ...s, ...slotUpdate };
        if (updated.status === 'Pending' && updated.date && updated.supervisorId && updated.auditor1Id && updated.auditor2Id) {
          updated.status = 'Awaiting Approval';
        } else if ((updated.status === 'In Progress' || updated.status === 'Awaiting Approval') && (!updated.date || !updated.supervisorId || !updated.auditor1Id || !updated.auditor2Id)) {
          updated.status = 'Pending';
        }
        return updated;
      }));
      const projected = { ...audit, ...slotUpdate };
      const willStart = projected.date && projected.supervisorId && projected.auditor1Id && projected.auditor2Id;
      showToast(willStart ? 'Assigned! Awaiting supervisor approval.' : 'Assigned');
    } catch (e) { showError(e); }
  };

  const handleUnassign = async (id: string, slot: 1 | 2) => {
    try {
      const slotUpdate: Partial<AuditSchedule> = slot === 1 ? { auditor1Id: null } : { auditor2Id: null };
      await gateway.updateAudit(id, slotUpdate);
      setSchedules(prev => prev.map(s => {
        if (s.id !== id) return s;
        const updated = { ...s, ...slotUpdate };
        if ((updated.status === 'In Progress' || updated.status === 'Awaiting Approval') && (!updated.date || !updated.supervisorId || !updated.auditor1Id || !updated.auditor2Id)) {
          updated.status = 'Pending';
        }
        return updated;
      }));
    } catch (e) { showError(e); }
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
        if (updates.date !== undefined) {
          const resolvedPhaseId = updates.date
            ? (auditPhases.find(p => p.startDate <= updates.date! && updates.date! <= p.endDate)?.id ?? null)
            : null;
          if (resolvedPhaseId) updates.phaseId = resolvedPhaseId;
        }
        const currentStatus = updates.status || audit.status;
        const finalDate = updates.date !== undefined ? updates.date : audit.date;
        const finalSupervisor = updates.supervisorId !== undefined ? updates.supervisorId : audit.supervisorId;
        const finalAuditor1 = updates.auditor1Id !== undefined ? updates.auditor1Id : audit.auditor1Id;
        const finalAuditor2 = updates.auditor2Id !== undefined ? updates.auditor2Id : audit.auditor2Id;
        if (currentStatus === 'Pending' && finalDate && finalSupervisor && finalAuditor1 && finalAuditor2)
          updates.status = 'Awaiting Approval';
        else if ((currentStatus === 'In Progress' || currentStatus === 'Awaiting Approval') && (!finalDate || !finalSupervisor || !finalAuditor1 || !finalAuditor2))
          updates.status = 'Pending';
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
      const resolvedPhaseId = date
        ? (auditPhases.find(p => p.startDate <= date && date <= p.endDate)?.id ?? null)
        : null;
      let updates: Partial<AuditSchedule> = resolvedPhaseId ? { date, phaseId: resolvedPhaseId } : { date };
      if (audit) {
        const currentStatus = updates.status || audit.status;
        if (currentStatus === 'Pending' && date && audit.supervisorId && audit.auditor1Id && audit.auditor2Id)
          updates.status = 'Awaiting Approval';
        else if ((currentStatus === 'In Progress' || currentStatus === 'Awaiting Approval') && (!date || !audit.supervisorId || !audit.auditor1Id || !audit.auditor2Id))
          updates.status = 'Pending';
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

  const handleSendApprovalEmail = async (id: string) => {
    setIsProcessing(true);
    try {
      await gateway.sendApprovalEmail(id);
      showToast('Approval reminder email sent successfully!', 'success');
      const acts = await gateway.getSystemActivity();
      setActivities(acts);
    } catch (e) { showError(e); }
    finally { setIsProcessing(false); }
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
    handleUpdateAudit, handleUpdateAuditDate, handleSendApprovalEmail, handleToggleStatus, handleBulkAddAudits };
};
