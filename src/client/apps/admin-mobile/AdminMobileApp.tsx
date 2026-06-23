import React, { useEffect, useState } from 'react';
import { useAppData } from '../../hooks/useAppData';
import { useAppActions } from '../../hooks/useAppActions';
import { authService } from '../../services/auth';
import { awaitSessionRegistered } from '../../services/honoClient';
import { ToastContainer } from '../../components/Toast';
import { BRANDING } from '../../constants';

// Screens
import { AdminMobileLogin } from './components/AdminMobileLogin';
import { AdminMobileHeader } from './components/AdminMobileHeader';
import { AdminMobileBottomNav, AdminMobileView } from './components/AdminMobileBottomNav';
import { DashboardScreen } from './screens/DashboardScreen';
import { AdminMobileProfile } from './screens/ProfileScreen';

// Existing main-site views — reused as-is (already have mobile card views)
import { AuditTable } from '../../components/AuditTable';
import { UserManagement } from '../../components/UserManagement';
import { DepartmentManagement } from '../../components/DepartmentManagement';
import { LocationManagement } from '../../components/LocationManagement';

export const AdminMobileApp: React.FC = () => {
  const appData = useAppData();
  const appActions = useAppActions({ ...appData, loadAllData: appData.loadAllData });

  const {
    currentUser, isInitialLoading,
    schedules, users, departments, locations, buildings,
    auditPhases, kpiTiers, kpiTierTargets, institutionKPIs,
    maxAssetsPerDay, openAuditThreshold, assignmentMode,
    toasts, loadAllData, isProcessing,
    departmentMappings, departmentsWithAssets, departmentNames,
    selectedDept, setSelectedDept, selectedStatus, setSelectedStatus,
    selectedPhaseId, setSelectedPhaseId, activities,
  } = appData;

  const {
    handleLogout, handleLoginSuccess,
    handleAssign, handleUnassign, handleUpdateAuditDate, handleUpdateAudit,
    handleToggleStatus, handleToggleLock, handleDeleteAudit,
    handleAddMember, handleBulkAddMembers, handleUpdateMember, handleDeleteMember,
    handleUpdateUserRoles, handleUpdateUserStatus, handleResetUserPassword,
    handleAddDept, handleUpdateDept, handleBulkUpdateDepts, handleArchiveDept, handlePurgeDept,
    handleAddLoc, handleBulkAddLocs, handleUpdateLoc, handleArchiveLoc, handlePurgeLoc,
    handleApproveArchive, handleRejectArchive,
    closeToast, customConfirm, customAlert,
  } = appActions;

  const [activeView, setActiveView] = useState<AdminMobileView>('dashboard');
  const [isRefreshing, setIsRefreshing] = useState(false);

  // ── Session init ────────────────────────────────────────────────────────
  useEffect(() => {
    const init = async () => {
      const params = new URLSearchParams(window.location.search);
      const exchangeToken = params.get('google_callback');
      if (exchangeToken) {
        window.history.replaceState(null, '', window.location.pathname);
        try {
          const user = await authService.exchangeGoogleToken(exchangeToken);
          await handleLoginSuccess(user);
          appData.setIsInitialLoading(false);
          return;
        } catch (e) {
          console.error('[AdminMobile] Google exchange failed:', e);
        }
      }
      await awaitSessionRegistered();
      const user = await authService.getCurrentUser();
      if (user) {
        await handleLoginSuccess(user);
        appData.setIsInitialLoading(false);
      } else {
        appData.setIsInitialLoading(false);
      }
    };
    init();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Public branding ─────────────────────────────────────────────────────
  useEffect(() => {
    fetch('/api/public/branding')
      .then(r => r.ok ? r.json() : null)
      .then((data: any) => {
        if (data?.branding?.logoBrand) BRANDING.logoBrand = data.branding.logoBrand;
      })
      .catch(() => {});
  }, []);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try { await loadAllData(); } finally { setIsRefreshing(false); }
  };

  const isAdminUser = currentUser?.roles?.includes('Admin');
  const visibleUsers = isAdminUser ? users : users.filter(u => u.departmentId === currentUser?.departmentId);
  const visibleDepartments = isAdminUser ? departmentsWithAssets : departmentsWithAssets.filter(d => d.id === currentUser?.departmentId);
  const visibleLocations = isAdminUser ? locations : locations.filter(l => l.departmentId === currentUser?.departmentId);

  // ── Loading splash ───────────────────────────────────────────────────────
  if (isInitialLoading) {
    return (
      <div className="min-h-dvh bg-slate-50 flex flex-col items-center justify-center gap-4">
        <div className="w-16 h-16 bg-blue-600 rounded-3xl flex items-center justify-center shadow-xl shadow-blue-500/30 animate-pulse">
          <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
          </svg>
        </div>
        <div className="text-center">
          <p className="font-black text-slate-900 text-lg">Inspect-able</p>
          <p className="text-slate-400 text-sm font-medium mt-1">Loading admin panel…</p>
        </div>
      </div>
    );
  }

  // ── Not authenticated ────────────────────────────────────────────────────
  if (!currentUser) {
    return <AdminMobileLogin />;
  }

  // ── Render active screen ─────────────────────────────────────────────────
  const renderScreen = () => {
    switch (activeView) {
      case 'dashboard':
        return (
          <DashboardScreen
            schedules={schedules}
            departments={departments}
            locations={locations}
            users={users}
            auditPhases={auditPhases}
            buildings={buildings}
            currentUser={currentUser}
          />
        );

      case 'schedule':
        return (
          <AuditTable
            schedules={schedules}
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
            allDepartments={visibleDepartments}
            allLocations={visibleLocations}
            auditPhases={auditPhases}
            maxAssetsPerDay={maxAssetsPerDay}
            buildings={buildings}
            onDeleteAudit={handleDeleteAudit}
            onUpdateLocation={handleUpdateLoc}
          />
        );

      case 'team':
        return (
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
        );

      case 'departments':
        return (
          <DepartmentManagement
            departments={visibleDepartments}
            locations={visibleLocations}
            departmentMappings={departmentMappings}
            users={users}
            schedules={schedules}
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
        );

      case 'locations':
        return (
          <LocationManagement
            locations={visibleLocations}
            departments={visibleDepartments}
            users={users}
            userRoles={currentUser.roles}
            userDeptId={currentUser.departmentId || undefined}
            currentUser={currentUser}
            onAdd={handleAddLoc}
            onBulkAdd={handleBulkAddLocs}
            onUpdate={handleUpdateLoc}
            onDelete={handleArchiveLoc}
            onPurge={handlePurgeLoc}
            phases={auditPhases}
            buildings={buildings}
            schedules={schedules}
          />
        );

      case 'profile':
        return (
          <AdminMobileProfile
            currentUser={currentUser}
            onLogout={handleLogout}
            onUserUpdate={(updated) => appData.setCurrentUser(updated)}
          />
        );

      default:
        return null;
    }
  };

  return (
    <div className="min-h-dvh bg-slate-50 flex flex-col">
      <AdminMobileHeader
        activeView={activeView}
        currentUser={currentUser}
        onLogout={handleLogout}
        onRefresh={handleRefresh}
        isRefreshing={isRefreshing}
      />

      <main
        className="flex-1 overflow-y-auto px-4 pt-4"
        style={{ paddingBottom: 'calc(5rem + env(safe-area-inset-bottom))' }}
      >
        {renderScreen()}
      </main>

      <AdminMobileBottomNav
        activeView={activeView}
        onViewChange={setActiveView}
        currentUser={currentUser}
      />

      {/* Toasts */}
      <ToastContainer
        toasts={toasts}
        onClose={closeToast}
      />

      {/* Processing overlay */}
      {isProcessing && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/30 backdrop-blur-sm">
          <div className="bg-white rounded-2xl p-6 flex flex-col items-center gap-3 shadow-xl">
            <div className="w-10 h-10 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
            <p className="text-sm font-bold text-slate-700">Processing…</p>
          </div>
        </div>
      )}
    </div>
  );
};
