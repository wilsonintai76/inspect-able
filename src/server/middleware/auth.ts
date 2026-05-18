import { Context, Next } from 'hono';
import { verify } from 'hono/jwt';
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
 * Full auth middleware — verifies native JWT, enforces single-session via KV, 
 * and populates context variables.
 */
export const authMiddleware = async (
  c: Context<{ Bindings: Bindings; Variables: Variables }>,
  next: Next,
) => {
  const authHeader = c.req.header('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return c.json({ success: false, message: 'Missing or invalid Authorization header' }, 401);
  }

  const token = authHeader.slice(7);

  // 1. JWT verification
  const payload = await verifyNativeJwt(token, c.env.JWT_SECRET);
  if (!payload) {
    return c.json({ success: false, message: 'Unauthorized' }, 401);
  }

  const userId    = payload.userId as string;
  const email     = (payload.email as string) || '';
  const sessionId = (payload.sessionId as string) || '';

  if (!userId) {
    return c.json({ success: false, message: 'Unauthorized' }, 401);
  }

  // 2. Single-session enforcement via KV
  if (sessionId) {
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
      const parsed = JSON.parse(cached) as { roles: string[]; departmentId: string | null; certificationExpiry?: string | null };
      roles = parsed.roles;
      departmentId = parsed.departmentId;
      certificationExpiry = parsed.certificationExpiry || null;
    } else {
      const dbUser = await c.env.DB
        .prepare('SELECT roles, department_id, certification_expiry FROM users WHERE id = ?')
        .bind(userId)
        .first<{ roles: string; department_id: string | null; certification_expiry: string | null }>();

      if (dbUser) {
        if (dbUser.roles) roles = JSON.parse(dbUser.roles);
        departmentId = dbUser.department_id ?? null;
        certificationExpiry = dbUser.certification_expiry ?? null;
        
        // Write through to KV
        await c.env.SETTINGS.put(
          `ucache:${userId}`,
          JSON.stringify({ roles, departmentId, certificationExpiry }),
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

  // Dynamic Certified Officer Role Injection
  const today = new Date().toISOString().split('T')[0];
  const isCertified = certificationExpiry && certificationExpiry >= today;
  if (isCertified && !roles.includes('Auditor')) {
    roles = [...roles, 'Auditor'];
  }

  // 4. Populate context
  c.set('user', {
    id: userId,
    email,
    role: roles[0] || 'Staff',
    roles,
    departmentId,
    sessionId,
  });

  await next();
};
