import React from 'react';
import { Location, Department, CrossAuditPermission, AuditPhase, AuditGroup, Building, DepartmentMapping, LocationMapping, AuditSchedule, User } from '@shared/types';
import { gateway } from '../services/dataGateway';
import { bulkManagement } from '../services/bulkManagement';
import { ToastType } from '../components/Toast';

interface UseEntityActionsProps {
  locations: Location[];
  departments: Department[];
  users: User[];
  setLocations: React.Dispatch<React.SetStateAction<Location[]>>;
  setDepartments: React.Dispatch<React.SetStateAction<Department[]>>;
  setUsers: React.Dispatch<React.SetStateAction<User[]>>;
  setSchedules: React.Dispatch<React.SetStateAction<AuditSchedule[]>>;
  setCrossAuditPermissions: React.Dispatch<React.SetStateAction<CrossAuditPermission[]>>;
  setAuditPhases: React.Dispatch<React.SetStateAction<AuditPhase[]>>;
  setAuditGroups: React.Dispatch<React.SetStateAction<AuditGroup[]>>;
  setBuildings: React.Dispatch<React.SetStateAction<Building[]>>;
  setDepartmentMappings: React.Dispatch<React.SetStateAction<DepartmentMapping[]>>;
  setLocationMappings: React.Dispatch<React.SetStateAction<LocationMapping[]>>;
  showToast: (message: string, type?: ToastType, duration?: number) => void;
  showError: (error: any, title?: string) => void;
  customConfirm: (title: string, message: string, onConfirm: () => void, isDestructive?: boolean) => void;
  refreshDepartmentTotals: () => Promise<void>;
}

export const useEntityActions = (props: UseEntityActionsProps) => {
  const { locations, departments, users,
    setLocations, setDepartments, setUsers, setSchedules,
    setCrossAuditPermissions, setAuditPhases, setAuditGroups, setBuildings,
    setDepartmentMappings, setLocationMappings,
    showToast, showError, customConfirm, refreshDepartmentTotals } = props;

  // ── Location CRUD ──────────────────────────────────────────────────────

  const handleAddLoc = async (loc: Omit<Location, 'id'>) => {
    try { await gateway.addLocation(loc); setLocations(await gateway.getLocations()); showToast('Added'); await refreshDepartmentTotals(); }
    catch (e) { showError(e); }
  };

  const handleUpdateLoc = async (id: string, updates: Partial<Location>) => {
    try { await gateway.updateLocation(id, updates); setLocations(await gateway.getLocations()); await refreshDepartmentTotals(); setSchedules(await gateway.getAudits()); }
    catch (e) { showError(e); }
  };

  const handleArchiveLoc = async (id: string) => {
    const loc = locations.find(l => l.id === id); if (!loc) return;
    customConfirm('Archive Location?', `Archive "${loc.name}"?`, async () => {
      try { await gateway.updateLocation(id, { status: 'Archived' }); setLocations(await gateway.getLocations()); await refreshDepartmentTotals(); setSchedules(await gateway.getAudits()); }
      catch (e) { showError(e); }
    });
  };

  const handleApproveArchive = async (locationId: string) => {
    try { await gateway.forceDeleteLocation(locationId); setLocations(prev => prev.filter(l => l.id !== locationId)); await refreshDepartmentTotals(); }
    catch (e) { showError(e); }
  };

  const handleRejectArchive = async (locationId: string) => {
    try { const updated = await gateway.updateLocation(locationId, { status: 'Active' }); setLocations(prev => prev.map(l => l.id === locationId ? (updated as unknown as Location) : l)); setSchedules(await gateway.getAudits()); await refreshDepartmentTotals(); }
    catch (e) { showError(e); }
  };

  const handleSyncLocationNotes = async () => {
    try { await gateway.syncLocationNotes(); setLocations(await gateway.getLocations()); showToast('Names synced to Site Notes'); }
    catch (e) { showError(e); }
  };

  const handleMergeLocations = async (sourceIds: string[], targetId: string) => {
    try { await gateway.mergeLocations(sourceIds, targetId); setLocations(await gateway.getLocations()); showToast('Merged'); await refreshDepartmentTotals(); }
    catch (e) { showError(e); }
  };

  const handleUpdateUninspectedAssetCounts = async (updates: { id: string, uninspectedCount: number }[]) => {
    try { await Promise.all(updates.map(u => gateway.updateLocation(u.id, { uninspectedAssetCount: u.uninspectedCount }))); setLocations(await gateway.getLocations()); showToast('Counts updated'); }
    catch (e) { showError(e); }
  };

  const handleBulkAddLocs = async (newLocs: Omit<Location, 'id'>[]) => {
    try { await gateway.bulkAddLocations(newLocs); setLocations(await gateway.getLocations()); showToast(`Added ${newLocs.length} locations`); }
    catch (e) { showError(e); }
  };

  const handlePurgeLoc = async (id: string) => {
    try { await gateway.purgeLocation(id); setLocations(await gateway.getLocations()); await refreshDepartmentTotals(); showToast('Location permanently deleted'); }
    catch (e) { showError(e); }
  };

  // ── Department CRUD ────────────────────────────────────────────────────

  const handleAddDept = async (dept: Omit<Department, 'id'>) => {
    try { await gateway.addDepartment(dept); setDepartments(await gateway.getDepartments()); showToast('Added'); }
    catch (e) { showError(e); }
  };

  const handleUpdateDept = async (id: string, updates: Partial<Department>) => {
    try { await gateway.updateDepartment(id, updates); setDepartments(await gateway.getDepartments()); showToast('Updated'); }
    catch (e) { showError(e); }
  };

  const handleBulkAddDepts = async (newDepts: Omit<Department, 'id'>[]) => {
    try { await bulkManagement.addDepartments(newDepts, departments, users); setDepartments(await gateway.getDepartments()); setUsers(await gateway.getUsers()); showToast('Imported'); }
    catch (e) { showError(e); }
  };

  const handleBulkUpdateDepts = async (updates: { id: string, data: Partial<Department> }[]) => {
    try { await Promise.all(updates.map(u => gateway.updateDepartment(u.id, u.data))); setDepartments(await gateway.getDepartments()); }
    catch (e) { showError(e); }
  };

  const handleArchiveDept = async (id: string) => {
    customConfirm('Archive Department?', 'Archive this department?', async () => {
      try { await gateway.updateDepartment(id, { isArchived: true }); setDepartments(await gateway.getDepartments()); }
      catch (e) { showError(e); }
    });
  };

  const handlePurgeDept = async (id: string) => {
    try { await gateway.purgeDepartment(id); setDepartments(await gateway.getDepartments()); showToast('Department permanently deleted'); }
    catch (e) { showError(e); }
  };

  // ── Cross-Audit Permissions ────────────────────────────────────────────

  const handleAddPermission = async (auditorDeptId: string, targetDeptId: string, isMutual: boolean) => {
    try { await gateway.addPermission({ auditorDeptId, targetDeptId, isMutual, isActive: true }); setCrossAuditPermissions(await gateway.getPermissions()); }
    catch (e) { showError(e); }
  };

  const handleBulkAddPermissions = async (auditorDept: string, targetDept: string, isMutual: boolean) => {
    try { await gateway.bulkAddPermissions([{ auditorDeptId: auditorDept, targetDeptId: targetDept, isMutual, isActive: true }]); setCrossAuditPermissions(await gateway.getPermissions()); }
    catch (e) { showError(e); }
  };

  const handleBulkRemovePermissions = async (ids: string[]) => {
    try { await gateway.bulkDeletePermissions(ids); setCrossAuditPermissions(await gateway.getPermissions()); }
    catch (e) { showError(e); }
  };

  const handleRemovePermission = async (id: string) => {
    try { await gateway.deletePermission(id); setCrossAuditPermissions(await gateway.getPermissions()); }
    catch (e) { showError(e); }
  };

  const handleTogglePermission = async (id: string, isActive: boolean) => {
    try { await gateway.updatePermission(id, { isActive }); setCrossAuditPermissions(await gateway.getPermissions()); }
    catch (e) { showError(e); }
  };

  const handleResetOnlyPermissions = async () => {
    try { await gateway.resetOnlyPermissions(); setCrossAuditPermissions(await gateway.getPermissions()); }
    catch (e) { showError(e); }
  };

  // ── Audit Phases ───────────────────────────────────────────────────────

  const handleAddPhase = async (phase: Omit<AuditPhase, 'id'>) => {
    try { await gateway.addAuditPhase(phase); setAuditPhases(await gateway.getAuditPhases()); }
    catch (e) { showError(e); }
  };

  const handleUpdatePhase = async (id: string, updates: Partial<AuditPhase>) => {
    try { await gateway.updateAuditPhase(id, updates); setAuditPhases(await gateway.getAuditPhases()); }
    catch (e) { showError(e); }
  };

  const handleDeletePhase = async (id: string) => {
    try { await gateway.deleteAuditPhase(id); setAuditPhases(await gateway.getAuditPhases()); }
    catch (e) { showError(e); }
  };

  // ── Audit Groups ───────────────────────────────────────────────────────

  const handleAddAuditGroup = async (group: Omit<AuditGroup, 'id'>) => {
    try { await gateway.addAuditGroup(group); setAuditGroups(await gateway.getAuditGroups()); }
    catch (e) { showError(e); }
  };

  const handleUpdateAuditGroup = async (id: string, updates: Partial<AuditGroup>) => {
    try { await gateway.updateAuditGroup(id, updates); setAuditGroups(await gateway.getAuditGroups()); }
    catch (e) { showError(e); }
  };

  const handleDeleteAuditGroup = async (id: string) => {
    try { await gateway.deleteAuditGroup(id); setAuditGroups(await gateway.getAuditGroups()); }
    catch (e) { showError(e); }
  };

  const handleBulkDeleteAuditGroups = async (ids: string[]) => {
    try { await Promise.all(ids.map(id => gateway.deleteAuditGroup(id))); setAuditGroups(await gateway.getAuditGroups()); }
    catch (e) { showError(e); }
  };

  // ── Buildings ──────────────────────────────────────────────────────────

  const handleAddBuilding = async (building: Omit<Building, 'id'>) => {
    try { await gateway.addBuilding(building); setBuildings(await gateway.getBuildings()); }
    catch (e) { showError(e); }
  };

  const handleUpdateBuilding = async (id: string, updates: Partial<Building>) => {
    try { await gateway.updateBuilding(id, updates); setBuildings(await gateway.getBuildings()); }
    catch (e) { showError(e); }
  };

  const handleDeleteBuilding = async (id: string) => {
    try { await gateway.deleteBuilding(id); setBuildings(await gateway.getBuildings()); }
    catch (e) { showError(e); }
  };

  const handleBulkAddBuildings = async (newBuildings: Omit<Building, 'id'>[]) => {
    try { await gateway.bulkAddBuildings(newBuildings); setBuildings(await gateway.getBuildings()); showToast(`Added ${newBuildings.length} buildings`); }
    catch (e) { showError(e); }
  };

  // ── Mappings ───────────────────────────────────────────────────────────

  const handleAddDepartmentMapping = async (mapping: Omit<DepartmentMapping, 'id'>) => {
    try { await gateway.addDepartmentMapping(mapping); setDepartmentMappings(await gateway.getDepartmentMappings()); }
    catch (e) { showError(e); }
  };

  const handleDeleteDepartmentMapping = async (id: string) => {
    try { await gateway.deleteDepartmentMapping(id); setDepartmentMappings(await gateway.getDepartmentMappings()); }
    catch (e) { showError(e); }
  };

  const handleAddLocationMapping = async (mapping: Omit<LocationMapping, 'id'>) => {
    try { await gateway.addLocationMapping(mapping); setLocationMappings(await gateway.getLocationMappings()); }
    catch (e) { showError(e); }
  };

  const handleDeleteLocationMapping = async (id: string) => {
    try { await gateway.deleteLocationMapping(id); setLocationMappings(await gateway.getLocationMappings()); }
    catch (e) { showError(e); }
  };

  const handleSyncLocationMappings = async () => {
    try { await gateway.syncLocationMappings(); setLocationMappings(await gateway.getLocationMappings()); }
    catch (e) { showError(e); }
  };

  const handleSetDeptTotalsFromMapping = async () => {
    try { await gateway.setDeptTotalsFromMapping(); setDepartments(await gateway.getDepartments()); }
    catch (e) { showError(e); }
  };

  const handleUpsertLocations = async (locs: Omit<Location, 'id'>[]) => {
    try { await gateway.upsertLocations(locs); setLocations(await gateway.getLocations()); await refreshDepartmentTotals(); }
    catch (e) { showError(e); }
  };

  return {
    handleAddLoc, handleUpdateLoc, handleArchiveLoc, handleApproveArchive, handleRejectArchive,
    handleSyncLocationNotes, handleMergeLocations, handleUpdateUninspectedAssetCounts,
    handleBulkAddLocs, handlePurgeLoc,
    handleAddDept, handleUpdateDept, handleBulkAddDepts, handleBulkUpdateDepts,
    handleArchiveDept, handlePurgeDept,
    handleAddPermission, handleBulkAddPermissions, handleBulkRemovePermissions,
    handleRemovePermission, handleTogglePermission, handleResetOnlyPermissions,
    handleAddPhase, handleUpdatePhase, handleDeletePhase,
    handleAddAuditGroup, handleUpdateAuditGroup, handleDeleteAuditGroup, handleBulkDeleteAuditGroups,
    handleAddBuilding, handleUpdateBuilding, handleDeleteBuilding, handleBulkAddBuildings,
    handleAddDepartmentMapping, handleDeleteDepartmentMapping,
    handleAddLocationMapping, handleDeleteLocationMapping,
    handleSyncLocationMappings, handleSetDeptTotalsFromMapping, handleUpsertLocations,
  };
};
