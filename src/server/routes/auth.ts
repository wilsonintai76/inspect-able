import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { setCookie, deleteCookie } from 'hono/cookie';
import { Bindings, Variables } from '../types';
import { verifyNativeJwt } from '../middleware/auth';
import { deriveCapabilities } from '../utils/policyEngine';
import { hashPassword, generateToken } from '../services/authService';
import { DEFAULT_USER_PASSWORD } from './db.shared';

// ─── Constants ────────────────────────────────────────────────────────────────
const SESSION_TTL  = 86_400; // 24 hours
const FORCE_LOGOUT = '__force_logout__';
// ─────────────────────────────────────────────────────────────────────────────

// ─── Session Cookie Helpers ───────────────────────────────────────────────────
/**
 * Set the shared SSO session cookie (Domain=.inspect-able.com).
 * HttpOnly + Secure prevents JS access and ensures HTTPS-only transmission.
 */
function setSessionCookie(c: any, sessionId: string): void {
  setCookie(c, 'session', sessionId, {
    domain: '.inspect-able.com',
    path: '/',
    // No maxAge → browser-session cookie, auto-clears when browser closes
    secure: true,
    httpOnly: true,
    sameSite: 'Lax',
  });
}

/** Clear the SSO session cookie across all subdomains. */
function clearSessionCookie(c: any): void {
  deleteCookie(c, 'session', {
    domain: '.inspect-able.com',
    path: '/',
    secure: true,
    httpOnly: true,
    sameSite: 'Lax',
  });
}

/**
 * Validate a returnTo URL is within the trusted inspect-able.com domain.
 * Prevents open-redirect attacks.
 */
function validateReturnTo(returnTo: string | null | undefined, fallback: string): string {
  if (!returnTo) return fallback;
  try {
    const url = new URL(returnTo);
    if (
      url.hostname === 'inspect-able.com' ||
      url.hostname.endsWith('.inspect-able.com') ||
      url.hostname === 'localhost'
    ) {
      return returnTo;
    }
  } catch { /* malformed URL */ }
  return fallback;
}

/**
 * Store the reverse session lookup so the cookie middleware can find userId
 * from just a sessionId, without needing a JWT.
 */
async function storeSessionReverse(
  kv: any,
  sessionId: string,
  userId: string,
): Promise<void> {
  await kv.put(`sessid:${sessionId}`, userId, { expirationTtl: SESSION_TTL });
}
// ─────────────────────────────────────────────────────────────────────────────

const auth = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// ─── Helper ───────────────────────────────────────────────────────────────────
/**
 * Lightweight auth check for use within auth routes themselves.
 * Supports both Bearer JWT and the shared session cookie.
 */
async function requireJwt(c: any): Promise<{ userId: string; sessionId: string; roles: string[] } | null> {
  let userId = '';
  let sessionId = '';

  // ── 1. Try Bearer JWT ──────────────────────────────────────────────────────
  const token = c.req.header('Authorization')?.slice(7);
  if (token) {
    const payload = await verifyNativeJwt(token, c.env.JWT_SECRET);
    if (payload) {
      userId    = payload.userId as string;
      sessionId = (payload.sessionId as string) || '';
    }
  }

  // ── 2. Fallback: session cookie ────────────────────────────────────────────
  if (!userId) {
    const cookieHeader = c.req.header('cookie') || '';
    const cookieSid = cookieHeader
      .split(';')
      .map((s: string) => s.trim())
      .find((s: string) => s.startsWith('session='))
      ?.slice('session='.length);

    if (cookieSid) {
      try {
        const storedUserId = await c.env.SETTINGS.get(`sessid:${cookieSid}`);
        if (storedUserId) {
          const stored = await c.env.SETTINGS.get(`sess:${storedUserId}`);
          if (stored) {
            const { sessionId: storedSid } = JSON.parse(stored) as { sessionId: string };
            if (storedSid === cookieSid) {
              userId    = storedUserId;
              sessionId = cookieSid;
            }
          }
        }
      } catch { /* ignore */ }
    }
  }

  if (!userId) return null;

  // ── 3. Load roles ──────────────────────────────────────────────────────────
  let roles: string[] = [];
  try {
    const cached = await c.env.SETTINGS.get(`ucache:${userId}`);
    if (cached) roles = (JSON.parse(cached) as { roles: string[] }).roles;
    else {
      const dbUser = await c.env.DB
        .prepare('SELECT roles FROM users WHERE id = ?')
        .bind(userId)
        .first() as { roles: string } | null;
      if (dbUser?.roles) roles = JSON.parse(dbUser.roles);
    }
  } catch { /* ignore */ }

  return { userId, sessionId, roles };
}
// ─────────────────────────────────────────────────────────────────────────────

/**
 * POST /api/auth/register
 * Institutional user registration.
 */
auth.post(
  '/register',
  zValidator('json', z.object({
    email: z.string().email(),
    password: z.string().min(8),
    name: z.string().min(2),
  }), (result, c) => {
    if (!result.success) {
      const error = (result as any).error;
      return c.json({ 
        success: false, 
        message: 'Validation failed: ' + error.issues.map((i: any) => `${i.path.join('.')}: ${i.message}`).join(', ') 
      }, 400);
    }
  }),
  async (c) => {
    const { email, password, name } = c.req.valid('json');
    const normalizedEmail = email.toLowerCase();

    // 1. Domain Check (with explicit whitelist for the primary admin)
    const isWhitelisted = normalizedEmail === 'admin@poliku.edu.my';
    if (c.env.ALLOWED_DOMAIN && !normalizedEmail.endsWith(`@${c.env.ALLOWED_DOMAIN.toLowerCase()}`) && !isWhitelisted) {
      return c.json({ success: false, message: `Only accounts with @${c.env.ALLOWED_DOMAIN} are allowed.` }, 403);
    }

    // 2. Check if user already exists
    const existing = await c.env.DB
      .prepare('SELECT id, password_hash FROM users WHERE email = ?')
      .bind(normalizedEmail)
      .first<{ id: string; password_hash: string | null }>();
    
    // If user exists and already has a password, block registration
    if (existing && existing.password_hash) {
      return c.json({ success: false, message: 'An account with this email already exists.' }, 400);
    }

    // 3. Hash Password & Create/Update User
    const passwordHash = await hashPassword(password);
    const userId = existing?.id || crypto.randomUUID();
    const sessionId = crypto.randomUUID();

    // Auto-grant Admin roles if this is the very first user (bootstrapping)
    const { count } = (await c.env.DB.prepare('SELECT COUNT(*) as count FROM users WHERE password_hash IS NOT NULL').first() as any) || { count: 0 };
    const shouldBeAdmin = count === 0 || normalizedEmail === 'admin@poliku.edu.my' || normalizedEmail.startsWith('admin@');
    
    const roles = shouldBeAdmin 
      ? ['Admin', 'Coordinator', 'Supervisor', 'Guest'] 
      : ['Guest'];

    try {
      if (existing) {
        // Upgrade existing Supabase record to Native Auth
        await c.env.DB.prepare(
          'UPDATE users SET name = ?, password_hash = ?, roles = ?, status = ?, is_verified = ? WHERE id = ?'
        ).bind(
          name,
          passwordHash,
          JSON.stringify(roles),
          'Active',
          1,
          existing.id
        ).run();
      } else {
        // Create brand new record
        await c.env.DB.prepare(
          'INSERT INTO users (id, name, email, password_hash, roles, status, is_verified) VALUES (?, ?, ?, ?, ?, ?, ?)'
        ).bind(
          userId,
          name,
          normalizedEmail,
          passwordHash,
          JSON.stringify(roles),
          'Active',
          1
        ).run();
      }
    } catch (e: any) {
      return c.json({ success: false, message: 'Registration failed.', error: e.message }, 500);
    }

    // 4. Generate Token
    const token = await generateToken(userId, normalizedEmail, roles, sessionId, c.env.JWT_SECRET);

    // 5. Register Session (forward + reverse KV)
    await c.env.SETTINGS.put(
      `sess:${userId}`,
      JSON.stringify({ sessionId, registeredAt: new Date().toISOString(), device: 'native-reg' }),
      { expirationTtl: SESSION_TTL },
    );
    await storeSessionReverse(c.env.SETTINGS, sessionId, userId);

    // 6. Set shared SSO cookie
    setSessionCookie(c, sessionId);

    return c.json({
      success: true,
      token,
      user: { id: userId, email: normalizedEmail, name, roles }
    });
  }
);

/**
 * POST /api/auth/login
 * Native credential authentication.
 */
auth.post(
  '/login',
  zValidator('json', z.object({
    email: z.string().email(),
    password: z.string(),
  })),
  async (c) => {
    const { email, password } = c.req.valid('json');
    const normalizedEmail = email.toLowerCase();

    // 1. Fetch User Record
    const user = await c.env.DB
      .prepare('SELECT id, name, password_hash, roles, status FROM users WHERE email = ?')
      .bind(normalizedEmail)
      .first<{ id: string; name: string; password_hash: string; roles: string; status: string }>();

    if (!user || user.status === 'Suspended') {
      return c.json({ success: false, message: 'Invalid credentials or account suspended.' }, 401);
    }

    // 2. Verify Password
    const loginHash = await hashPassword(password);
    if (loginHash !== user.password_hash) {
      return c.json({ success: false, message: 'Invalid credentials.' }, 401);
    }

    // 3. Generate New Session & Token
    const sessionId = crypto.randomUUID();
    const roles = JSON.parse(user.roles);
    const token = await generateToken(user.id, normalizedEmail, roles, sessionId, c.env.JWT_SECRET);

    // 4. Register Session in KV (forward + reverse)
    await c.env.SETTINGS.put(
      `sess:${user.id}`,
      JSON.stringify({ sessionId, registeredAt: new Date().toISOString(), device: 'native-login' }),
      { expirationTtl: SESSION_TTL },
    );
    await storeSessionReverse(c.env.SETTINGS, sessionId, user.id);

    // 5. Set shared SSO cookie
    setSessionCookie(c, sessionId);

    return c.json({
      success: true,
      token,
      user: { id: user.id, email: normalizedEmail, name: user.name, roles }
    });
  }
);

/**
 * PATCH /api/auth/password-reset
 * Admin-only: Force reset a staff member's password.
 */
auth.patch(
  '/password-reset',
  zValidator('json', z.object({
    userId: z.string(),
    newPassword: z.string().min(8),
  })),
  async (c) => {
    const info = await requireJwt(c);
    if (!info) return c.json({ success: false, message: 'Unauthorized' }, 401);
    const caps = deriveCapabilities({ id: info.userId, email: '', role: '', roles: info.roles, departmentId: null, qualifications: [] });
    if (!caps.has('system:admin')) {
      return c.json({ success: false, message: 'Forbidden: Admin only' }, 403);
    }

    const { userId, newPassword } = c.req.valid('json');
    const passwordHash = await hashPassword(newPassword);

    await c.env.DB
      .prepare('UPDATE users SET password_hash = ? WHERE id = ?')
      .bind(passwordHash, userId)
      .run();

    // Force displacement of all active sessions for this user
    await c.env.SETTINGS.put(
      `sess:${userId}`,
      JSON.stringify({ sessionId: FORCE_LOGOUT, forcedAt: new Date().toISOString(), by: info.userId }),
      { expirationTtl: SESSION_TTL },
    );

    return c.json({ success: true, message: 'Password reset successfully.' });
  }
);

/**
 * POST /api/auth/session
 * Keep compatibility for session management logic.
 */
auth.post(
  '/session',
  zValidator('json', z.object({ deviceHint: z.string().max(128).optional() })),
  async (c) => {
    const info = await requireJwt(c);
    if (!info) return c.json({ success: false, message: 'Unauthorized' }, 401);

    const { userId, sessionId } = info;
    const { deviceHint } = c.req.valid('json');

    await c.env.SETTINGS.put(
      `sess:${userId}`,
      JSON.stringify({ sessionId, registeredAt: new Date().toISOString(), device: deviceHint ?? 'unknown' }),
      { expirationTtl: SESSION_TTL },
    );

    return c.json({ success: true, enforced: true });
  },
);

/**
 * DELETE /api/auth/session
 */
auth.delete('/session', async (c) => {
  const info = await requireJwt(c);
  if (!info) return c.json({ success: false, message: 'Unauthorized' }, 401);

  const { userId, sessionId } = info;
  clearSessionCookie(c);
  await Promise.allSettled([
    c.env.SETTINGS.delete(`sess:${userId}`),
    c.env.SETTINGS.delete(`ucache:${userId}`),
    sessionId ? c.env.SETTINGS.delete(`sessid:${sessionId}`) : Promise.resolve(),
  ]);

  return c.json({ success: true });
});

/**
 * GET /api/auth/me
 * Returns the current user profile.
 */
auth.get('/me', async (c) => {
  const info = await requireJwt(c);
  if (!info) return c.json({ success: false, message: 'Unauthorized' }, 401);

  const user = await c.env.DB
    .prepare('SELECT * FROM users WHERE id = ?')
    .bind(info.userId)
    .first();

  if (!user) return c.json({ success: false, message: 'User not found' }, 404);

  return c.json({ success: true, user });
});

/**
 * PATCH /api/auth/me
 * Allows the authenticated user to update their own contact number.
 * Body: { contactNumber?: string }
 */
auth.patch('/me', async (c) => {
  const info = await requireJwt(c);
  if (!info) return c.json({ success: false, message: 'Unauthorized' }, 401);

  let body: { contactNumber?: unknown } = {};
  try { body = await c.req.json(); } catch { /* empty body ok */ }

  const contactNumber = typeof body.contactNumber === 'string'
    ? body.contactNumber.trim().slice(0, 30)
    : null;

  await c.env.DB
    .prepare('UPDATE users SET contact_number = ? WHERE id = ?')
    .bind(contactNumber || null, info.userId)
    .run();

  // Bust the KV role/profile cache so the next session load picks up the new number
  try { await c.env.SETTINGS.delete(`ucache:${info.userId}`); } catch { /* non-fatal */ }

  return c.json({ success: true });
});

/**
 * POST /api/auth/request-reset
 * Public self-service password reset. Immediately resets to default password.
 */
auth.post(
  '/request-reset',
  zValidator('json', z.object({ email: z.string().email() })),
  async (c) => {
    const { email } = c.req.valid('json');
    try {
      const user = await c.env.DB
        .prepare('SELECT id, name FROM users WHERE email = ?')
        .bind(email.toLowerCase())
        .first<{ id: string; name: string }>();

      if (!user) {
        // Don't leak exists status
        return c.json({ success: true, message: 'If the account exists, your password has been reset to the default. Please try logging in with the default password.' });
      }

      // Immediately reset password to default
      const defaultHash = await hashPassword(DEFAULT_USER_PASSWORD);
      await c.env.DB.prepare(
        'UPDATE users SET password_hash = ?, must_change_pin = 0 WHERE id = ?'
      ).bind(defaultHash, user.id).run();

      // Evict user cache
      await c.env.SETTINGS.delete(`ucache:${user.id}`).catch(() => {});

      // Log activity
      const activityId = crypto.randomUUID();
      await c.env.DB.prepare(
        'INSERT INTO system_activities (id, type, user_id, message, timestamp, metadata) VALUES (?, ?, ?, ?, ?, ?)'
      ).bind(
        activityId,
        'PASSWORD_RESET',
        user.id,
        `${user.name} reset their password to default via self-service.`,
        new Date().toISOString(),
        JSON.stringify({ email: email.toLowerCase() })
      ).run();

      return c.json({ success: true, message: 'Password has been reset to default. Please login using the default password.' });
    } catch (err: any) {
      return c.json({ error: err.message }, 500);
    }
  }
);

// ─── Google OAuth ──────────────────────────────────────────────────────────────

/**
 * Generate a PKCE code_verifier (43–128 URL-safe random chars).
 */
function generateCodeVerifier(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return btoa(String.fromCharCode(...array))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

/**
 * Derive the S256 code_challenge from a code_verifier.
 */
async function generateCodeChallenge(verifier: string): Promise<string> {
  const data = new TextEncoder().encode(verifier);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

/**
 * Verify a Google ID token via Google's tokeninfo endpoint.
 * Validates iss, aud, exp, and email_verified.
 */
async function verifyGoogleIdToken(
  idToken: string,
  clientId: string,
): Promise<Record<string, any> | null> {
  try {
    const res = await fetch(
      `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`,
    );
    if (!res.ok) return null;

    const payload = (await res.json()) as Record<string, any>;

    const now = Math.floor(Date.now() / 1000);
    const validIss =
      payload.iss === 'accounts.google.com' ||
      payload.iss === 'https://accounts.google.com';

    if (!validIss) return null;
    if (payload.aud !== clientId) return null;
    if (!payload.exp || Number(payload.exp) < now) return null;
    if (!payload.email_verified || payload.email_verified === 'false') return null;

    return payload;
  } catch {
    return null;
  }
}

/**
 * GET /api/auth/google
 * Initiates the Google OAuth2 flow with PKCE + state.
 */
auth.get('/google', async (c) => {
  const state = crypto.randomUUID();
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = await generateCodeChallenge(codeVerifier);

  const appUrl  = c.env.APP_URL  || 'https://www.inspect-able.com';
  const authUrl  = c.env.AUTH_URL  || appUrl;
  // Validate and thread returnTo through state so it survives the OAuth round-trip
  const returnTo = validateReturnTo(c.req.query('returnTo'), appUrl);

  // Store state → codeVerifier + returnTo in KV (10 min window)
  await c.env.SETTINGS.put(
    `oauth_state:${state}`,
    JSON.stringify({ codeVerifier, returnTo }),
    { expirationTtl: 600 },
  );
  const params = new URLSearchParams({
    client_id: c.env.GOOGLE_CLIENT_ID,
    redirect_uri: `${authUrl}/api/auth/google/callback`,
    // ↑ Always use auth.inspect-able.com — must match the URI registered
    response_type: 'code',
    scope: 'openid email profile',
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    // hd is a UX hint only — not used for security validation
    hd: c.env.ALLOWED_DOMAIN || 'poliku.edu.my',
    prompt: 'select_account',
  });

  return c.redirect(
    `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`,
  );
});

/**
 * GET /api/auth/google/callback
 * Handles the redirect from Google. Validates state + PKCE, verifies the ID
 * token, provisions the user, and issues a short-lived exchange token that the
 * SPA can trade for a regular JWT.
 */
auth.get('/google/callback', async (c) => {
  const appUrl  = c.env.APP_URL  || 'https://www.inspect-able.com';
  const authUrl  = c.env.AUTH_URL  || appUrl;
  const redirect = (err: string) =>
    c.redirect(`${appUrl}/?auth_error=${encodeURIComponent(err)}`);

  const { code, state, error } = c.req.query();

  if (error) return redirect(error);
  if (!code || !state) return redirect('missing_params');

  // ── 1. Validate state ──────────────────────────────────────────────────────
  const storedRaw = await c.env.SETTINGS.get(`oauth_state:${state}`);
  if (!storedRaw) return redirect('invalid_state');

  const { codeVerifier, returnTo: storedReturnTo } = JSON.parse(storedRaw) as { codeVerifier: string; returnTo: string };
  const returnTo = validateReturnTo(storedReturnTo, appUrl);
  // One-time use — delete immediately
  await c.env.SETTINGS.delete(`oauth_state:${state}`);

  // ── 2. Exchange code for tokens ────────────────────────────────────────────
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: c.env.GOOGLE_CLIENT_ID,
      client_secret: c.env.GOOGLE_CLIENT_SECRET,
      redirect_uri: `${authUrl}/api/auth/google/callback`,
      grant_type: 'authorization_code',
      code_verifier: codeVerifier,
    }),
  });

  if (!tokenRes.ok) return redirect('token_exchange_failed');

  const tokens = (await tokenRes.json()) as { id_token?: string };
  if (!tokens.id_token) return redirect('no_id_token');

  // ── 3. Verify ID token ─────────────────────────────────────────────────────
  const idPayload = await verifyGoogleIdToken(tokens.id_token, c.env.GOOGLE_CLIENT_ID);
  if (!idPayload) return redirect('invalid_id_token');

  const {
    email,
    email_verified,
    sub: providerAccountId,
    name,
    picture,
  } = idPayload as {
    email: string;
    email_verified: boolean | string;
    sub: string;
    name: string;
    picture: string;
  };

  // ── 4. Domain check (real security — not hd hint) ──────────────────────────
  const allowedDomain = c.env.ALLOWED_DOMAIN || 'poliku.edu.my';
  const isVerified =
    email_verified === true || email_verified === 'true';
  if (!isVerified || !email.toLowerCase().endsWith(`@${allowedDomain}`)) {
    return redirect('domain_not_allowed');
  }

  // ── 5. Find or auto-provision user ─────────────────────────────────────────
  // Use LOWER() for case-insensitive match — admin-created accounts may have
  // mixed-case emails that were not normalised at insert time.
  let dbUser = await c.env.DB
    .prepare('SELECT id, name, email, roles, status FROM users WHERE LOWER(email) = ?')
    .bind(email.toLowerCase())
    .first<{ id: string; name: string; email: string; roles: string; status: string }>();

  if (!dbUser) {
    const newId = crypto.randomUUID();
    await c.env.DB.prepare(
      `INSERT INTO users (id, name, email, picture, roles, status, is_verified)
       VALUES (?, ?, ?, ?, ?, 'Active', 1)`,
    ).bind(newId, name, email.toLowerCase(), picture, JSON.stringify(['Guest'])).run();
    dbUser = { id: newId, name, email: email.toLowerCase(), roles: JSON.stringify(['Guest']), status: 'Active' };
  } else if (dbUser.status === 'Suspended') {
    return redirect('account_suspended');
  }

  // Update picture from Google on every login so it stays current.
  // Also normalise the stored email to lowercase if it isn't already.
  await c.env.DB
    .prepare('UPDATE users SET picture = ?, email = LOWER(email) WHERE id = ?')
    .bind(picture, dbUser.id)
    .run();

  // Invalidate role/profile cache so the new session sees the latest D1 data.
  await c.env.SETTINGS.delete(`ucache:${dbUser.id}`);

  // ── 6. Upsert accounts record ──────────────────────────────────────────────
  await c.env.DB.prepare(
    `INSERT INTO accounts (id, user_id, provider, provider_account_id, provider_email)
     VALUES (?, ?, 'google', ?, ?)
     ON CONFLICT (provider, provider_account_id) DO NOTHING`,
  ).bind(crypto.randomUUID(), dbUser.id, providerAccountId, email.toLowerCase()).run();

  // ── 7. Session rotation — always fresh session ID ──────────────────────────
  const sessionId = crypto.randomUUID();
  const roles = JSON.parse(dbUser.roles) as string[];

  await c.env.SETTINGS.put(
    `sess:${dbUser.id}`,
    JSON.stringify({ sessionId, registeredAt: new Date().toISOString(), device: 'google-oauth' }),
    { expirationTtl: SESSION_TTL },
  );
  // Write reverse lookup so cookie-based auth works after Google login
  await storeSessionReverse(c.env.SETTINGS, sessionId, dbUser.id);

  const token = await generateToken(dbUser.id, dbUser.email, roles, sessionId, c.env.JWT_SECRET);

  // ── 8. Short-lived exchange token (60 s, one-time use) ────────────────────
  const exchangeToken = crypto.randomUUID();
  await c.env.SETTINGS.put(
    `oauth_exchange:${exchangeToken}`,
    JSON.stringify({ token, userId: dbUser.id }),
    { expirationTtl: 60 },
  );

  // If returnTo has .html, just append ?, otherwise append /?
  const separator = returnTo.includes('.html') ? '?' : '/?';
  return c.redirect(`${returnTo}${separator}google_callback=${exchangeToken}`);
});

/**
 * POST /api/auth/google/exchange
 * The SPA calls this once with the short-lived exchange token to receive a
 * standard JWT.  The exchange token is deleted on first use.
 */
auth.post(
  '/google/exchange',
  zValidator('json', z.object({ exchangeToken: z.string().uuid() })),
  async (c) => {
    const { exchangeToken } = c.req.valid('json');

    const raw = await c.env.SETTINGS.get(`oauth_exchange:${exchangeToken}`);
    if (!raw) {
      return c.json({ success: false, message: 'Invalid or expired exchange token.' }, 401);
    }

    // One-time use — delete immediately
    await c.env.SETTINGS.delete(`oauth_exchange:${exchangeToken}`);

    const { token, userId } = JSON.parse(raw) as { token: string; userId: string };

    // Fetch the full user row so the client receives all profile fields
    // (designation, departmentId, contactNumber, certificationExpiry, etc.).
    const user = await c.env.DB
      .prepare('SELECT * FROM users WHERE id = ?')
      .bind(userId)
      .first<Record<string, any>>();

    if (!user) {
      return c.json({ success: false, message: 'User not found.' }, 401);
    }

    // Set the SSO cookie so the kiosk / other apps get the session automatically.
    // The cookie value must be the sessionId (UUID), not the JWT.
    const stored = await c.env.SETTINGS.get(`sess:${user.id}`);
    const cookieSessionId = stored
      ? (JSON.parse(stored) as { sessionId: string }).sessionId
      : null;
    if (cookieSessionId) {
      setSessionCookie(c, cookieSessionId);
      // Safety-net: ensure reverse lookup exists even if callback didn't write it
      await storeSessionReverse(c.env.SETTINGS, cookieSessionId, user.id as string);
    }

    return c.json({
      success: true,
      token,
      user,
    });
  },
);

/**
 * GET /api/auth/accounts
 * Returns the current user's linked OAuth provider accounts.
 */
auth.get('/accounts', async (c) => {
  const info = await requireJwt(c);
  if (!info) return c.json({ success: false, message: 'Unauthorized' }, 401);

  const result = await c.env.DB
    .prepare(
      'SELECT provider, provider_email, created_at FROM accounts WHERE user_id = ? ORDER BY created_at ASC',
    )
    .bind(info.userId)
    .all<{ provider: string; provider_email: string; created_at: string }>();

  return c.json({ success: true, accounts: result.results });
});

export { auth as authRoutes };
