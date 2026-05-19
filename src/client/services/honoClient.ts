import { hc } from 'hono/client';
import type { AppType } from '../../server';

const getBaseUrl = () => {
  let base = window.location.origin;
  if (import.meta.env.MODE === 'development') {
    base = 'http://localhost:3000';
  }
  return `${base}/api`;
};

const TOKEN_KEY = 'asset_audit_pro_token';

// ─── Token Management ────────────────────────────────────────────────────────
export const setAuthToken = (token: string) => {
  localStorage.setItem(TOKEN_KEY, token);
};

export const clearAuthToken = () => {
  localStorage.removeItem(TOKEN_KEY);
};

export const getAuthToken = () => {
  return localStorage.getItem(TOKEN_KEY);
};

// ─── Single-Session Registration ─────────────────────────────────────────────
async function registerSession(accessToken: string): Promise<void> {
  try {
    const hint = `${navigator.userAgent.slice(0, 60)} @ ${new Date().toISOString()}`;
    await fetch(`${getBaseUrl()}/auth/session`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ deviceHint: hint }),
    });
  } catch {
    // Non-fatal
  }
}

// ─── Auth Headers ────────────────────────────────────────────────────────────
export const getAuthHeaders = async (): Promise<Record<string, string>> => {
  const token = getAuthToken();
  if (token) {
    return { Authorization: `Bearer ${token}` };
  }
  return {};
};

/** Invalidate the cached token immediately (e.g. on sign-out). */
export const clearAuthCache = () => {
  clearAuthToken();
};

/**
 * Calls the server-side DELETE /api/auth/session to evict the KV session entry
 * and clear the role cache BEFORE the token is removed locally.
 */
export const serverLogout = async (): Promise<void> => {
  const token = getAuthToken();
  if (!token) return;
  try {
    await fetch(`${getBaseUrl()}/auth/session`, {
      method: 'DELETE',
      credentials: 'include',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
  } catch {
    // Non-fatal
  }
};

/** Compatibility for initial loading */
export function awaitSessionRegistered(): Promise<void> {
  const token = getAuthToken();
  if (token) return registerSession(token);
  return Promise.resolve();
}
// ─────────────────────────────────────────────────────────────────────────────

export const api = hc<AppType>(getBaseUrl(), {
  headers: () => {
    const token = getAuthToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  },
  // Always include the SSO session cookie so cookie-based auth works across subdomains
  fetch: (req: RequestInfo | URL, init?: RequestInit) =>
    fetch(req, { ...init, credentials: 'include' }),
});
