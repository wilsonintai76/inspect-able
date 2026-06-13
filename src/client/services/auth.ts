import { clearAuthCache, serverLogout, api as honoApi, setAuthToken, getAuthToken } from './honoClient';
const api = honoApi as any;
import { AuditSchedule, User, Department, Location, CrossAuditPermission, AuditPhase, KPITier, KPITierTarget, InstitutionKPITarget, DepartmentMapping, SystemActivity, AuditGroup, Building, SystemSetting } from '@shared/types';

export const authService = {
  login: async (email: string, password: string): Promise<User> => {
    try {
      const res = await api.auth.login.$post({ json: { email, password } });
      const data = await res.json() as any;
      
      if (!data.success) throw new Error(data.message || 'Login failed');
      
      setAuthToken(data.token);
      return mapProfileToUser(data.user);
    } catch (error: any) {
      console.error("[Auth] Login failed:", error);
      throw error;
    }
  },

  register: async (email: string, password: string, name: string): Promise<User> => {
    try {
      const res = await api.auth.register.$post({ json: { email, password, name } });
      const data = await res.json() as any;
      
      if (!data.success) throw new Error(data.message || 'Registration failed');
      
      setAuthToken(data.token);
      return mapProfileToUser(data.user);
    } catch (error: any) {
      console.error("[Auth] Registration failed:", error);
      throw error;
    }
  },

  /**
   * Exchanges a one-time Google OAuth exchange token (from the ?google_callback=
   * query param) for a standard JWT session.  The exchange token is deleted
   * server-side on first use and expires after 60 seconds.
   */
  exchangeGoogleToken: async (exchangeToken: string): Promise<User> => {
    const res = await fetch('/api/auth/google/exchange', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ exchangeToken }),
    });
    const data = await res.json() as any;
    if (!data.success) throw new Error(data.message || 'Google sign-in failed');
    setAuthToken(data.token);
    return mapProfileToUser(data.user);
  },

  logout: async () => {
    try {
      // 1. Evict server session
      await serverLogout();

      // 2. Clear local storage
      localStorage.clear();
      sessionStorage.clear();

      // 3. Clear token
      clearAuthCache();
    } catch (error) {
      console.warn("[Auth] Logout warning:", error);
    }
  },

  getCurrentUser: async (): Promise<User | null> => {
    try {
      // Always call the server — session may be established via SSO cookie
      // even when no JWT is stored in localStorage.
      console.log("[Auth] Checking current user via native API...");
      const res = await api.auth.me.$get();
      const data = await res.json() as any;

      if (!data.success || !data.user) {
        console.warn("[Auth] Session invalid or profile not found");
        clearAuthCache();
        return null;
      }

      return mapProfileToUser(data.user);
    } catch (error: any) {
      console.error("[Auth] getCurrentUser failed:", error.message || error);
      return null;
    }
  }
};

// Helper to map DB snake_case to Frontend camelCase
function mapProfileToUser(profile: any): User {
  const result = { ...profile };
  
  // Always ensure roles is a valid array
  if (typeof result.roles === 'string') {
    try {
      result.roles = JSON.parse(result.roles);
    } catch {
      result.roles = ['Guest'];
    }
  }
  result.roles = Array.isArray(result.roles) && result.roles.length > 0 ? result.roles : ['Guest'];

  if (result.contact_number) result.contactNumber = result.contact_number;
  if (result.is_verified !== undefined) result.isVerified = !!result.is_verified;
  if (result.last_active) result.lastActive = result.last_active;
  if (result.certification_issued) result.certificationIssued = result.certification_issued;
  if (result.certification_expiry) result.certificationExpiry = result.certification_expiry;
  if (result.renewal_requested !== undefined) result.renewalRequested = result.renewal_requested;
  if (result.dashboard_config) result.dashboardConfig = result.dashboard_config;
  if (result.department_id) result.departmentId = result.department_id;

  return result as User;
}
