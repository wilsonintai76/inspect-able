/// <reference types="@cloudflare/workers-types" />
import { AuditSchedule, User, Department, Location, CrossAuditPermission, AuditPhase, KPITier, KPITierTarget, InstitutionKPITarget, DepartmentMapping, LocationMapping, SystemActivity, AuditGroup, Building, SystemSetting } from '@shared/types';
import { api, getAuthHeaders } from './honoClient';

class DataGateway {
  constructor() {}

  private generateId(): string {
    return crypto.randomUUID ? crypto.randomUUID() : `id-${Date.now()}-${Math.random()}`;
  }

  /**
   * Typed RPC helper — calls a Hono RPC endpoint and returns the typed response.
   * Centralises `!res.ok` error extraction so each method stays lean.
   * The `fn` callback receives fresh auth headers already injected.
   */
  private async rpc<T>(fn: (headers: Record<string, string>) => Promise<Response>): Promise<T> {
    const headers = await getAuthHeaders();
    const res = await fn(headers);
    if (!res.ok) {
      const body = await res.json().catch(() => ({})) as { error?: string, message?: string, code?: string };
      console.error("[DataGateway] API Request Failed:", res.status, res.url);
      console.error("[DataGateway] API Payload:", body);
      throw new Error(body.error ?? body.message ?? `HTTP ${res.status}`);
    }
    return res.json() as Promise<T>;
  }

  /**
   * Like rpc<T> but returns `null` instead of throwing when the endpoint
   * returns a non-2xx status. Useful for "best-effort" fetches.
   */
  private async rpcOrNull<T>(fn: (headers: Record<string, string>) => Promise<Response>): Promise<T | null> {
    try { return await this.rpc<T>(fn); } catch { return null; }
  }

  async getAdminSettings(): Promise<any> {
    const data = await this.rpcOrNull<{ value: string }>(
      h => (api as any).media.settings[':key'].$get({ param: { key: 'admin_settings' } }, { headers: h }),
    );
    return JSON.parse(data?.value || '{}');
  }

  async saveAdminSettings(settings: any): Promise<void> {
    await this.rpc<unknown>(
      h => (api as any).media.settings[':key'].$post(
        { param: { key: 'admin_settings' }, json: { value: JSON.stringify(settings) } },
        { headers: h },
      ),
    );
  }

  async uploadImage(file: File): Promise<string> {
    const { url } = await this.rpc<{ url: string }>(
      h => (api as any).media.upload.$post({ form: { file } }, { headers: h }),
    );
    return url;
  }

  // --- AUDITS ---
  async getAudits(): Promise<AuditSchedule[]> {
    return this.rpc<AuditSchedule[]>(h => (api as any).db.audits.$get({}, { headers: h }));
  }

  async addAudit(audit: Omit<AuditSchedule, 'id'>): Promise<AuditSchedule> {
    return this.rpc<AuditSchedule>(h => (api as any).db.audits.$post({ json: audit as any }, { headers: h }));
  }

  async bulkAddAudits(audits: Omit<AuditSchedule, 'id'>[]): Promise<AuditSchedule[]> {
    return this.rpc<AuditSchedule[]>(h => (api as any).db.audits.bulk.$post({ json: audits as any }, { headers: h }));
  }

  async updateAudit(id: string, updates: Partial<AuditSchedule>): Promise<void> {
    await this.rpc<unknown>(h => (api as any).db.audits[':id'].$patch({ param: { id }, json: updates as any }, { headers: h }));
  }

  async deleteAudit(id: string): Promise<void> {
    await this.rpc<unknown>(h => (api as any).db.audits[':id'].$delete({ param: { id } }, { headers: h }));
  }

  async sendApprovalEmail(id: string): Promise<void> {
    await this.rpc<unknown>(h => (api as any).db.audits[':id']['send-approval-email'].$post({ param: { id } }, { headers: h }));
  }

  // --- USERS ---
  async getUsers(): Promise<User[]> {
    return this.rpc<User[]>(h => (api as any).db.users.$get({}, { headers: h }));
  }

  async addUser(user: Omit<User, 'id'>): Promise<User> {
    return this.rpc<User>(h => (api as any).db.users.$post({ json: user as any }, { headers: h }));
  }

  async updateUser(id: string, updates: Partial<User>): Promise<void> {
    await this.rpc<unknown>(h => (api as any).db.users[':id'].$patch({ param: { id }, json: updates as any }, { headers: h }));
  }

  async verifyUser(id: string): Promise<User> {
    return this.rpc<User>(h => (api as any).db.users[':id'].verify.$post({ param: { id } }, { headers: h }));
  }

  async deleteUser(id: string): Promise<void> {
    await this.rpc<unknown>(h => (api as any).db.users[':id'].$delete({ param: { id } }, { headers: h }));
  }

  // --- DEPARTMENTS ---
  async getDepartments(): Promise<Department[]> {
    return this.rpc<Department[]>(h => (api as any).db.departments.$get({}, { headers: h }));
  }

  async addDepartment(dept: Omit<Department, 'id'>): Promise<Department> {
    return this.rpc<Department>(h => (api as any).db.departments.$post({ json: dept as any }, { headers: h }));
  }

  async updateDepartment(id: string, updates: Partial<Department>): Promise<void> {
    await this.rpc<unknown>(h => (api as any).db.departments[':id'].$patch({ param: { id }, json: updates as any }, { headers: h }));
  }

  async deleteDepartment(id: string): Promise<void> {
    await this.rpc<unknown>(h => (api as any).db.departments[':id'].$delete({ param: { id } }, { headers: h }));
  }

  async analyzeImage(imageUrl?: string, text?: string): Promise<any> {
    return this.rpc<any>(h => (api as any).ai.analyze.$post({ json: { imageUrl, text } }, { headers: h }));
  }

  // --- LOCATIONS ---
  async getLocations(): Promise<Location[]> {
    return this.rpc<Location[]>(h => (api as any).db.locations.$get({}, { headers: h }));
  }

  async addLocation(loc: Omit<Location, 'id'>): Promise<Location> {
    return this.rpc<Location>(h => (api as any).db.locations.$post({ json: loc as any }, { headers: h }));
  }

  async bulkAddLocations(locations: Omit<Location, 'id'>[]): Promise<Location[]> {
    return this.rpc<Location[]>(h => (api as any).db.locations.bulk.$post({ json: locations as any }, { headers: h }));
  }

  async updateLocation(id: string, updates: Partial<Location>): Promise<void> {
    await this.rpc<unknown>(h => (api as any).db.locations[':id'].$patch({ param: { id }, json: updates as any }, { headers: h }));
  }

  async deleteLocation(id: string): Promise<void> {
    await this.rpc<unknown>(h => (api as any).db.locations[':id'].$delete({ param: { id } }, { headers: h }));
  }

  async forceDeleteLocation(id: string) {
    await this.rpc<unknown>(h => (api as any).db.locations[':id'].force.$delete({ param: { id } }, { headers: h }));
  }

  async purgeLocation(id: string): Promise<void> {
    await this.rpc<unknown>(h => (api as any).db.locations[':id'].purge.$delete({ param: { id } }, { headers: h }));
  }

  async forceDeleteDepartment(id: string) {
    await this.rpc<unknown>(h => (api as any).db.departments[':id'].force.$delete({ param: { id } }, { headers: h }));
  }

  async purgeDepartment(id: string): Promise<void> {
    await this.rpc<unknown>(h => (api as any).db.departments[':id'].purge.$delete({ param: { id } }, { headers: h }));
  }

  async clearAllLocations() {
    await this.rpc<unknown>(h => (api as any).db.locations.clear.$post({}, { headers: h }));
  }

  async requestPasswordReset(email: string) {
    return await this.rpc<{ success: boolean; message: string }>(h => (api as any).auth['request-reset'].$post({ json: { email } }, { headers: h }));
  }

  async resetUserPassword(userId: string) {
    await this.rpc<unknown>(h => (api as any).db.users[':id']['reset-password'].$post({ param: { id: userId } }, { headers: h }));
  }

  async requestCertificationRenewal(userId: string) {
    await this.rpc<unknown>(h => (api as any).db.users[':id'].renew.$post({ param: { id: userId } }, { headers: h }));
  }

  async approveCertification(userId: string) {
    await this.rpc<unknown>(h => (api as any).db.users[':id'].approve.$post({ param: { id: userId } }, { headers: h }));
  }

  async clearAllDepartments(currentUserId?: string) {
    await this.rpc<unknown>(h => (api as any).db.departments.clear.$post({ json: { keep_user_id: currentUserId } }, { headers: h }));
  }

  async clearAllUsers(currentUserId?: string) {
    await this.rpc<unknown>(h => (api as any).db.users.clear.$post({ json: { keep_user_id: currentUserId } }, { headers: h }));
  }

  async clearAuditPhases() {
    await this.rpc<unknown>(h => (api as any).db['audit-phases'].clear.$post({}, { headers: h }));
  }

  async clearKPI() {
    await this.rpc<unknown>(h => (api as any).db.kpi.clear.$post({}, { headers: h }));
  }

  async fullSystemReset(adminUserId?: string) {
    await this.rpc<unknown>(h => (api as any).db.system['full-reset'].$post({ json: { keep_user_id: adminUserId } }, { headers: h }));
  }

  async initializeDefaults() {
    await this.rpc<unknown>(h => (api as any).db.system['initialize-defaults'].$post({ json: {} }, { headers: h }));
  }

  // --- DEPARTMENT MAPPINGS ---
  async getDepartmentMappings(): Promise<DepartmentMapping[]> {
    return this.rpcOrNull<DepartmentMapping[]>(h => (api as any).db['department-mappings'].$get({}, { headers: h })) as Promise<DepartmentMapping[]>;
  }

  async addDepartmentMapping(mapping: Omit<DepartmentMapping, 'id'>): Promise<DepartmentMapping> {
    return this.rpc<DepartmentMapping>(h => (api as any).db['department-mappings'].$post({ json: mapping as any }, { headers: h }));
  }

  async clearDepartmentMappings(): Promise<void> {
    await this.rpc<unknown>(h => (api as any).db['department-mappings'].clear.$post({}, { headers: h }));
  }

  async deleteDepartmentMapping(id: string): Promise<void> {
    await this.rpc<unknown>(h => (api as any).db['department-mappings'][':id'].$delete({ param: { id } }, { headers: h }));
  }

  // --- LOCATION MAPPINGS ---
  async getLocationMappings(): Promise<LocationMapping[]> {
    return this.rpcOrNull<LocationMapping[]>(h => (api as any).db['location-mappings'].$get({}, { headers: h })) as Promise<LocationMapping[]>;
  }

  async addLocationMapping(mapping: Omit<LocationMapping, 'id'>): Promise<LocationMapping> {
    return this.rpc<LocationMapping>(h => (api as any).db['location-mappings'].$post({ json: mapping as any }, { headers: h }));
  }

  async deleteLocationMapping(id: string): Promise<void> {
    await this.rpc<unknown>(h => (api as any).db['location-mappings'][':id'].$delete({ param: { id } }, { headers: h }));
  }

  // --- ACTIVITIES ---
  async getSystemActivity(): Promise<SystemActivity[]> {
    return (await this.rpcOrNull<SystemActivity[]>(h => (api as any).db.activity.$get({}, { headers: h }))) ?? [];
  }

  async addSystemActivity(activity: Omit<SystemActivity, 'id'>): Promise<void> {
    await this.rpc<unknown>(h => (api as any).db.activity.$post({ json: activity as any }, { headers: h }));
  }

  // --- PERMISSIONS (STUBBED FOR OPEN AUDIT) ---
  async getPermissions(): Promise<CrossAuditPermission[]> {
    return [];
  }

  async addPermission(perm: Omit<CrossAuditPermission, 'id'>) {
    return;
  }

  async bulkAddPermissions(perms: Omit<CrossAuditPermission, 'id'>[]) {
    return;
  }

  async deletePermission(id: string) {
    return;
  }

  async bulkDeletePermissions(ids: string[]) {
    return;
  }

  async clearAllPermissions(): Promise<{ success: boolean }> {
    return { success: true };
  }

  async resetOnlyPermissions(): Promise<{ success: boolean }> {
    return { success: true };
  }

  async updatePermission(id: string, updates: Partial<CrossAuditPermission>) {
    return;
  }

  // --- AUDIT PHASES ---
  async getAuditPhases(): Promise<AuditPhase[]> {
    return (await this.rpcOrNull<AuditPhase[]>(h => (api as any).db['audit-phases'].$get({}, { headers: h }))) ?? [];
  }

  async addAuditPhase(phase: Omit<AuditPhase, 'id'>): Promise<AuditPhase> {
    return this.rpc<AuditPhase>(h => (api as any).db['audit-phases'].$post({ json: phase as any }, { headers: h }));
  }

  async updateAuditPhase(id: string, updates: Partial<AuditPhase>) {
    await this.rpc<unknown>(h => (api as any).db['audit-phases'][':id'].$patch({ param: { id }, json: updates as any }, { headers: h }));
  }

  async deleteAuditPhase(id: string) {
    await this.rpc<unknown>(h => (api as any).db['audit-phases'][':id'].$delete({ param: { id } }, { headers: h }));
  }

  // --- KPI TIERS ---
  async getKPITiers(): Promise<KPITier[]> {
    return (await this.rpcOrNull<KPITier[]>(h => (api as any).db['kpi-tiers'].$get({}, { headers: h }))) ?? [];
  }

  async addKPITier(tier: Omit<KPITier, 'id'>) {
    await this.rpc<unknown>(h => (api as any).db['kpi-tiers'].$post({ json: tier as any }, { headers: h }));
  }

  async updateKPITier(id: string, updates: Partial<KPITier>) {
    await this.rpc<unknown>(h => (api as any).db['kpi-tiers'][':id'].$patch({ param: { id }, json: updates as any }, { headers: h }));
  }

  async deleteKPITier(id: string) {
    await this.rpc<unknown>(h => (api as any).db['kpi-tiers'][':id'].$delete({ param: { id } }, { headers: h }));
  }

  // --- KPI TIER TARGETS ---
  async getKPITierTargets(): Promise<KPITierTarget[]> {
    return (await this.rpcOrNull<KPITierTarget[]>(h => (api as any).db['kpi-tier-targets'].$get({}, { headers: h }))) ?? [];
  }

  async setKPITierTarget(tierId: string, phaseId: string, percentage: number): Promise<void> {
    await this.rpc<unknown>(h => (api as any).db['kpi-tier-targets'].$post({ json: { tierId, phaseId, targetPercentage: percentage } }, { headers: h }));
  }

  async updateKPITierTarget(id: string, updates: Partial<KPITierTarget>) {
    await this.rpc<unknown>(h => (api as any).db['kpi-tier-targets'][':id'].$patch({ param: { id }, json: updates as any }, { headers: h }));
  }

  async deleteKPITierTarget(id: string): Promise<void> {
    await this.rpc<unknown>(h => (api as any).db['kpi-tier-targets'][':id'].$delete({ param: { id } }, { headers: h }));
  }

  // --- AUDIT GROUPS ---
  async getAuditGroups(): Promise<AuditGroup[]> {
    return (await this.rpcOrNull<AuditGroup[]>(h => (api as any).db['audit-groups'].$get({}, { headers: h }))) ?? [];
  }

  async addAuditGroup(group: Omit<AuditGroup, 'id'>): Promise<AuditGroup> {
    return this.rpc<AuditGroup>(h => (api as any).db['audit-groups'].$post({ json: group as any }, { headers: h }));
  }

  async updateAuditGroup(id: string, updates: Partial<AuditGroup>): Promise<void> {
    await this.rpc<unknown>(h => (api as any).db['audit-groups'][':id'].$patch({ param: { id }, json: updates as any }, { headers: h }));
  }

  async deleteAuditGroup(id: string): Promise<void> {
    await this.rpc<unknown>(h => (api as any).db['audit-groups'][':id'].$delete({ param: { id } }, { headers: h }));
  }

  async getInstitutionKPIs(): Promise<InstitutionKPITarget[]> {
    return (await this.rpcOrNull<InstitutionKPITarget[]>(h => (api as any).db['institution-kpi-targets'].$get({}, { headers: h }))) ?? [];
  }

  async updateInstitutionKPI(phaseId: string, percentage: number): Promise<void> {
    await this.rpc<unknown>(h => (api as any).db['institution-kpi-targets'].$post({ json: { phaseId, targetPercentage: percentage } }, { headers: h }));
  }

  async updateInstitutionKPITarget(id: string, updates: Partial<InstitutionKPITarget>) {
    await this.rpc<unknown>(h => (api as any).db['institution-kpi-targets'][':id'].$patch({ param: { id }, json: updates as any }, { headers: h }));
  }

  async autoCalculateTierTargets(tierId?: string): Promise<{ tierTargets: any[], capacityWarnings: string[] }> {
    return this.rpc(h => (api as any).compute['auto-tier-targets'].$post({ json: { tierId } }, { headers: h }));
  }

  async autoConsolidateAuditGroups(threshold: number, excludedDeptIds: string[], minAuditors: number, groupingMargin: number, useAI: boolean, pairingMode: string = 'asymmetric', aiConsolidation: boolean = false, minAuditorsPerGroup: number = 10, dryRun: boolean = false, auditorMargin: number = 3) {
    return this.rpc(h => (api as any).compute.consolidate.$post({ json: { threshold, excludedDeptIds, minAuditors, groupingMargin, useAI, pairingMode, aiConsolidation, minAuditorsPerGroup, dryRun, auditorMargin } }, { headers: h }));
  }

  async commitConsolidationDraft(groups: any[]) {
    return this.rpc(h => (api as any).compute.consolidate['commit-draft'].$post({ json: { groups } }, { headers: h }));
  }

  async generateStrategicPairings(payload: { mode: string; minAuditors: number; strictAuditorRule: boolean; autoPairingMutual: boolean; respectManualPairings: boolean; simulate: boolean; useAI: boolean }) {
    return this.rpc(h => (api as any).compute['cross-audit'].generate.$post({ json: payload }, { headers: h }));
  }

  // --- BUILDINGS ---
  async getBuildings(): Promise<Building[]> {
    return (await this.rpcOrNull<Building[]>(h => (api as any).db.buildings.$get({}, { headers: h }))) ?? [];
  }

  async addBuilding(building: Omit<Building, 'id'>): Promise<Building> {
    return this.rpc<Building>(h => (api as any).db.buildings.$post({ json: building as any }, { headers: h }));
  }

  async updateBuilding(id: string, updates: Partial<Building>): Promise<void> {
    await this.rpc<unknown>(h => (api as any).db.buildings[':id'].$patch({ param: { id }, json: updates as any }, { headers: h }));
  }

  async deleteBuilding(id: string): Promise<void> {
    await this.rpc<unknown>(h => (api as any).db.buildings[':id'].$delete({ param: { id } }, { headers: h }));
  }

  async bulkAddBuildings(buildings: Omit<Building, 'id'>[]): Promise<{ count: number }> {
    return this.rpc<{ count: number }>(h => (api as any).db.buildings.bulk.$post({ json: buildings as any }, { headers: h }));
  }

  async getSystemSettings(): Promise<SystemSetting[]> {
    return (await this.rpcOrNull<SystemSetting[]>(h => (api as any).db['system-settings'].$get({}, { headers: h }))) ?? [];
  }

  async updateSystemSetting(id: string, value: any): Promise<void> {
    await this.rpc<unknown>(h => (api as any).db['system-settings'][':id'].$post({ param: { id }, json: { value } }, { headers: h }));
  }

  async setDeptTotalsFromMapping() {
    await this.rpc<unknown>(h => (api as any).db.departments.refresh.$post({}, { headers: h }));
  }

  async upsertLocations(locations: Omit<Location, 'id'>[]) {
    await this.rpc<unknown>(h => (api as any).db.locations.upsert.$post({ json: locations as any }, { headers: h }));
  }

  async syncLocationMappings() {
    await this.rpc<unknown>(h => (api as any).db.locations.sync.$post({}, { headers: h }));
  }
  async syncLocationNotes() {
    await this.rpc<unknown>(h => (api as any).db.locations['sync-notes'].$post({}, { headers: h }));
  }

  async mergeLocations(sourceIds: string[], targetId: string) {
    await this.rpc<unknown>(h => (api as any).db.locations.merge.$post({ json: { sourceIds, targetId } }, { headers: h }));
  }
}

export const gateway = new DataGateway();
