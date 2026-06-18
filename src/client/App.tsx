import React, { useState, useEffect, useMemo } from 'react';
// RBAC removed: use PBAC exclusively
import { gateway } from './services/dataGateway';
import { authService } from './services/auth';
import {
  AppView,
  UserRole
} from '@shared/types';
import { BRANDING } from './constants';

// Components
import { AuditTable } from './components/AuditTable';
import { UserManagement } from './components/UserManagement';
import { InstitutionalSection } from './components/dashboard/InstitutionalSection';
import { BuildingManagement } from './components/BuildingManagement';
import { SystemSettings } from './components/SystemSettings';
import { DepartmentManagement } from './components/DepartmentManagement';
import { LocationManagement } from './components/LocationManagement';
import { UserProfile } from './components/UserProfile';
import { LandingPage } from './components/LandingPage';
import { KnowledgeBase } from './components/KnowledgeBase';
import { AutoUpdater } from './components/AutoUpdater';
import { MainAppLayout } from './components/MainAppLayout';
import { GlobalModals } from './components/GlobalModals';
import { MobileApp } from './apps/mobile/MobileApp';

// Hooks
import { useAppData } from './hooks/useAppData';
import { useAppActions } from './hooks/useAppActions';
import { hasCapability } from './lib/pbacUtils';

// Icons
import { ShieldCheck, Monitor } from 'lucide-react';

const App: React.FC = () => {


  const [brandingLoaded, setBrandingLoaded] = useState(false);
  const [showMobileWarning, setShowMobileWarning] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      const isMobile = window.innerWidth < 1024;
      const dismissed = sessionStorage.getItem('mobile_device_warning_dismissed');
      setShowMobileWarning(isMobile && !dismissed);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Custom Hooks for State and Actions
  const appData = useAppData();
  const appActions = useAppActions({
    ...appData,
    loadAllData: appData.loadAllData
  });

  // Load public branding on startup
  useEffect(() => {
    const loadPublicBranding = async () => {
      try {
        const res = await fetch('/api/public/branding');
        if (res.ok) {
          const { branding } = (await res.json()) as any;
          if (branding) {
            if (branding.logoBrand) {
              BRANDING.logoBrand = branding.logoBrand;
            } else if (branding.logoHorizontal || branding.logoSquare) {
              BRANDING.logoBrand = branding.logoHorizontal || branding.logoSquare;
            }
            if (branding.logoInstitution) BRANDING.logoInstitution = branding.logoInstitution;
            setBrandingLoaded(true);
          }
        }
      } catch (err) {
        console.warn('Failed to fetch public branding settings:', err);
      }
    };
    loadPublicBranding();
  }, []);

  const {
    currentUser, viewState, setViewState, activeView, setActiveView, isInitialLoading,
    publicStats, connectionErrorMessage, filteredSchedules,
    departmentsWithAssets, auditPhases, kpiTiers, locations,
    activities, maxAssetsPerDay, institutionKPIs,
    buildings, kpiTierTargets,
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
    handleDeleteAudit,
    handleAddMember, handleBulkAddMembers, handleUpdateMember,
    handleDeleteMember, handleUpdateUserRoles, handleUpdateUserStatus,
    handleResetUserPassword, handleAddDept, handleUpdateDept,
    handleBulkUpdateDepts, handleArchiveDept, handleAddLoc,
    handleBulkAddLocs, handleUpdateLoc, handleArchiveLoc,
    handleApproveArchive, handleRejectArchive, handleAddBuilding, handleUpdateBuilding,
    handleBulkAddBuildings, handleDeleteBuilding,
    handleAddPhase, handleUpdatePhase, handleDeletePhase,
    handleAddKPITier, handleUpdateKPITier, handleDeleteKPITier,
    handleUpdateKPITierTarget, handleUpdateInstitutionKPI,
    handleAutoCalculateTierTargets,
    handleUpdateAssignmentMode, handleUpdateOpenAuditThreshold,
    handlePurgeDept, handlePurgeLoc,
    showToast, closeToast, showError, customConfirm, customAlert
  } = appActions;

  // Initial Data Load
  useEffect(() => { appData.initSession(); }, []);

  // Inactivity Auto-Logout (15 minutes)
  useEffect(() => {
    if (!currentUser) return;

    const INACTIVITY_TIMEOUT = 15 * 60 * 1000; // 15 minutes
    let timeoutId: NodeJS.Timeout;

    const resetTimer = () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        handleLogout();
        alert("You have been logged out due to inactivity to secure your session.");
      }, INACTIVITY_TIMEOUT);
    };

    // Events to monitor
    const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart'];
    events.forEach(event => {
      window.addEventListener(event, resetTimer);
    });

    // Start timer on mount
    resetTimer();

    return () => {
      clearTimeout(timeoutId);
      events.forEach(event => {
        window.removeEventListener(event, resetTimer);
      });
    };
  }, [currentUser, handleLogout]);

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
      <>
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
        {showMobileWarning && (
          <div className="fixed bottom-6 left-6 right-6 z-1000 md:left-auto md:right-6 md:w-96 animate-in slide-in-from-bottom duration-500">
            <div className="bg-white/95 backdrop-blur-md border border-amber-100 rounded-3xl p-6 shadow-2xl shadow-slate-900/10 relative overflow-hidden">
              <div className="absolute top-0 left-0 right-0 h-1 bg-linear-to-r from-amber-400 to-orange-500"></div>
              <div className="flex gap-4">
                <div className="w-12 h-12 rounded-2xl bg-amber-50 flex items-center justify-center text-amber-600 shrink-0 shadow-inner">
                  <Monitor className="w-6 h-6" />
                </div>
                <div className="grow">
                  <h4 className="text-sm font-black text-slate-900 mb-1 flex items-center gap-2">
                    Desktop Recommended
                    <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></span>
                  </h4>
                  <p className="text-xs text-slate-500 leading-relaxed mb-4">
                    For the best experience auditing assets, configuring schedules, and managing departments, we highly recommend accessing Inspect-able from a desktop screen or landscape tablet.
                  </p>
                  <div className="flex justify-end gap-3">
                    <button
                      onClick={() => {
                        sessionStorage.setItem('mobile_device_warning_dismissed', 'true');
                        setShowMobileWarning(false);
                      }}
                      className="px-4 py-2 bg-slate-900 text-white text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-slate-800 transition-colors shadow-lg shadow-slate-900/10 active:scale-95"
                    >
                      Continue Anyway
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </>
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

  if (viewState === 'mobile') {
    return <MobileApp />;
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
    if (hasCapability(u, 'system:admin')) return true;
    return !!(u.departmentId && u.contactNumber && u.designation);
  };

  const isAdminUser = hasCapability(currentUser, 'system:admin');
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
      checkProfileComplete={checkProfileComplete}
      notifications={appData.notifications}
      setNotifications={appData.setNotifications}
      connectionErrorMessage={connectionErrorMessage}
      isProcessing={appData.isProcessing}
    >
      <AutoUpdater />
      {activeView === 'dashboard' && (
        <InstitutionalSection
          currentUser={currentUser}
          users={users}
          departments={departmentsWithAssets}
          locations={locations}
          schedules={appData.schedules}
          phases={auditPhases}
          kpiTiers={kpiTiers}
          kpiTierTargets={kpiTierTargets}
          institutionKPIs={institutionKPIs}
          activities={activities}
          buildings={buildings}
          openAuditThreshold={openAuditThreshold}
          onUpdateAudit={handleUpdateAudit}
          onToggleStatus={handleToggleStatus}
          onToggleLock={handleToggleLock}
          onUpdateLocation={handleUpdateLoc}
        />
      )}
      {activeView === 'schedule' && (
        <AuditTable
          schedules={filteredSchedules}
          activities={activities}
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
          auditPhases={auditPhases}
          maxAssetsPerDay={maxAssetsPerDay}
          buildings={buildings}
          onDeleteAudit={handleDeleteAudit}
          onUpdateLocation={handleUpdateLoc}
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
          schedules={appData.schedules}
          onUpdateLocation={handleUpdateLoc}
          onAdd={handleAddDept}
          onUpdate={handleUpdateDept}
          onBulkUpdate={handleBulkUpdateDepts}
          onDelete={handleArchiveDept}
          onPurge={handlePurgeDept}
          phases={auditPhases}
          onAddInspector={(deptId) => { setSelectedDept(deptId); setActiveView('team'); }}
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
          currentUser={currentUser}
          onAdd={handleAddLoc}
          onBulkAdd={handleBulkAddLocs}
          onUpdate={handleUpdateLoc}
          onDelete={handleArchiveLoc}
          onPurge={handlePurgeLoc}
          phases={auditPhases}
          buildings={buildings}
          schedules={appData.schedules}
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
          phases={auditPhases}
          kpiTiers={kpiTiers}
          kpiTierTargets={kpiTierTargets}
          institutionKPIs={institutionKPIs}
          userRoles={currentUser.roles}
          onUpdateDepartment={handleUpdateDept}
          onBulkUpdateDepartments={handleBulkUpdateDepts}
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
          schedules={appData.schedules}

          locations={locations}
          buildings={buildings}

          assignmentMode={assignmentMode}
          onUpdateAssignmentMode={handleUpdateAssignmentMode}
          openAuditThreshold={openAuditThreshold}
          onUpdateOpenAuditThreshold={handleUpdateOpenAuditThreshold}

          onRestoreLocation={handleRejectArchive}
          onPurgeLocation={handlePurgeLoc}
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
      {showMobileWarning && (
        <div className="fixed bottom-6 left-6 right-6 z-1000 md:left-auto md:right-6 md:w-96 animate-in slide-in-from-bottom duration-500">
          <div className="bg-white/95 backdrop-blur-md border border-amber-100 rounded-3xl p-6 shadow-2xl shadow-slate-900/10 relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-1 bg-linear-to-r from-amber-400 to-orange-500"></div>
            <div className="flex gap-4">
              <div className="w-12 h-12 rounded-2xl bg-amber-50 flex items-center justify-center text-amber-600 shrink-0 shadow-inner">
                <Monitor className="w-6 h-6" />
              </div>
              <div className="grow">
                <h4 className="text-sm font-black text-slate-900 mb-1 flex items-center gap-2">
                  Desktop Recommended
                  <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></span>
                </h4>
                <p className="text-xs text-slate-500 leading-relaxed mb-4">
                  For the best experience auditing assets, configuring schedules, and managing departments, we highly recommend accessing Inspect-able from a desktop screen or landscape tablet.
                </p>
                <div className="flex justify-end gap-3">
                  <button
                    onClick={() => {
                      sessionStorage.setItem('mobile_device_warning_dismissed', 'true');
                      setShowMobileWarning(false);
                    }}
                    className="px-4 py-2 bg-slate-900 text-white text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-slate-800 transition-colors shadow-lg shadow-slate-900/10 active:scale-95"
                  >
                    Continue Anyway
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </MainAppLayout>
  );
};

export default App;
