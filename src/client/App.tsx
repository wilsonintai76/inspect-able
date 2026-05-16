import React, { useState, useEffect, useMemo } from 'react';
import { useRBAC } from './contexts/RBACContext';
import { gateway } from './services/dataGateway';
import { authService } from './services/auth';
import {
  AppView,
  DashboardConfig,
  UserRole
} from '@shared/types';

// Components
import { AuditTable } from './components/AuditTable';
import { UserManagement } from './components/UserManagement';
import { OverviewDashboard } from './components/OverviewDashboard';
import { BuildingManagement } from './components/BuildingManagement';
import { AuditorDashboard } from './components/AuditorDashboard';
import { SystemSettings } from './components/SystemSettings';
import { DepartmentManagement } from './components/DepartmentManagement';
import { LocationManagement } from './components/LocationManagement';
import { UserProfile } from './components/UserProfile';
import { LandingPage } from './components/LandingPage';
import { KnowledgeBase } from './components/KnowledgeBase';
import { AutoUpdater } from './components/AutoUpdater';
import { AdminDashboard } from './components/AdminDashboard';
import { MainAppLayout } from './components/MainAppLayout';
import { GlobalModals } from './components/GlobalModals';

// Hooks
import { useAppData } from './hooks/useAppData';
import { useAppActions } from './hooks/useAppActions';

// Icons
import { ShieldCheck } from 'lucide-react';

const DEFAULT_DASHBOARD_CONFIG: DashboardConfig = {
  showStats: false,
  showTrends: false,
  showUpcoming: true,
  showDeptDistribution: false,
  showKPI: true,
};

const App: React.FC = () => {
  const { rbacMatrix } = useRBAC();

  // Custom Hooks for State and Actions
  const appData = useAppData();
  const appActions = useAppActions({
    ...appData,
    rbacMatrix,
    loadAllData: appData.loadAllData
  });

  const {
    currentUser, viewState, setViewState, activeView, setActiveView, isInitialLoading,
    publicStats, connectionErrorMessage, filteredSchedules,
    departmentsWithAssets, auditPhases, kpiTiers, locations,
    activities, maxAssetsPerDay, auditGroups, institutionKPIs,
    buildings, kpiTierTargets, crossAuditPermissions,
    selectedDept, setSelectedDept, selectedStatus, setSelectedStatus,
    selectedPhaseId, setSelectedPhaseId, groupingMargin, setGroupingMargin,
    isSidebarOpen, setIsSidebarOpen,
    confirmState, setConfirmState, toasts,
    certRenewalModalUser, setCertRenewalModalUser, showForcePasswordModal,
    setShowForcePasswordModal, showProfileCompleteModal, setShowProfileCompleteModal,
    users, departmentNames, setNotifications,
    assignmentMode, openAuditThreshold
  } = appData;

  const {
    handleLoginSuccess, handleLogout, handleViewChange,
    handleIssueCertForRenewal, handleUpdateDashboardConfig,
    handleAssign, handleUnassign, handleUpdateAuditDate,
    handleUpdateAudit, handleToggleStatus, handleToggleLock,
    handleAddMember, handleBulkAddMembers, handleUpdateMember,
    handleDeleteMember, handleUpdateUserRoles, handleUpdateUserStatus,
    handleResetUserPassword, handleAddDept, handleUpdateDept,
    handleBulkUpdateDepts, handleDeleteDept, handleAddAuditGroup,
    handleUpdateAuditGroup, handleDeleteAuditGroup, handleAddLoc,
    handleBulkAddLocs, handleUpdateLoc, handleDeleteLoc,
    handleApproveArchive, handleRejectArchive, handleAddBuilding, handleUpdateBuilding,
    handleBulkAddBuildings, handleDeleteBuilding, handleAddPermission,
    handleRemovePermission, handleTogglePermission, handleBulkAddPermissions,
    handleBulkRemovePermissions, handleLockPairing, handleUnlockPairing,
    handleAddPhase, handleUpdatePhase, handleDeletePhase,
    handleAddKPITier, handleUpdateKPITier, handleDeleteKPITier,
    handleUpdateKPITierTarget, handleUpdateInstitutionKPI,
    handleAutoCalculateTierTargets, handleResetLocations,
    handleResetOperationalData, handleResetDepartments,
    handleResetUsers, handleResetPhases, handleResetKPI,
    handleBulkAddDepts, handleBulkActivateStaff, handleRebalanceSchedule,
    handleAddDepartmentMapping, handleDeleteDepartmentMapping,
    handleSyncLocationMappings, handleUpsertLocations,
    handleSetDeptTotalsFromMapping, handleUpdateUninspectedAssetCounts,
    handleBulkDeleteAuditGroups, handleAutoConsolidate, handleCommitGroups, handleCancelGroupSimulation, handleRunStrategicPairing, handleSaveFeasibilityReport, handleResetPairingData, handleResetOnlyPermissions,
    handleUpdateAssignmentMode, handleUpdateOpenAuditThreshold,
    handleSyncLocationNotes,
    handleMergeLocations,
    handleAddLocationMapping, handleDeleteLocationMapping,
    showToast, closeToast, showError, customConfirm, customAlert
  } = appActions;

  // Initial Data Load
  useEffect(() => { appData.initSession(); }, []);

  if (isInitialLoading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50">
        <div className="relative">
          <div className="w-16 h-16 border-4 border-slate-200 border-t-indigo-600 rounded-full animate-spin"></div>
          <div className="absolute inset-0 flex items-center justify-center">
            <ShieldCheck className="w-6 h-6 text-indigo-600" />
          </div>
        </div>
        <p className="mt-8 text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] animate-pulse">Initializing Platform</p>
      </div>
    );
  }

  if (viewState === 'landing') {
    const hasLiveData = !!currentUser;
    const liveTotalAssets = departmentsWithAssets.reduce((sum, d) => sum + (d.totalAssets || 0), 0);
    const liveCompleted = filteredSchedules.filter(s => s.status === 'Completed').length;
    const liveTotal = filteredSchedules.length;
    const liveCompliance = liveTotal > 0 ? Math.round((liveCompleted / liveTotal) * 100) : 0;

    return (
      <LandingPage
        onEnter={async () => {
          const user = await authService.getCurrentUser();
          if (user) handleLoginSuccess(user);
        }}
        onShowKnowledgeBase={() => appData.setViewState('docs')}
        totalAssets={hasLiveData ? liveTotalAssets : publicStats?.totalAssets}
        totalPhases={hasLiveData ? auditPhases.length : publicStats?.totalPhases}
        complianceProgress={hasLiveData ? liveCompliance : publicStats?.complianceProgress}
        phases={hasLiveData ? auditPhases : (publicStats?.phases || [])}
        activities={hasLiveData ? activities : (publicStats?.activities || [])}
        topDepartments={hasLiveData ? appData.topDepartments : (publicStats?.topDepartments || [])}
      />
    );
  }

  if (viewState === 'docs') {
    return (
      <div className="h-screen bg-slate-50 overflow-x-hidden overflow-y-auto relative">
        <nav className="bg-white border-b border-slate-200 sticky top-0 z-100">
          <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
            <button onClick={() => appData.setViewState('landing')} className="flex items-center gap-2 text-slate-500 hover:text-slate-900 transition-colors text-xs font-bold">
              Back to Home
            </button>
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-slate-900 rounded-lg flex items-center justify-center text-white"><ShieldCheck className="w-4 h-4" /></div>
              <span className="text-sm font-black text-slate-900 tracking-tight">System Documentation</span>
            </div>
          </div>
        </nav>
        <div className="p-8 md:p-12"><KnowledgeBase /></div>
      </div>
    );
  }

  if (!currentUser) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50">
        <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-4"></div>
        <p className="text-slate-500 font-bold animate-pulse">Initializing Session...</p>
      </div>
    );
  }

  const checkProfileComplete = (u: any) => {
    if (!u) return false;
    if ((u.roles || []).includes('Admin')) return true;
    return !!(u.departmentId && u.contactNumber && u.designation);
  };

  const isAdminUser = currentUser.roles?.includes('Admin');
  const visibleUsers = isAdminUser ? users : users.filter(u => u.departmentId === currentUser.departmentId);
  const visibleDepartments = isAdminUser ? departmentsWithAssets : departmentsWithAssets.filter(d => d.id === currentUser?.departmentId);
  const visibleLocations = isAdminUser ? locations : locations.filter(l => l.departmentId === currentUser.departmentId);

  return (
    <MainAppLayout
      currentUser={currentUser}
      isSidebarOpen={isSidebarOpen}
      setIsSidebarOpen={setIsSidebarOpen}
      activeView={activeView}
      handleViewChange={handleViewChange}
      handleLogout={handleLogout}
      rbacMatrix={rbacMatrix}
      checkProfileComplete={checkProfileComplete}
      notifications={appData.notifications}
      setNotifications={appData.setNotifications}
      connectionErrorMessage={connectionErrorMessage}
    >
      <AutoUpdater />
      {activeView === 'overview' && (
        <OverviewDashboard
          schedules={filteredSchedules}
          config={currentUser.dashboardConfig || DEFAULT_DASHBOARD_CONFIG}
          onUpdateConfig={handleUpdateDashboardConfig}
          phases={auditPhases}
          kpiTiers={kpiTiers}
          departments={departmentsWithAssets}
          locations={locations}
          currentUser={currentUser}
          activities={activities}
          maxAssetsPerDay={maxAssetsPerDay}
          auditGroups={auditGroups}
          institutionKPIs={institutionKPIs}
          buildings={buildings}
          rbacMatrix={rbacMatrix}
          kpiTierTargets={kpiTierTargets}
          openAuditThreshold={openAuditThreshold}
          users={users}
          onRebalance={handleRebalanceSchedule}
        />
      )}
      {activeView === 'auditor-dashboard' && (
        <AuditorDashboard
          schedules={appData.schedules}
          currentUser={currentUser}
          phases={auditPhases}
          kpiTiers={kpiTiers}
          departments={departmentsWithAssets}
          locations={locations}
          institutionKPIs={institutionKPIs}
          onRequestRenewal={appActions.handleRequestRenewal}
        />
      )}
      {activeView === 'schedule' && (
        <AuditTable
          schedules={filteredSchedules}
          users={users}
          currentUserName={currentUser.name}
          userRoles={currentUser.roles}
          departments={departmentNames}
          selectedDept={selectedDept}
          onDeptChange={setSelectedDept}
          selectedStatus={selectedStatus}
          onStatusChange={setSelectedStatus}
          selectedPhaseId={selectedPhaseId}
          onPhaseChange={setSelectedPhaseId}
          onAssign={handleAssign}
          onUnassign={handleUnassign}
          onUpdateDate={handleUpdateAuditDate}
          onUpdateAudit={handleUpdateAudit}
          onToggleStatus={handleToggleStatus}
          onToggleLock={handleToggleLock}
          allDepartments={departmentsWithAssets}
          allLocations={locations}
          crossAuditPermissions={crossAuditPermissions}
          auditPhases={auditPhases}
          maxAssetsPerDay={maxAssetsPerDay}
          buildings={buildings}
          assignmentMode={assignmentMode}
        />
      )}
      {activeView === 'team' && (
        <UserManagement
          users={visibleUsers}
          departments={visibleDepartments}
          onAddMember={handleAddMember}
          onBulkAddMembers={handleBulkAddMembers}
          onUpdateMember={handleUpdateMember}
          onDeleteMember={handleDeleteMember}
          onUpdateRoles={handleUpdateUserRoles}
          onUpdateStatus={handleUpdateUserStatus}
          onResetPassword={handleResetUserPassword}
          currentUserRoles={currentUser.roles}
          customConfirm={customConfirm}
          customAlert={customAlert}
          phases={auditPhases}
          selectedDeptFilter={selectedDept}
          onDeptFilterChange={setSelectedDept}
          currentUserId={currentUser.id}
        />
      )}
      {activeView === 'departments' && (
        <DepartmentManagement
          departments={visibleDepartments}
          locations={visibleLocations}
          departmentMappings={appData.departmentMappings}
          users={users}
          onAdd={handleAddDept}
          onUpdate={handleUpdateDept}
          onBulkUpdate={handleBulkUpdateDepts}
          onDelete={handleDeleteDept}
          isAdmin={isAdminUser || false}
          phases={auditPhases}
          auditGroups={auditGroups}
          onAddGroup={handleAddAuditGroup}
          onUpdateGroup={handleUpdateAuditGroup}
          onDeleteGroup={handleDeleteAuditGroup}
          onAddAuditor={(deptId) => { setSelectedDept(deptId); setActiveView('team'); }}
          currentUserRoles={currentUser.roles}
          openAuditThreshold={openAuditThreshold}
          buildings={buildings}
        />
      )}
      {activeView === 'locations' && (
        <LocationManagement
          locations={visibleLocations}
          departments={visibleDepartments}
          users={users}
          userRoles={currentUser.roles}
          userDeptId={currentUser.departmentId}
          onAdd={handleAddLoc}
          onBulkAdd={handleBulkAddLocs}
          onUpdate={handleUpdateLoc}
          onDelete={handleDeleteLoc}
          phases={auditPhases}
          buildings={buildings}
          schedules={appData.schedules}
        />
      )}
      {activeView === 'admin-dashboard' && (
        <AdminDashboard
          users={users}
          locations={locations}
          schedules={appData.schedules}
          activities={activities}
          departments={departmentsWithAssets}
          buildings={buildings}
          phases={auditPhases}
          onApproveArchive={handleApproveArchive}
          onRejectArchive={handleRejectArchive}
          onApproveCert={appActions.handleApproveCert}
        />
      )}
      {activeView === 'buildings' && (
        <BuildingManagement
          buildings={buildings}
          locations={locations}
          onAdd={handleAddBuilding}
          onBulkAdd={handleBulkAddBuildings}
          onUpdate={handleUpdateBuilding}
          onDelete={handleDeleteBuilding}
        />
      )}
      {activeView === 'settings' && (
        <SystemSettings
          departments={departmentsWithAssets}
          users={users}
          permissions={crossAuditPermissions}
          phases={auditPhases}
          kpiTiers={kpiTiers}
          kpiTierTargets={kpiTierTargets}
          institutionKPIs={institutionKPIs}
          userRoles={currentUser.roles}
          onAddPermission={handleAddPermission}
          onRemovePermission={handleRemovePermission}
          onTogglePermission={handleTogglePermission}
          onUpdateDepartment={handleUpdateDept}
          onBulkUpdateDepartments={handleBulkUpdateDepts}
          onBulkAddPermissions={handleBulkAddPermissions}
          onBulkRemovePermissions={handleBulkRemovePermissions}
          pairingLocked={appData.pairingLocked}
          pairingLockInfo={appData.pairingLockInfo}
          onLockPairing={handleLockPairing}
          onUnlockPairing={handleUnlockPairing}
          showToast={showToast}
          onAddPhase={handleAddPhase}
          onUpdatePhase={handleUpdatePhase}
          onDeletePhase={handleDeletePhase}
          onAddKPITier={handleAddKPITier}
          onUpdateKPITier={handleUpdateKPITier}
          onDeleteKPITier={handleDeleteKPITier}
          onUpdateKPITierTarget={handleUpdateKPITierTarget}
          onUpdateInstitutionKPI={handleUpdateInstitutionKPI}
          onAutoCalculateTierTargets={handleAutoCalculateTierTargets}
          onResetLocations={handleResetLocations}
          onResetOperationalData={handleResetOperationalData}
          onResetDepartments={handleResetDepartments}
          onResetUsers={handleResetUsers}
          onResetPhases={handleResetPhases}
          onResetKPI={handleResetKPI}
          isSystemLocked={appData.pairingLocked}
          onBulkAddLocs={handleBulkAddLocs}
          onBulkAddDepts={handleBulkAddDepts}
          onBulkActivateStaff={handleBulkActivateStaff}
          standaloneThresholdAssets={appData.standaloneThresholdAssets}
          onUpdateMaxAssetsPerDay={async (val) => { appData.setMaxAssetsPerDay(val); await gateway.updateSystemSetting('audit_constraints', { maxAssetsPerDay: val, maxLocationsPerDay: appData.maxLocationsPerDay, minAuditorsPerLocation: appData.minAuditorsPerLocation, dailyInspectionCapacity: appData.dailyInspectionCapacity, standaloneThresholdAssets: appData.standaloneThresholdAssets }); }}
          onUpdateMaxLocationsPerDay={async (val) => { appData.setMaxLocationsPerDay(val); await gateway.updateSystemSetting('audit_constraints', { maxAssetsPerDay: appData.maxAssetsPerDay, maxLocationsPerDay: val, minAuditorsPerLocation: appData.minAuditorsPerLocation, dailyInspectionCapacity: appData.dailyInspectionCapacity, standaloneThresholdAssets: appData.standaloneThresholdAssets }); }}
          onUpdateMinAuditorsPerLocation={async (val) => { appData.setMinAuditorsPerLocation(val); await gateway.updateSystemSetting('audit_constraints', { maxAssetsPerDay: appData.maxAssetsPerDay, maxLocationsPerDay: appData.maxLocationsPerDay, minAuditorsPerLocation: val, dailyInspectionCapacity: appData.dailyInspectionCapacity, standaloneThresholdAssets: appData.standaloneThresholdAssets }); }}
          onUpdateDailyInspectionCapacity={async (val) => { appData.setDailyInspectionCapacity(val); await gateway.updateSystemSetting('audit_constraints', { maxAssetsPerDay, maxLocationsPerDay: appData.maxLocationsPerDay, minAuditorsPerLocation: appData.minAuditorsPerLocation, dailyInspectionCapacity: val, standaloneThresholdAssets: appData.standaloneThresholdAssets, groupingMargin: appData.groupingMargin }); }}
          onUpdateStandaloneThresholdAssets={async (val) => { appData.setStandaloneThresholdAssets(val); await gateway.updateSystemSetting('audit_constraints', { maxAssetsPerDay, maxLocationsPerDay: appData.maxLocationsPerDay, minAuditorsPerLocation: appData.minAuditorsPerLocation, dailyInspectionCapacity: appData.dailyInspectionCapacity, standaloneThresholdAssets: val, groupingMargin: appData.groupingMargin }); }}
          groupingMargin={appData.groupingMargin}
          onUpdateGroupingMargin={async (val) => { appData.setGroupingMargin(val); await gateway.updateSystemSetting('audit_constraints', { maxAssetsPerDay: appData.maxAssetsPerDay, maxLocationsPerDay: appData.maxLocationsPerDay, minAuditorsPerLocation: appData.minAuditorsPerLocation, dailyInspectionCapacity: appData.dailyInspectionCapacity, standaloneThresholdAssets: appData.standaloneThresholdAssets, groupingMargin: val, groupingAuditorMargin: appData.groupingAuditorMargin }); }}
          groupingAuditorMargin={appData.groupingAuditorMargin}
          onUpdateGroupingAuditorMargin={async (val) => { appData.setGroupingAuditorMargin(val); await gateway.updateSystemSetting('audit_constraints', { maxAssetsPerDay: appData.maxAssetsPerDay, maxLocationsPerDay: appData.maxLocationsPerDay, minAuditorsPerLocation: appData.minAuditorsPerLocation, dailyInspectionCapacity: appData.dailyInspectionCapacity, standaloneThresholdAssets: appData.standaloneThresholdAssets, groupingMargin: appData.groupingMargin, groupingAuditorMargin: val }); }}
          onRebalanceSchedule={handleRebalanceSchedule}
          schedules={appData.schedules}
          departmentMappings={appData.departmentMappings}
          onAddDepartmentMapping={handleAddDepartmentMapping}
          onDeleteDepartmentMapping={handleDeleteDepartmentMapping}
          onSyncLocationMappings={handleSyncLocationMappings}
          onUpsertLocations={handleUpsertLocations}
          onSetDeptTotalsFromMapping={handleSetDeptTotalsFromMapping}
          onUpdateUninspectedAssets={handleUpdateUninspectedAssetCounts}
          locations={locations}
          buildings={buildings}
          locationMappings={appData.locationMappings}
          onAddLocationMapping={handleAddLocationMapping}
          onDeleteLocationMapping={handleDeleteLocationMapping}
          onSyncLocationNotes={handleSyncLocationNotes}
          onAddAuditGroup={handleAddAuditGroup}
          onUpdateAuditGroup={handleUpdateAuditGroup}
          onDeleteAuditGroup={handleDeleteAuditGroup}
          onAutoConsolidate={handleAutoConsolidate}
          onRunStrategicPairing={handleRunStrategicPairing}
          onResetPairingData={handleResetPairingData}
          auditGroups={auditGroups}
          feasibilityReport={appData.feasibilityReport}
          onSaveFeasibilityReport={handleSaveFeasibilityReport}
          currentUser={currentUser}
          isGroupSimulatorActive={appData.isGroupSimulatorActive}
          simulatedGroups={appData.simulatedGroups}
          onCommitGroups={handleCommitGroups}
          onCancelGroupSimulation={handleCancelGroupSimulation}
          onUpdateSimulatedGroups={appData.setSimulatedGroups}
          onResetOnlyPermissions={handleResetOnlyPermissions}
          assignmentMode={assignmentMode}
          onUpdateAssignmentMode={handleUpdateAssignmentMode}
          openAuditThreshold={openAuditThreshold}
          onUpdateOpenAuditThreshold={handleUpdateOpenAuditThreshold}
          onMergeLocations={handleMergeLocations}
        />
      )}
      {activeView === 'profile' && <UserProfile user={currentUser} departments={departmentsWithAssets} onUpdate={handleUpdateMember} />}
      {activeView === 'knowledge-base' && <KnowledgeBase phases={auditPhases} />}

      <GlobalModals
        confirmState={confirmState}
        setConfirmState={setConfirmState}
        toasts={toasts}
        closeToast={closeToast}
        certRenewalModalUser={certRenewalModalUser}
        setCertRenewalModalUser={setCertRenewalModalUser}
        handleIssueCertForRenewal={handleIssueCertForRenewal}
        showForcePasswordModal={showForcePasswordModal}
        setShowForcePasswordModal={setShowForcePasswordModal}
        currentUser={currentUser}
        setCurrentUser={appData.setCurrentUser}
        showProfileCompleteModal={showProfileCompleteModal}
        setShowProfileCompleteModal={setShowProfileCompleteModal}
        setActiveView={setActiveView}
        setViewState={appData.setViewState}
        showToast={showToast}
        showError={showError}
      />
    </MainAppLayout>
  );
};

export default App;
