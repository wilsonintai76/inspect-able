/**
 * ─── PBAC Hono Middleware ─────────────────────────────────────────────────────
 *
 * Wire the PBAC engine into the Hono request lifecycle.
 *
 * Usage (route-level):
 *
 *   router.patch('/audits/:id',
 *     zValidator('json', patchAuditSchema),
 *     requirePolicy('schedule.assign', async (c) => {
 *       const body = c.req.valid('json');
 *       const existing = await c.env.DB.prepare('...').first();
 *       return {
 *         targetDepartmentId: body.departmentId ?? existing?.department_id,
 *         scheduleStatus: existing?.auditor1_id ? 'assigned' : 'open',
 *         // ...etc
 *       };
 *     }),
 *     async (c) => { /* handler only runs if PBAC passes *​/ }
 *   );
 *
 * Design:
 *   - Runs AFTER zValidator so c.req.valid('json') is available.
 *   - Runs AFTER authMiddleware so c.get('user') is populated.
 *   - Returns 403 with { error, code, reason } on denial.
 *   - The contextBuilder is async to support DB lookups when necessary.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { Context, Next } from 'hono';
import { Bindings, Variables } from '../types';
import {
  evaluateAccess,
  getReasonMessage,
  PbacAction,
  PbaoUser,
  PolicyEvaluationContext,
} from '../utils/policyEngine';

// ═══════════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════════

type HonoContext = Context<{ Bindings: Bindings; Variables: Variables }>;

/**
 * A function that builds the PolicyEvaluationContext from the Hono request.
 * Called just before policy evaluation — has full access to DB, KV, body, params.
 */
export type ContextBuilder = (
  c: HonoContext,
) => PolicyEvaluationContext | Promise<PolicyEvaluationContext>;

// ═══════════════════════════════════════════════════════════════════════════════
// Middleware Factory
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Create a Hono middleware that enforces PBAC policies for the given action.
 *
 * @param action    - The PBAC action to enforce (e.g. 'schedule.assign').
 * @param buildCtx  - Async function that builds the evaluation context from the request.
 *                    Receives the full Hono context (DB, KV, body, params all available).
 */
export function requirePolicy(
  action: PbacAction,
  buildCtx: ContextBuilder,
) {
  return async (c: HonoContext, next: Next) => {
    // ── 1. Extract user (set by authMiddleware) ────────────────────────────
    const user = c.get('user');
    if (!user) {
      return c.json(
        { error: 'Unauthorized', code: 'AUTH_REQUIRED' },
        401,
      );
    }

    // ── 2. Build the PBAC user shape ───────────────────────────────────────
    const pbaoUser: PbaoUser = {
      id: user.id,
      email: user.email,
      role: user.role,
      roles: user.roles || [],
      departmentId: user.departmentId ?? null,
      certificationExpiry: user.certificationExpiry ?? null,
    };

    // ── 3. Build the evaluation context ────────────────────────────────────
    let ctx: PolicyEvaluationContext;
    try {
      ctx = await buildCtx(c);
    } catch (err: any) {
      console.error('[PBAC] Context builder failed:', err);
      return c.json(
        { error: 'Policy evaluation failed', code: 'PBAC_CONTEXT_ERROR' },
        500,
      );
    }

    // ── 4. Evaluate ────────────────────────────────────────────────────────
    const result = evaluateAccess(pbaoUser, action, ctx);

    if (!result.allowed) {
      const reason = result.reason || 'UNKNOWN';
      return c.json(
        {
          error: getReasonMessage(reason),
          code: reason,
          action,
        },
        403,
      );
    }

    // ── 5. All policies passed → continue to handler ──────────────────────
    await next();
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// Pre-built Context Builders (common patterns)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Builds context from a validated request body (requires zValidator upstream).
 * Use this when the body already contains all the fields needed for policy eval.
 */
function bodyContextBuilder(
  overrides?: Partial<PolicyEvaluationContext>,
): ContextBuilder {
  return (c) => {
    const body = (c.req as any).valid('json') as Record<string, any> | undefined;
    return {
      targetDepartmentId: body?.departmentId ?? null,
      ...overrides,
    };
  };
}

/**
 * Builds context by fetching the current audit record from D1,
 * then merging with the validated request body fields.
 *
 * This is the most common pattern for PATCH routes —
 * we need to know the record's current state to evaluate policies.
 */
export function auditPatchContextBuilder(
  overrides?: Partial<PolicyEvaluationContext>,
): ContextBuilder {
  return async (c) => {
    const id = c.req.param('id');
    const body = (c.req as any).valid('json') as Record<string, any> | undefined;

    // Fetch current state
    const existing = await c.env.DB.prepare(
      `SELECT department_id, status, auditor1_id, auditor2_id,
              supervisor_id
       FROM audit_schedules WHERE id = ?`,
    )
      .bind(id)
      .first<{
        department_id: string | null;
        status: string;
        auditor1_id: string | null;
        auditor2_id: string | null;
        supervisor_id: string | null;
      }>();

    // Determine which auditor slot is being targeted
    const targetSlot = body?.auditor1Id !== undefined
      ? 'auditor1'
      : body?.auditor2Id !== undefined
        ? 'auditor2'
        : null;

    // Determine schedule status for the target slot
    let scheduleStatus = 'open';
    if (existing) {
      if (targetSlot === 'auditor1' && existing.auditor1_id) {
        scheduleStatus = existing.auditor1_id === (c.get('user')?.id) ? 'open' : 'assigned';
      } else if (targetSlot === 'auditor2' && existing.auditor2_id) {
        scheduleStatus = existing.auditor2_id === (c.get('user')?.id) ? 'open' : 'assigned';
      }
    }

    // Parse supervisor IDs
    const supervisorIds = existing?.supervisor_id
      ? existing.supervisor_id.split(',').map((s: string) => s.trim()).filter(Boolean)
      : [];

    return {
      targetDepartmentId:
        body?.departmentId ?? existing?.department_id ?? null,
      scheduleStatus,
      existingAuditor1Id: existing?.auditor1_id ?? null,
      existingAuditor2Id: existing?.auditor2_id ?? null,
      supervisorIds,
      ...overrides,
    };
  };
}

/**
 * Empty context — for routes that only need capability-based policies.
 * No DB reads, no body parsing. Pure user-capability check.
 */
export function emptyContextBuilder(
  overrides?: Partial<PolicyEvaluationContext>,
): ContextBuilder {
  return () => ({ ...overrides });
}

/**
 * Builds context from request body with department scoping.
 * For routes where the body carries a departmentId (user create, audit create).
 */
export function bodyDeptContextBuilder(
  overrides?: Partial<PolicyEvaluationContext>,
): ContextBuilder {
  return (c) => {
    const body = (c.req as any).valid('json') as Record<string, any> | undefined;
    return {
      targetDepartmentId: body?.departmentId ?? null,
      ...overrides,
    };
  };
}

/**
 * For user.update — fetches the target user's department for coordinator scoping
 * and passes the target user ID for self-update checks.
 */
export function userPatchContextBuilder(
  overrides?: Partial<PolicyEvaluationContext>,
): ContextBuilder {
  return async (c) => {
    const targetId = c.req.param('id');
    const target = await c.env.DB.prepare(
      'SELECT department_id FROM users WHERE id = ?',
    )
      .bind(targetId)
      .first<{ department_id: string | null }>();
    return {
      targetDepartmentId: target?.department_id ?? null,
      targetUserId: targetId,
      ...overrides,
    };
  };
}

/**
 * For audit.create (POST /audits) — uses body departmentId for COI + dept scoping.
 */
function auditCreateContextBuilder(
  overrides?: Partial<PolicyEvaluationContext>,
): ContextBuilder {
  return (c) => {
    const body = (c.req as any).valid('json') as Record<string, any> | undefined;
    return {
      targetDepartmentId: body?.departmentId ?? null,
      ...overrides,
    };
  };
}
