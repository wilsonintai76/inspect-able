import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { Bindings, Variables } from '../types';
import { requirePolicy, emptyContextBuilder } from '../middleware/pbac';

const compute = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Check if a schedule belongs to a phase by date range (ignores stale phase_id). */
function isInPhase(s: any, phase: any): boolean {
  if (s.date) {
    const d = new Date(s.date); d.setHours(12, 0, 0, 0);
    const start = new Date(phase.start_date); start.setHours(0, 0, 0, 0);
    const end = new Date(phase.end_date); end.setHours(23, 59, 59, 999);
    return d >= start && d <= end;
  }
  return s.phase_id === phase.id;
}

const stripFences = (text: string) => text.trim().replace(/^```json\n?|\n?```$/g, '').trim();

/** Resolves the KPI tier for a department by its % share of institution total assets. */
function resolveTier(
  deptTotalAssets: number,
  institutionTotalAssets: number,
  sortedTiers: { id: string; minAssets: number }[],
): { id: string; minAssets: number } | null {
  if (institutionTotalAssets === 0) return null;
  const pct = (deptTotalAssets / institutionTotalAssets) * 100;
  return (
    [...sortedTiers].filter((t) => pct >= t.minAssets).sort((a, b) => b.minAssets - a.minAssets)[0] ?? null
  );
}

/** Returns true when an audit_schedule is "locked" (date + at least one auditor set). */
function isLocked(a: { date: string | null; auditor1_id: string | null; auditor2_id: string | null }) {
  return !!(a.date && (a.auditor1_id || a.auditor2_id));
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/compute/kpi
// Computes KPI progress stats server-side (previously done in KPIStatsWidget.tsx
// via multiple useMemo hooks over data already fetched to the browser).
// Returns globalStats + tierStats for the current active phase.
// ─────────────────────────────────────────────────────────────────────────────
compute.get('/kpi', async (c) => {
  const db = c.env.DB;
  const today = new Date().toISOString().split('T')[0];

  // Fetch all required tables in parallel
  const [deptsResult, locsResult, schedulesResult, tiersResult, tierTargetsResult, phasesResult, instKPIsResult] =
    await Promise.all([
      db.prepare('SELECT id, name, total_assets FROM departments').all(),
      db.prepare("SELECT id, department_id, total_assets FROM locations WHERE status != 'Archived'").all(),
      db.prepare('SELECT location_id, department_id, phase_id, status FROM audit_schedules').all(),
      db.prepare('SELECT id, name, min_assets FROM kpi_tiers ORDER BY min_assets ASC').all(),
      db.prepare('SELECT tier_id, phase_id, target_percentage FROM kpi_tier_targets').all(),
      db.prepare('SELECT id, name, start_date, end_date FROM audit_phases ORDER BY start_date ASC').all(),
      db.prepare('SELECT phase_id, target_percentage FROM institution_kpi_targets').all(),
    ]);

  const depts = (deptsResult.results || []) as any[];
  const locs = (locsResult.results || []) as any[];
  const schedules = (schedulesResult.results || []) as any[];
  const tiers = (tiersResult.results || []) as any[];
  const tierTargets = (tierTargetsResult.results || []) as any[];
  const phases = (phasesResult.results || []) as any[];
  const instKPIs = (instKPIsResult.results || []) as any[];

  if (phases.length === 0) return c.json({ globalStats: null, tierStats: [], activePhase: null });

  // 1. Active phase = first phase whose date window contains today, else first chronologically
  const activePhase =
    phases.find((p: any) => p.start_date <= today && p.end_date >= today) ?? phases[0];

  // 2. Pre-compute lookup tables
  const locAssets: Record<string, number> = {};
  const locAssetsByDept: Record<string, number> = {};
  for (const l of locs) {
    locAssets[l.id] = l.total_assets || 0;
    locAssetsByDept[l.department_id] = (locAssetsByDept[l.department_id] || 0) + (l.total_assets || 0);
  }

  // Effective dept assets = MAX(dept.total_assets stored, SUM of its location assets)
  // This mirrors the frontend departmentsWithAssets memo.
  const deptEffective = (d: any) =>
    Math.max(d.total_assets || 0, locAssetsByDept[d.id] || 0);

  const institutionTotalAssets = depts.reduce((s: number, d: any) => s + deptEffective(d), 0);

  // 3. Tier stats
  const tierStats = tiers.map((tier: any, idx: number) => {
    const deptsInTier = depts.filter((d: any) => {
      const assigned = resolveTier(deptEffective(d), institutionTotalAssets, tiers);
      return assigned?.id === tier.id;
    });

    const targetPct =
      tierTargets.find((kt: any) => kt.tier_id === tier.id && kt.phase_id === activePhase.id)?.target_percentage ?? 0;

    const deptDetails = deptsInTier.map((d: any) => {
      const total = deptEffective(d);
      const completedLocIds = schedules
        .filter((s: any) => s.department_id === d.id && isInPhase(s, activePhase) && s.status === 'Completed')
        .map((s: any) => s.location_id);
      const inspected = completedLocIds.reduce((sum: number, lid: string) => sum + (locAssets[lid] || 0), 0);
      const isZero = total === 0;
      const pct = isZero ? 100 : Math.round((inspected / total) * 100);
      return {
        id: d.id,
        name: d.name,
        assets: total,
        inspectedAssets: inspected,
        percentage: pct,
        status: isZero || pct >= targetPct ? 'On Track' : 'At Risk',
      };
    }).sort((a: any, b: any) => a.percentage - b.percentage);

    const totalTierAssets = deptsInTier.reduce((s: number, d: any) => s + deptEffective(d), 0);
    const inspectedTierAssets = deptDetails.reduce((s: number, d: any) => s + d.inspectedAssets, 0);
    const actualPct = totalTierAssets > 0 ? Math.round((inspectedTierAssets / totalTierAssets) * 100) : 0;

    return {
      id: tier.id,
      name: tier.name,
      minAssets: tier.min_assets,
      isHighestTier: idx === tiers.length - 1,
      nextMin: tiers[idx + 1]?.min_assets ?? 100,
      departments: deptDetails,
      deptCount: deptsInTier.length,
      actualPercentage: actualPct,
      targetPercentage: targetPct,
      status: actualPct >= targetPct ? 'On Track' : 'At Risk',
    };
  });

  // 4. Global institutional stats
  const instTarget = instKPIs.find((k: any) => k.phase_id === activePhase.id)?.target_percentage ?? 0;
  const targetAssets = Math.ceil(institutionTotalAssets * instTarget / 100);
  const completedLocIds = new Set(
    schedules.filter((s: any) => isInPhase(s, activePhase) && s.status === 'Completed').map((s: any) => s.location_id),
  );
  const inspectedAssets = locs
    .filter((l: any) => completedLocIds.has(l.id))
    .reduce((sum: number, l: any) => sum + (l.total_assets || 0), 0);
  const actualGlobalPct =
    institutionTotalAssets > 0 ? Math.round((inspectedAssets / institutionTotalAssets) * 100) : 0;

  const globalStats = {
    totalInstitutionAssets: institutionTotalAssets,
    inspectedAssets,
    targetAssets,
    actualPercentage: actualGlobalPct,
    targetPercentage: instTarget,
    isOnTrack: actualGlobalPct >= instTarget,
  };

  return c.json({
    activePhase: { id: activePhase.id, name: activePhase.name, startDate: activePhase.start_date, endDate: activePhase.end_date },
    globalStats,
    tierStats,
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/compute/rebalance
// Greedy phase-allocation scheduling algorithm (previously handleRebalanceSchedule
// in App.tsx — made 1 gateway call per dept per location, running entirely in browser).
// Reads all needed data from D1 in one pass, then writes results in D1 batch.
// ─────────────────────────────────────────────────────────────────────────────
compute.post(
  '/rebalance',
  requirePolicy('system.settings', emptyContextBuilder()),
  async (c) => {
    const db = c.env.DB;

    const [deptsRes, locsRes, schedulesRes, tiersRes, tierTargetsRes, phasesRes] = await Promise.all([
      db.prepare('SELECT * FROM departments').all(),
      db.prepare("SELECT * FROM locations WHERE status != 'Archived' ORDER BY total_assets DESC").all(),
      db.prepare('SELECT * FROM audit_schedules').all(),
      db.prepare('SELECT * FROM kpi_tiers ORDER BY min_assets ASC').all(),
      db.prepare('SELECT * FROM kpi_tier_targets').all(),
      db.prepare('SELECT * FROM audit_phases ORDER BY start_date ASC').all(),
    ]);

    const depts = (deptsRes.results || []) as any[];
    const allLocs = (locsRes.results || []) as any[];
    const allAudits = (schedulesRes.results || []) as any[];
    const tiers = (tiersRes.results || []) as any[];
    const tierTargets = (tierTargetsRes.results || []) as any[];
    const phases = (phasesRes.results || []) as any[];

    const institutionTotalAssets = (() => {
      // Effective dept assets = MAX(dept.total_assets stored, SUM of its location assets)
      // Mirrors frontend departmentsWithAssets memo and the /kpi route.
      const locSumPerDept: Record<string, number> = {};
      for (const l of allLocs) locSumPerDept[l.department_id] = (locSumPerDept[l.department_id] || 0) + (l.total_assets || 0);
      return depts.reduce((s: number, d: any) => s + Math.max(d.total_assets || 0, locSumPerDept[d.id] || 0), 0) || 1;
    })();

    // Recompute effective assets per dept for use inside loop
    const locSumPerDept: Record<string, number> = {};
    for (const l of allLocs) locSumPerDept[l.department_id] = (locSumPerDept[l.department_id] || 0) + (l.total_assets || 0);

    const newAuditRows: any[] = [];
    const phaseUpdates: { id: string; phaseId: string }[] = [];

    for (const dept of depts) {
      const totalAssets = Math.max(dept.total_assets || 0, locSumPerDept[dept.id] || 0);
      if (totalAssets === 0) continue;

      const tier = resolveTier(totalAssets, institutionTotalAssets, tiers);
      if (!tier) continue;

      // Incremental per-phase allocation targets from cumulative KPI %
      const phaseTargets = phases
        .map((p: any, idx: number) => {
          const kt = tierTargets.find((k: any) => k.tier_id === tier.id && k.phase_id === p.id);
          const cumulativePct = kt?.target_percentage ?? 0;
          const prevPhase = phases[idx - 1];
          const prevKt = prevPhase ? tierTargets.find((k: any) => k.tier_id === tier.id && k.phase_id === prevPhase.id) : null;
          const prevCumulativePct = prevKt?.target_percentage ?? 0;
          const incrementalPct = Math.max(0, cumulativePct - prevCumulativePct);
          return {
            phaseId: p.id,
            incrementalPct,
            targetAssets: Math.ceil(totalAssets * incrementalPct / 100),
          };
        })
        .filter((pt: any) => pt.incrementalPct > 0);

      if (phaseTargets.length === 0) continue;

      const deptLocs = allLocs.filter((l: any) => l.department_id === dept.id);
      if (deptLocs.length === 0) continue;

      const sumLocAssets = deptLocs.reduce((s: number, l: any) => s + (l.total_assets || 0), 0);
      const fallbackWeight = sumLocAssets === 0 ? Math.ceil(totalAssets / deptLocs.length) : 0;
      const locWeight = (l: any) => Math.max(1, (l.total_assets || 0) || fallbackWeight);

      const deptAudits = allAudits.filter((a: any) => a.department_id === dept.id);
      const lockedLocIds = new Set(deptAudits.filter((a: any) => isLocked(a)).map((a: any) => a.location_id));
      const unlockedLocs = deptLocs.filter((l: any) => !lockedLocIds.has(l.id));

      // Greedy phase fill
      const phaseHeld: Record<string, number> = {};
      const phaseAssignments: Record<string, string[]> = {};
      for (const pt of phaseTargets) { phaseHeld[pt.phaseId] = 0; phaseAssignments[pt.phaseId] = []; }

      for (const loc of unlockedLocs) {
        let assigned = false;
        for (const pt of phaseTargets) {
          if (phaseHeld[pt.phaseId] < pt.targetAssets) {
            phaseAssignments[pt.phaseId].push(loc.id);
            phaseHeld[pt.phaseId] += locWeight(loc);
            assigned = true;
            break;
          }
        }
        if (!assigned) {
          const last = phaseTargets[phaseTargets.length - 1];
          phaseAssignments[last.phaseId].push(loc.id);
        }
      }

      for (const [phaseId, locIds] of Object.entries(phaseAssignments)) {
        for (const locId of locIds) {
          const loc = allLocs.find((l: any) => l.id === locId);
          const existing = deptAudits.find((a: any) => a.location_id === locId && !isLocked(a));
          if (existing) {
            if (existing.phase_id !== phaseId) phaseUpdates.push({ id: existing.id, phaseId });
          } else {
            newAuditRows.push({
              id: crypto.randomUUID(),
              department_id: dept.id,
              location_id: locId,
              supervisor_id: loc?.supervisor_id || null,
              phase_id: phaseId,
              status: 'Pending',
              auditor1_id: null,
              auditor2_id: null,
              date: null,
            });
          }
        }
      }
    }

    // Write all changes in D1 batches
    const statements: any[] = [];

    for (const r of newAuditRows) {
      statements.push(
        db.prepare(
          `INSERT INTO audit_schedules (id, department_id, location_id, supervisor_id, auditor1_id, auditor2_id, date, status, phase_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).bind(r.id, r.department_id, r.location_id, r.supervisor_id, r.auditor1_id, r.auditor2_id, r.date, r.status, r.phase_id),
      );
    }

    for (const u of phaseUpdates) {
      statements.push(
        db.prepare('UPDATE audit_schedules SET phase_id = ? WHERE id = ?').bind(u.phaseId, u.id),
      );
    }

    if (statements.length > 0) {
      // D1 batch limit is 100 statements — chunk if needed
      const CHUNK = 100;
      for (let i = 0; i < statements.length; i += CHUNK) {
        await db.batch(statements.slice(i, i + CHUNK));
      }
    }

    return c.json({
      createdCount: newAuditRows.length,
      updatedCount: phaseUpdates.length,
    });
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/compute/auto-tier-targets
// Given the global institution KPI targets (per phase), auto-calculates
// tier-specific per-phase % targets using the "Completion Phase" approach:
//   • Tier 1 (Small)  → must be 100% by Phase 1 (finishes earliest)
//   • Tier 2 (Medium) → must be 100% by Phase 2
//   • Tier 3 (Large)  → must be 100% by Phase 3 (gets breathing room)
// ALL tiers contribute a non-zero target in every phase they haven't
// completed yet; locked tiers stay at 100%. Weighted sum of tier targets
// matches the institution global target for each phase.
// Persists results to kpi_tier_targets and returns the computed matrix.
// ─────────────────────────────────────────────────────────────────────────────
compute.post(
  '/auto-tier-targets',
  requirePolicy('system.settings', emptyContextBuilder()),
  async (c) => {
    const db = c.env.DB;

    // 1. Fetch all required data (including location sums for effective asset calc)
    const [deptsRes, tiersRes, phasesRes, instKPIsRes, locSumsRes] = await Promise.all([
      db.prepare('SELECT id, total_assets, is_exempted FROM departments').all(),
      db.prepare('SELECT id, name, min_assets FROM kpi_tiers ORDER BY min_assets ASC').all(),
      db.prepare('SELECT id, name, start_date, end_date FROM audit_phases ORDER BY start_date ASC').all(),
      db.prepare('SELECT phase_id, target_percentage FROM institution_kpi_targets').all(),
      db.prepare('SELECT department_id, SUM(total_assets) AS loc_sum FROM locations WHERE status != \'Archived\' GROUP BY department_id').all(),
    ]);

    const depts = (deptsRes.results || []) as any[];
    const tiers = (tiersRes.results || []) as any[];
    const phases = (phasesRes.results || []) as any[];
    const instKPIs = (instKPIsRes.results || []) as any[];

    if (tiers.length === 0 || phases.length === 0) {
      return c.json({ error: 'Tiers and phases must be configured first' }, 400);
    }

    // Build location-sum lookup (mirrors frontend departmentsWithAssets memo)
    const locSumByDept: Record<string, number> = {};
    for (const ls of (locSumsRes.results || []) as any[]) {
      locSumByDept[ls.department_id] = ls.loc_sum || 0;
    }
    // Effective dept assets = MAX(stored dept.total_assets, SUM of location assets)
    const effectiveAssets = (d: any) =>
      Math.max(d.total_assets || 0, locSumByDept[d.id] || 0);

    const institutionTotal = depts.reduce((s: number, d: any) => s + effectiveAssets(d), 0);
    if (institutionTotal === 0) {
      return c.json({ error: 'No department asset data available' }, 400);
    }

    // 2. Compute how many assets live in each tier
    const tierAssets: Record<string, number> = {};
    for (const tier of tiers) tierAssets[tier.id] = 0;

    for (const dept of depts) {
      if (dept.is_exempted) continue;
      const assets = effectiveAssets(dept);
      if (assets === 0) continue;
      const assigned = resolveTier(assets, institutionTotal, tiers);
      if (assigned) tierAssets[assigned.id] += assets;
    }

    // 3. Compute tier weights (fraction of total institution assets)
    const tierWeights: Record<string, number> = {};
    for (const tier of tiers) {
      tierWeights[tier.id] = institutionTotal > 0 ? tierAssets[tier.id] / institutionTotal : 0;
    }

    // 4. Build the global target per phase (sorted chronologically)
    const globalTargets: Record<string, number> = {};
    for (const phase of phases) {
      const inst = instKPIs.find((k: any) => k.phase_id === phase.id);
      globalTargets[phase.id] = inst?.target_percentage ?? 0;
    }

    // 5. Fetch audit constraints for capacity estimation
    const constraintRow = await db.prepare(
      "SELECT value FROM system_settings WHERE id = 'audit_constraints'"
    ).first<{ value: string }>();
    const constraints = constraintRow ? JSON.parse(constraintRow.value) : {};
    const minAuditorsPerLocation = constraints.minAuditorsPerLocation ?? 2;
    const dailyInspectionCapacity = constraints.dailyInspectionCapacity ?? 150;

    // ──────────────────────────────────────────────────────────────────
    //  AUTO-CALCULATE TIER TARGETS — "Completion Phase" approach
    //
    //  Rule: Tier i (0=smallest) MUST reach 100% by Phase i.
    //  After a tier hits 100%, it stops contributing — the remaining
    //  (larger) tiers share the load for later phases.
    //
    //  For each phase pi:
    //    • "Locked" tiers (completionPhase <= pi) → target = 100%
    //    • "Flex" tiers (completionPhase > pi) → each gets the same %
    //      so that Σ(w_i × t_i) = globalTarget
    //
    //  Example (3 tiers, 3 phases, G = 30/65/100):
    //   Phase 1: Small=100%, Med+Large share rest → flexPct
    //   Phase 2: Small+Med=100%, Large covers rest
    //   Phase 3: All=100%
    //
    //  If numTiers ≠ numPhases, tiers are mapped proportionally
    //  to phases so that smaller tiers finish earlier.
    // ──────────────────────────────────────────────────────────────────
    const numTiers = tiers.length;
    const numPhases = phases.length;

    // Map each tier to its "completion phase" index
    // Tier 0 (smallest) completes at Phase 0 (earliest)
    // Tier N-1 (largest) completes at Phase N-1 (latest)
    const completionPhase: number[] = tiers.map((_: any, ti: number) => {
      if (numTiers === 1) return numPhases - 1;
      return Math.min(numPhases - 1, Math.round(ti * (numPhases - 1) / (numTiers - 1)));
    });

    const tierTargetMatrix: Record<string, Record<string, number>> = {};
    for (const tier of tiers) tierTargetMatrix[tier.id] = {};

    // 6. For each phase, compute tier targets
    //
    //  Two cases per flex tier (tiers that haven't completed yet):
    //
    //  Case A — locked tiers don't cover G yet (remaining > 0):
    //    All flex tiers share: flexPct = remaining / flexWeight
    //    This ensures Σ(w_i × t_i) = G exactly.
    //
    //  Case B — locked tiers alone already exceed G (remaining ≤ 0):
    //    This happens when small-tier departments collectively own more
    //    assets than the global target %. In this case we can't push
    //    their combined contribution below G, so we fall back to a
    //    "natural ramp" for flex tiers:
    //      naturalPct[ti] = 100 × (pi+1) / (completionPhase[ti]+1)
    //    This ensures every tier is always non-zero and reaches 100%
    //    exactly by its completion phase.
    for (let pi = 0; pi < numPhases; pi++) {
      const phase = phases[pi];
      const G = globalTargets[phase.id] || 0;

      if (G === 0) {
        for (const tier of tiers) tierTargetMatrix[tier.id][phase.id] = 0;
        continue;
      }

      // Split tiers into locked (done) vs flex (still in progress)
      let lockedContribution = 0;
      let flexWeight = 0;
      for (let ti = 0; ti < numTiers; ti++) {
        const w = tierWeights[tiers[ti].id] || 0;
        if (completionPhase[ti] <= pi) {
          lockedContribution += w * 100;
        } else {
          flexWeight += w;
        }
      }

      const remaining = G - lockedContribution;

      // Case A: normal — there is room for flex tiers to contribute
      // Case B: locked tiers already exceed G — use natural ramp instead
      const useNaturalRamp = remaining <= 0;
      const sharedFlexPct = (!useNaturalRamp && flexWeight > 0)
        ? Math.min(100, Math.max(1, Math.round(remaining / flexWeight)))
        : null;

      for (let ti = 0; ti < numTiers; ti++) {
        if (completionPhase[ti] <= pi) {
          // Tier has reached its completion phase — lock at 100%
          tierTargetMatrix[tiers[ti].id][phase.id] = 100;
        } else if (sharedFlexPct !== null) {
          // Case A: shared flex percentage
          tierTargetMatrix[tiers[ti].id][phase.id] = sharedFlexPct;
        } else {
          // Case B: natural linear ramp toward 100% by completion phase
          // e.g. Large (ci=2) in Phase 1 of 3: 100 × 1/3 = 33%
          const natural = Math.round(100 * (pi + 1) / (completionPhase[ti] + 1));
          tierTargetMatrix[tiers[ti].id][phase.id] = Math.min(99, Math.max(1, natural));
        }
      }
    }

    // 7. Enforce monotonically non-decreasing across phases per tier
    for (let ti = 0; ti < numTiers; ti++) {
      const tier = tiers[ti];
      let prev = 0;
      for (let pi = 0; pi < numPhases; pi++) {
        const phase = phases[pi];
        tierTargetMatrix[tier.id][phase.id] = Math.max(prev, tierTargetMatrix[tier.id][phase.id]);
        prev = tierTargetMatrix[tier.id][phase.id];
      }
    }

    // 9. Capacity estimation per phase (informational)
    //    working days ≈ phase duration in calendar days × 5/7
    //    capacity per phase = dailyCapacity × workingDays × numAuditorPairs
    //    where each location needs minAuditorsPerLocation auditors
    const capacityWarnings: string[] = [];
    for (let pi = 0; pi < numPhases; pi++) {
      const phase = phases[pi];
      const start = new Date(phase.start_date);
      const end = new Date(phase.end_date);
      const calendarDays = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / 86400000));
      const workingDays = Math.round(calendarDays * 5 / 7);

      // Assets to inspect this phase (incremental)
      const prevGlobal = pi > 0 ? (globalTargets[phases[pi - 1].id] || 0) : 0;
      const thisGlobal = globalTargets[phase.id] || 0;
      const incrementalPct = Math.max(0, thisGlobal - prevGlobal);
      const assetsThisPhase = Math.ceil(institutionTotal * incrementalPct / 100);

      // Capacity for one auditor pair
      const pairCapacity = dailyInspectionCapacity * workingDays;
      const pairsNeeded = pairCapacity > 0 ? Math.ceil(assetsThisPhase / pairCapacity) : 0;
      const auditorsNeeded = pairsNeeded * minAuditorsPerLocation;

      if (assetsThisPhase > 0) {
        capacityWarnings.push(
          `${phase.name}: ~${assetsThisPhase.toLocaleString()} assets over ${workingDays} working days → needs ~${pairsNeeded} teams (${auditorsNeeded} auditors @ ${minAuditorsPerLocation}/location, ${dailyInspectionCapacity} assets/day)`
        );
      }
    }

    // 9. Persist to kpi_tier_targets (upsert)
    const stmts: any[] = [];
    const resultMatrix: { tierId: string; tierName: string; phaseId: string; phaseName: string; targetPercentage: number }[] = [];

    for (const tier of tiers) {
      for (const phase of phases) {
        const pct = tierTargetMatrix[tier.id][phase.id] || 0;
        stmts.push(
          db.prepare(`
            INSERT INTO kpi_tier_targets (id, tier_id, phase_id, target_percentage)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(tier_id, phase_id) DO UPDATE SET target_percentage = excluded.target_percentage
          `).bind(crypto.randomUUID(), tier.id, phase.id, pct),
        );
        resultMatrix.push({
          tierId: tier.id,
          tierName: tier.name,
          phaseId: phase.id,
          phaseName: phase.name,
          targetPercentage: pct,
        });
      }
    }

    if (stmts.length > 0) {
      const CHUNK = 100;
      for (let i = 0; i < stmts.length; i += CHUNK) {
        await db.batch(stmts.slice(i, i + CHUNK));
      }
    }

    return c.json({
      tierTargets: resultMatrix,
      tierWeights: Object.fromEntries(tiers.map(t => [t.id, Math.round(tierWeights[t.id] * 1000) / 10])),
      globalTargets,
      capacityWarnings,
      constraints: { minAuditorsPerLocation, dailyInspectionCapacity },
      message: 'Tier targets auto-calculated and saved',
    });
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/compute/feasibility
// AI-Driven Strategic Check for KPI targets based on actual staff headcount.
// ─────────────────────────────────────────────────────────────────────────────
compute.post(
  '/feasibility',
  requirePolicy('system.settings', emptyContextBuilder()),
  async (c) => {
    const db = c.env.DB;
    const MODEL = '@cf/meta/llama-3.1-8b-instruct-fp8-fast';

    const [deptsRes, usersRes, phasesRes, instKPIsRes, settingRes, locCountsRes, schedulesRes] = await Promise.all([
      db.prepare('SELECT id, name, total_assets FROM departments WHERE is_exempted = 0').all(),
      db.prepare("SELECT id, department_id, certification_expiry FROM users WHERE status = 'Active'").all(),
      db.prepare('SELECT id, name, start_date, end_date FROM audit_phases ORDER BY start_date ASC').all(),
      db.prepare('SELECT phase_id, target_percentage FROM institution_kpi_targets').all(),
      db.prepare("SELECT value FROM system_settings WHERE id = 'audit_constraints'").first<{ value: string }>(),
      db.prepare("SELECT department_id, count(*) as count, SUM(total_assets) as assets FROM locations WHERE status != 'Archived' GROUP BY department_id").all(),
      db.prepare("SELECT phase_id, status, count(*) as count FROM audit_schedules GROUP BY phase_id, status").all()
    ]);
 
    const depts = (deptsRes.results || []) as any[];
    const users = (usersRes.results || []) as any[];
    const phases = (phasesRes.results || []) as any[];
    const instKPIs = (instKPIsRes.results || []) as any[];
    const locCounts = (locCountsRes.results || []) as any[];
    const schedules = (schedulesRes.results || []) as any[];
    const constraints = settingRes ? JSON.parse(settingRes.value) : {};

    const minAuditorsPerLocation = constraints.minAuditorsPerLocation || 2;
    const dailyInspectionCapacity = constraints.dailyInspectionCapacity || 1500; // Total assets one team can do/day

    const locationCountByDept: Record<string, number> = {};
    const locationAssetsByDept: Record<string, number> = {};
    for (const l of locCounts) {
      if (l.department_id) {
        locationCountByDept[l.department_id] = l.count;
        locationAssetsByDept[l.department_id] = l.assets || 0;
      }
    }
 
    const today = new Date().toISOString().split('T')[0];
    const auditorCountByDept: Record<string, number> = {};
    users.forEach(u => {
      if (u.certification_expiry && u.certification_expiry >= today) {
        auditorCountByDept[u.department_id] = (auditorCountByDept[u.department_id] || 0) + 1;
      }
    });

    const totalCertifiedAuditors = Object.values(auditorCountByDept).reduce((a, b) => a + b, 0);
    const effectivePairs = Math.floor(totalCertifiedAuditors / minAuditorsPerLocation);
    const workforceDailyCapacity = effectivePairs * dailyInspectionCapacity;

    const institutionTotalAssets = depts.reduce((sum, d) => sum + (d.total_assets || 0), 0);

    const historicalProgress = phases.map(p => {
      const completed = schedules.find(s => isInPhase(s, p) && s.status === 'Completed')?.count || 0;
      const total = schedules.filter(s => isInPhase(s, p)).reduce((sum, s) => sum + (s.count || 0), 0);
      return { name: p.name, completed, total };
    });
    
    const phaseMetrics = phases.map(p => {
      const targetPct = instKPIs.find(k => k.phase_id === p.id)?.target_percentage || 0;
      const targetAssets = Math.ceil(institutionTotalAssets * targetPct / 100);
      const start = new Date(p.start_date);
      const end = new Date(p.end_date);
      const workDays = Math.round(Math.max(1, (end.getTime() - start.getTime()) / 86400000) * 5 / 7);
      
      const dailyRateRequired = workDays > 0 ? Math.ceil(targetAssets / workDays) : targetAssets;
      const utilization = workforceDailyCapacity > 0 ? (dailyRateRequired / workforceDailyCapacity) * 100 : 0;
      
      return { 
        name: p.name, 
        targetPct, 
        targetAssets, 
        workDays, 
        dailyRateRequired, 
        utilization: Math.round(utilization) 
      };
    });

    const activeUnits = depts.filter(d => (d.total_assets || 0) > 0 || (auditorCountByDept[d.id] || 0) > 0);

    // --- MATHEMATICAL PRE-CALCULATION ---
    const activeUnitStats = activeUnits.map(d => {
      const effectiveAssets = Math.max(d.total_assets || 0, locationAssetsByDept[d.id] || 0);
      const auditors = auditorCountByDept[d.id] || 0;
      return {
        name: d.name,
        assets: effectiveAssets,
        locations: locationCountByDept[d.id] || 0,
        auditors: auditors,
        capacityRatio: auditors > 0 ? Math.round(effectiveAssets / auditors) : effectiveAssets
      };
    }).sort((a,b) => b.assets - a.assets);

    const aiPrompt = `Analyze the Strategic Feasibility of this audit plan using the provided Resource Utilization metrics.

Calculated Resource Constraints:
- Certified Staff Headcount: ${totalCertifiedAuditors}
- Effective Teams (at ${minAuditorsPerLocation} per location): ${effectivePairs}
- Institution Daily Inspection Capacity: ${workforceDailyCapacity} assets/day
- Global Average Load Index: ${Math.round(institutionTotalAssets / (totalCertifiedAuditors || 1))} assets/auditor

Phase-Specific Pressure:
${phaseMetrics.map(pm => `- ${pm.name}: Target ${pm.targetPct}% (${pm.targetAssets} assets) over ${pm.workDays} days. Required rate: ${pm.dailyRateRequired} assets/day. Utilization: ${pm.utilization}%`).join('\n')}

Institutional Progress (Historical/Current):
${historicalProgress.map(hp => `- ${hp.name}: ${hp.completed}/${hp.total} audits completed`).join('\n')}

High-Impact Units (Top 15):
${activeUnitStats.slice(0, 15).map(u => `- ${u.name}: ${u.assets} assets, ${u.auditors} auds (Load Index: ${u.capacityRatio})`).join('\n')}

CRITICAL: Return ONLY a raw JSON object. Use the Utilization metrics to determine the Feasibility Score. If a phase has >100% utilization, the risk level MUST be "High" or "Critical".
{
  "score": number,
  "riskLevel": "Low"|"Medium"|"High"|"Critical",
  "bottlenecks": string[],
  "recommendations": string[],
  "projections": { ${phases.map(p => `"${p.name}": "percentage_string"`).join(', ')} }
}
`;

    let result: any = null;
    try {
      result = await c.env.AI.run(MODEL, {
        messages: [
          { role: 'system', content: 'You are a Deterministic Audit Strategy AI. You analyze resource gaps using calculated utilization rates. Respond with valid JSON only. Set temperature to 0 for consistency.' },
          { role: 'user', content: aiPrompt }
        ],
        max_tokens: 4096,
        temperature: 0
      });

      // Robust extraction: Handle if result is { response: string }, { result: string }, or raw string
      let rawResponse = '';
      if (typeof result === 'string') {
        rawResponse = result;
      } else if (result && typeof result === 'object') {
        const obj = result as any;
        if (typeof obj.response === 'string') {
          rawResponse = obj.response;
        } else if (typeof obj.result === 'string') {
          rawResponse = obj.result;
        } else {
          rawResponse = JSON.stringify(result);
        }
      }

      // Ensure we have a string before trimming
      rawResponse = (rawResponse || '').toString();

      // 1. Strip markdown fences if present
      rawResponse = rawResponse.trim().replace(/^```json\n?|\n?```$/g, '').trim();

      // 2. Regex to find the widest possible JSON block {...}
      let jsonMatch = rawResponse.match(/\{[\s\S]*\}/);
      
      let parsed: any = null;
      try {
        // Case 1: The response is already the object we want
        if (typeof result === 'object' && result.score !== undefined) {
          parsed = result;
        } 
        // Case 2: The response is a string that is perfect JSON (or contains one)
        else if (jsonMatch) {
          const extracted = jsonMatch[0];
          parsed = JSON.parse(extracted);
          
          // Re-check for nested 'response' inside the parsed string 
          // (Handles the {"response": "{\"score\":...}"} case)
          if (parsed.response && typeof parsed.response === 'string' && parsed.response.includes('{')) {
            const nestedMatch = parsed.response.match(/\{[\s\S]*\}/);
            if (nestedMatch) {
              const nestedParsed = JSON.parse(nestedMatch[0]);
              // If the nested object looks like our schema, use it
              if (nestedParsed.score !== undefined) parsed = nestedParsed;
            }
          }
        }
      } catch (e) {
        console.error('Initial parse failed, falling back to regex match');
      }

      if (!parsed && jsonMatch) {
        try {
          parsed = JSON.parse(jsonMatch[0]);
        } catch (e) {
          throw new Error('AI response did not contain a valid JSON block.');
        }
      }

      if (!parsed || typeof parsed !== 'object') {
        throw new Error('AI response did not contain a valid JSON block.');
      }
      
      // Normalize score to 0-100 range if it comes back as 0-1
      if (typeof parsed.score === 'number' && parsed.score <= 1 && parsed.score > 0) {
        parsed.score = Math.round(parsed.score * 100);
      } else if (typeof parsed.score === 'number') {
        parsed.score = Math.round(parsed.score);
      }

      return c.json(parsed);
    } catch (err: any) {
      console.error('AI Feasibility failed:', err);
      return c.json({ 
        score: 0, 
        riskLevel: 'System Error', 
        bottlenecks: [`Analysis failed: ${err.message}`], 
        recommendations: ['Check Cloudflare AI quota/binding', 'Ensure all departments have asset data'], 
        projections: {},
        rawText: typeof result === 'string' ? result : JSON.stringify(result)
      });
    }
  }
);

export const computeRoutes = compute;
