import { Context, Next } from 'hono';
import { verify } from 'hono/jwt';
import { getCookie } from 'hono/cookie';
import { Bindings, Variables } from '../types';

// ─── KV key prefixes ──────────────────────────────────────────────────────────
// sess:{userId}   → { sessionId: string }   — single-session registry (24h TTL)
// ucache:{userId} → { roles, departmentId } — user-role cache (5min TTL)
// ─────────────────────────────────────────────────────────────────────────────
const USER_CACHE_TTL = 300;        // 5 minutes
const SESSION_TTL    = 86_400;     // 24 hours

/**
 * Standard JWT verification using HS256 and the shared secret.
 */
export async function verifyNativeJwt(
  token: string,
  secret: string,
): Promise<Record<string, unknown> | null> {
  try {
    const payload = await verify(token, secret, 'HS256');
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
        return null; 
    }
    return payload as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * Full auth middleware — verifies native JWT or shared session cookie,
 * enforces single-session via KV, and populates context variables.
 *
 * Auth priority:
 *   1. Authorization: Bearer <jwt>  (SPA / API clients)
 *   2. Cookie: session=<sessionId>  (SSO — set after any login on any subdomain)
 */
export const authMiddleware = async (
  c: Context<{ Bindings: Bindings; Variables: Variables }>,
  next: Next,
) => {
  let userId    = '';
  let email     = '';
  let sessionId = '';
  let authMethod: 'bearer' | 'cookie' | null = null;

  // ── 1a. Try Authorization: Bearer <jwt> ───────────────────────────────────
  const authHeader = c.req.header('Authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    const payload = await verifyNativeJwt(token, c.env.JWT_SECRET);
    if (payload) {
      const uid = payload.userId as string;
      if (uid) {
        userId    = uid;
        email     = (payload.email as string) || '';
        sessionId = (payload.sessionId as string) || '';
        authMethod = 'bearer';
      }
    }
  }

  // ── 1b. Fallback: session cookie (SSO path) ───────────────────────────────
  if (!authMethod) {
    const cookieSessionId = getCookie(c, 'session');
    if (cookieSessionId) {
      try {
        const storedUserId = await c.env.SETTINGS.get(`sessid:${cookieSessionId}`);
        if (storedUserId) {
          // Forward-verify: the active session for this user is still this sessionId
          const stored = await c.env.SETTINGS.get(`sess:${storedUserId}`);
          if (stored) {
            const { sessionId: storedSid } = JSON.parse(stored) as { sessionId: string };
            if (storedSid === cookieSessionId) {
              userId    = storedUserId;
              sessionId = cookieSessionId;
              authMethod = 'cookie';
            }
          }
        }
      } catch {
        // KV unavailable — fail closed below
      }
    }
  }

  if (!authMethod || !userId) {
    return c.json({ success: false, message: 'Unauthorized' }, 401);
  }

  // ── 2. Single-session enforcement (Bearer only — cookie is already validated
  //       by the reverse-lookup above, which proves the session is current)
  if (authMethod === 'bearer' && sessionId) {
    try {
      const stored = await c.env.SETTINGS.get(`sess:${userId}`);
      if (stored) {
        const { sessionId: storedSid } = JSON.parse(stored) as { sessionId: string };
        if (storedSid !== sessionId) {
          return c.json(
            {
              success: false,
              message: 'Session displaced — your account was signed in from another location.',
              code: 'SESSION_DISPLACED',
            },
            401,
          );
        }
      }
    } catch {
      // KV unavailable — fail open
    }
  }

  // 3. Load user roles + departmentId — KV cache first, D1 fallback
  let roles: string[]             = [];
  let departmentId: string | null = null;
  let certificationExpiry: string | null = null;
  let userExists                  = true;

  try {
    const cached = await c.env.SETTINGS.get(`ucache:${userId}`, { cacheTtl: USER_CACHE_TTL });
    if (cached) {
      const parsed = JSON.parse(cached) as { roles: string[]; departmentId: string | null; certificationExpiry?: string | null; email?: string };
      roles = parsed.roles;
      departmentId = parsed.departmentId;
      certificationExpiry = parsed.certificationExpiry || null;
      // For cookie-only sessions the email wasn't in the JWT — pick it up from cache
      if (!email && parsed.email) email = parsed.email;
    } else {
      const dbUser = await c.env.DB
        .prepare('SELECT email, roles, department_id, certification_expiry FROM users WHERE id = ?')
        .bind(userId)
        .first<{ email: string; roles: string; department_id: string | null; certification_expiry: string | null }>();

      if (dbUser) {
        if (!email) email = dbUser.email;
        if (dbUser.roles) roles = JSON.parse(dbUser.roles);
        departmentId = dbUser.department_id ?? null;
        certificationExpiry = dbUser.certification_expiry ?? null;
        
        // Write through to KV (include email so cookie-only sessions can use it)
        await c.env.SETTINGS.put(
          `ucache:${userId}`,
          JSON.stringify({ email, roles, departmentId, certificationExpiry }),
          { expirationTtl: USER_CACHE_TTL },
        );
      } else {
        userExists = false;
      }
    }
  } catch {
    // D1 or KV unavailable
  }

  if (!userExists) {
    return c.json({ success: false, message: 'User not found' }, 401);
  }

  // PBAC derives asset_inspector from certificationExpiry — no need to inject 'Auditor' role
  const today = new Date().toISOString().split('T')[0];
  const isCertified = certificationExpiry && certificationExpiry >= today;
  // Auditor role injection removed — PBAC handles certification via deriveCapabilities

  // 4. Populate context
  c.set('user', {
    id: userId,
    email,
    role: roles[0] || 'Guest',
    roles,
    departmentId,
    sessionId,
    certificationExpiry,
  });

  await next();
};
