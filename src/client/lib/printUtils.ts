import { User, Department } from '@shared/types';
/**
 * Print Utilities — window.print() popup approach
 * Zero Worker CPU, zero free-tier requests consumed.
 */

const PRINT_CSS = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, sans-serif; font-size: 10pt; color: #111; background: white; }
  h1 { font-size: 16pt; font-weight: 900; margin-bottom: 2pt; letter-spacing: -0.5pt; }
  h2 { font-size: 13pt; font-weight: 800; margin: 12pt 0 6pt; letter-spacing: -0.3pt; }
  h3 { font-size: 11pt; font-weight: 700; margin: 10pt 0 4pt; }
  p { font-size: 9pt; color: #555; margin-bottom: 2pt; }
  .header { border-bottom: 2pt solid #111; padding-bottom: 8pt; margin-bottom: 14pt; }
  .subtitle { font-size: 9pt; color: #666; margin-top: 2pt; }
  .meta { font-size: 8pt; color: #888; margin-top: 4pt; }
  table { width: 100%; border-collapse: collapse; margin-top: 6pt; font-size: 9pt; }
  thead th { background: #f0f0f0; border: 1pt solid #ccc; padding: 5pt 8pt; font-weight: 800; font-size: 8pt; text-transform: uppercase; letter-spacing: 0.5pt; text-align: left; }
  thead th.center { text-align: center; }
  thead th.right { text-align: right; }
  tbody td { border: 1pt solid #ddd; padding: 5pt 8pt; vertical-align: top; }
  tbody td.center { text-align: center; }
  tbody td.right { text-align: right; }
  tbody tr:nth-child(even) { background: #fafafa; }
  .badge { display: inline-block; padding: 1pt 5pt; border-radius: 4pt; font-size: 7.5pt; font-weight: 700; border: 1pt solid; }
  .badge-green { background: #ecfdf5; color: #065f46; border-color: #6ee7b7; }
  .badge-amber { background: #fffbeb; color: #92400e; border-color: #fcd34d; }
  .badge-slate { background: #f8fafc; color: #475569; border-color: #cbd5e1; }
  .badge-blue { background: #eff6ff; color: #1e40af; border-color: #93c5fd; }
  .pill { display: inline-block; padding: 1pt 4pt; border-radius: 3pt; font-size: 7pt; font-weight: 700; background: #e2e8f0; color: #334155; margin: 0.5pt; }
  .stat-row { display: flex; gap: 16pt; margin-bottom: 12pt; }
  .stat-box { flex: 1; border: 1pt solid #e2e8f0; border-radius: 6pt; padding: 8pt 10pt; }
  .stat-label { font-size: 7.5pt; font-weight: 700; text-transform: uppercase; color: #94a3b8; letter-spacing: 0.5pt; }
  .stat-value { font-size: 18pt; font-weight: 900; margin-top: 2pt; color: #0f172a; }
  .stat-sub { font-size: 8pt; color: #64748b; margin-top: 1pt; }
  .section { margin-top: 16pt; }
  .page-break { page-break-before: always; }
  .no-break { page-break-inside: avoid; }
  .progress-bar-bg { background: #e2e8f0; border-radius: 3pt; height: 7pt; width: 100%; position: relative; }
  .progress-bar-fill { height: 7pt; border-radius: 3pt; }
  .bg-green { background: #10b981; }
  .bg-amber { background: #f59e0b; }
  .text-green { color: #059669; }
  .text-amber { color: #d97706; }
  .text-red { color: #dc2626; }
  .subrow { background: #f8fafc !important; }
  .subrow td { font-size: 8.5pt; color: #475569; padding-left: 20pt !important; }
  .divider { border: none; border-top: 1pt solid #e2e8f0; margin: 10pt 0; }
  .phase-cell { display: inline-flex; flex-direction: column; align-items: center; justify-content: center; width: 42pt; min-height: 32pt; border-radius: 6pt; border: 1pt solid; padding: 2pt; margin: 1pt; }
  .phase-done { background: #10b981; border-color: #10b981; color: white; }
  .phase-sched { background: #eff6ff; border-color: #bfdbfe; color: #2563eb; }
  .phase-req { background: #fff1f2; border-color: #fecdd3; color: #e11d48; border-style: dashed; }
  .phase-pct { font-size: 8pt; font-weight: 900; }
  .phase-assets { font-size: 6.5pt; opacity: 0.8; font-weight: 600; }
  .status-ready { color: #059669; font-weight: 800; text-transform: uppercase; font-size: 7.5pt; display: flex; align-items: center; gap: 3pt; justify-content: flex-end; }
  .status-incomplete { color: #d97706; font-weight: 800; text-transform: uppercase; font-size: 7.5pt; display: flex; align-items: center; gap: 3pt; justify-content: flex-end; }
  .status-none { color: #94a3b8; font-weight: 800; text-transform: uppercase; font-size: 7.5pt; display: flex; align-items: center; gap: 3pt; justify-content: flex-end; }
  @media print { body { padding: 0; } .no-print { display: none; } }
  @page { margin: 1.5cm; size: A4; }
  @page :right { @bottom-right { content: "Page " counter(page) " of " counter(pages); font-size: 8pt; color: #888; } }
`;

const PRINT_CSS_LANDSCAPE = `
  ${PRINT_CSS}
  @page { margin: 1.2cm; size: A4 landscape; }
`;

/** Format YYYY-MM-DD → DD/MM/YYYY (Malaysia standard) */
function fmtDate(d: string | null | undefined): string {
  if (!d) return '';
  const [y, m, day] = d.split('-');
  return `${day}/${m}/${y}`;
}

function openPrint(title: string, bodyHtml: string, landscape = false): void {
  const w = window.open('', '_blank', 'width=900,height=700');
  if (!w) { alert('Please allow pop-ups to print reports.'); return; }
  const printedAt = new Date().toLocaleString('en-GB', { dateStyle: 'long', timeStyle: 'short' });
  w.document.write(`<!DOCTYPE html>
<html><head>
<meta charset="utf-8">
<title>${title}</title>
<style>${landscape ? PRINT_CSS_LANDSCAPE : PRINT_CSS}</style>
</head><body>
${bodyHtml}
<p class="meta" style="margin-top:18pt;border-top:1pt solid #e2e8f0;padding-top:6pt;">Printed: ${printedAt}</p>
<script>window.onload=()=>{window.print();}<\/script>
</body></html>`);
  w.document.close();
}

function fmt(n: number): string {
  return n.toLocaleString('en-MY');
}

function pct(n: number): string {
  return `${n}%`;
}

// ─── REPORT 1: Inspection Completion KPI Target ──────────────────────────────

interface GlobalStats {
  totalInstitutionAssets: number;
  inspectedAssets: number;
  targetAssets: number;
  actualPercentage: number;
  targetPercentage: number;
  isOnTrack: boolean;
}

interface DeptDetail {
  id: string;
  name: string;
  assets: number;
  inspectedAssets: number;
  percentage: number;
  status: string;
}

interface TierStat {
  id: string;
  name: string;
  minAssets: number;
  isHighestTier: boolean;
  nextMin: number;
  deptCount: number;
  actualPercentage: number;
  targetPercentage: number;
  status: string;
  departments: DeptDetail[];
}

interface ActivePhase {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
}

export function printKPICompletionTarget(
  globalStats: GlobalStats | null,
  tierStats: TierStat[],
  activePhase: ActivePhase | null,
): void {
  if (!globalStats) { alert('No active phase data to print.'); return; }

  const statusBadge = (s: string) =>
    s === 'On Track'
      ? `<span class="badge badge-green">${s}</span>`
      : `<span class="badge badge-amber">${s}</span>`;

  const phaseLabel = activePhase
    ? `${activePhase.name} (${fmtDate(activePhase.startDate)} – ${fmtDate(activePhase.endDate)})`
    : 'All Phases';

  const tierRows = tierStats.map(tier => {
    const deptRows = tier.departments.map(d =>
      `<tr class="subrow">
        <td>${d.name}</td>
        <td class="center">${fmt(d.assets)}</td>
        <td class="center">${fmt(d.inspectedAssets)}</td>
        <td class="center">${pct(d.percentage)}</td>
        <td class="center">${pct(tier.targetPercentage)}</td>
        <td class="center">${statusBadge(d.status)}</td>
      </tr>`
    ).join('');

    return `<tr class="no-break" style="background:#eff6ff;">
      <td><strong>${tier.name}</strong>&nbsp;<span style="font-size:8pt;color:#64748b;">(${tier.minAssets}%–${tier.isHighestTier ? '100' : tier.nextMin - 1}% threshold)</span></td>
      <td class="center" colspan="2"><strong>${tier.deptCount} depts</strong></td>
      <td class="center"><strong>${pct(tier.actualPercentage)}</strong></td>
      <td class="center">${pct(tier.targetPercentage)}</td>
      <td class="center">${statusBadge(tier.status)}</td>
    </tr>${deptRows}`;
  }).join('');

  const html = `
<div class="header">
  <h1>Inspection Completion KPI Target</h1>
  <p class="subtitle">Active Phase: ${phaseLabel}</p>
</div>

<div class="stat-row">
  <div class="stat-box">
    <div class="stat-label">Overall Completion</div>
    <div class="stat-value ${globalStats.isOnTrack ? 'text-green' : 'text-amber'}">${pct(globalStats.actualPercentage)}</div>
    <div class="stat-sub">${fmt(globalStats.inspectedAssets)} assets inspected</div>
  </div>
  <div class="stat-box">
    <div class="stat-label">Phase Target</div>
    <div class="stat-value">${pct(globalStats.targetPercentage)}</div>
    <div class="stat-sub">${fmt(globalStats.targetAssets)} target assets</div>
  </div>
  <div class="stat-box">
    <div class="stat-label">Total Institution Assets</div>
    <div class="stat-value">${fmt(globalStats.totalInstitutionAssets)}</div>
    <div class="stat-sub">&nbsp;</div>
  </div>
  <div class="stat-box">
    <div class="stat-label">Status</div>
    <div class="stat-value" style="font-size:13pt;">${statusBadge(globalStats.isOnTrack ? 'On Track' : 'At Risk')}</div>
    <div class="stat-sub">&nbsp;</div>
  </div>
</div>

<div class="section">
  <h2>KPI Tier Breakdown</h2>
  <table>
    <thead>
      <tr>
        <th>Tier / Department</th>
        <th class="center">Total Assets</th>
        <th class="center">Inspected Assets</th>
        <th class="center">Actual %</th>
        <th class="center">Target %</th>
        <th class="center">Status</th>
      </tr>
    </thead>
    <tbody>
      ${tierRows || '<tr><td colspan="6" style="text-align:center;color:#888;">No tier data available.</td></tr>'}
    </tbody>
  </table>
</div>`;

  openPrint('Inspection Completion KPI Target', html);
}

// ─── REPORT 2: KPI Phase Inspection Plan ─────────────────────────────────────

interface Phase {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
}

interface PhaseStatus {
  phaseId: string;
  hasAudit: boolean;
  isRequired: boolean;
  isCompleted: boolean;
  targetPct: number;
  targetAssets: number;
}

interface TableRow {
  id: string;
  name: string;
  abbr?: string;
  totalAssets?: number;
  auditorCount?: number;
  tierName: string;
  phaseStatus: PhaseStatus[];
  isFullyScheduled: boolean;
  hasNoAssets: boolean;
}

export function printKPIPhasePlan(
  tableData: any[],
  sortedPhases: Phase[],
  openAuditThreshold: number = 500
): void {
  const phaseHeaders = sortedPhases.map(p =>
    `<th class="center">${p.name}<br><span style="font-weight:400;font-size:7pt;color:#64748b;text-transform:none;">${fmtDate(p.startDate)}</span></th>`
  ).join('');

  const bodyRows = tableData.map(row => {
    const phaseCells = row.phaseStatus.map(ps => {
      if (!ps.isRequired) return `<td class="center"><div style="width:20pt;height:20pt;background:#f1f5f9;border-radius:4pt;margin:auto;opacity:0.3;"></div></td>`;
      
      let cellType = 'phase-req';
      let icon = '⊡'; // Box icon
      if (ps.isCompleted) {
        cellType = 'phase-done';
        icon = '✓';
      } else if (ps.hasAudit) {
        cellType = 'phase-sched';
        icon = '☷'; // Layers icon
      }

      return `<td class="center">
        <div class="phase-cell ${cellType}">
          <span style="font-size:7pt;">${icon}</span>
          <div class="phase-pct">${ps.targetPct}%</div>
          <div class="phase-assets">${fmt(ps.targetAssets)} aset</div>
        </div>
      </td>`;
    }).join('');

    const assets = row.totalAssets || 0;
    const recommended = row.auditorsRequiredOverride ?? (() => {
      if (assets === 0) return 0;
      const raw = Math.ceil(assets / openAuditThreshold);
      return Math.max(2, raw * 2);
    })();

    const status = row.hasNoAssets
      ? `<div class="status-none">○ Not Required</div>`
      : row.isFullyScheduled
      ? `<div class="status-ready">● Ready</div>`
      : `<div class="status-incomplete">● Incomplete</div>`;

    return `<tr style="vertical-align: middle;">
      <td style="padding: 10pt 8pt;">
        <div style="font-weight:800;font-size:10pt;">${row.name}</div>
        <div style="font-size:8pt;color:#94a3b8;font-weight:600;">${row.abbr || ''}</div>
      </td>
      <td class="center" style="font-weight:700;">${row.auditorCount || 0}</td>
      <td class="center" style="font-weight:900;color:#4f46e5;">${recommended}</td>
      <td>
        <div style="font-weight:700;">${fmt(row.totalAssets || 0)}</div>
        <div style="font-size:7pt;color:#2563eb;font-weight:900;text-transform:uppercase;background:#eff6ff;padding:1pt 4pt;border-radius:3pt;display:inline-block;margin-top:2pt;">${row.tierName}</div>
      </td>
      ${phaseCells}
      <td class="right">${status}</td>
    </tr>`;
  }).join('');

  const html = `
<div class="header">
  <div style="display:flex;justify-content:space-between;align-items:flex-start;">
    <div>
      <h1>KPI Phase Inspection Plan</h1>
      <p class="subtitle">Required inspection phases per department based on their KPI tier assignment.</p>
    </div>
    <div style="text-align:right;">
      <div style="font-size:12pt;font-weight:900;color:#2563eb;">Inspect-able</div>
      <div style="font-size:8pt;color:#94a3b8;margin-top:2pt;">Asset Inspection Scheduling &amp; Management System</div>
    </div>
  </div>
</div>

<div class="stat-row" style="margin-bottom:8pt;">
  <div class="flex items-center gap-4" style="display:flex;gap:12pt;margin-bottom:10pt;">
     <div style="display:flex;align-items:center;gap:4pt;">
        <div style="width:7pt;height:7pt;border-radius:50%;background:#10b981;"></div>
        <span style="font-size:8pt;font-weight:700;color:#64748b;text-transform:uppercase;">Inspection Scheduled</span>
     </div>
     <div style="display:flex;align-items:center;gap:4pt;">
        <div style="width:7pt;height:7pt;border-radius:50%;background:#f1f5f9;border:1pt solid #cbd5e1;"></div>
        <span style="font-size:8pt;font-weight:700;color:#64748b;text-transform:uppercase;">Not Required</span>
     </div>
  </div>
</div>

<table>
  <thead>
    <tr>
      <th>Department</th>
      <th class="center" style="width:70pt;">Certified Officers</th>
      <th class="center" style="width:70pt;">Required Inspectors</th>
      <th style="width:80pt;">Assets / Tier</th>
      ${phaseHeaders}
      <th class="right" style="width:80pt;">Status</th>
    </tr>
  </thead>
  <tbody>
    ${bodyRows || '<tr><td colspan="10" style="text-align:center;color:#888;">No data available.</td></tr>'}
  </tbody>
</table>

<div class="footer" style="margin-top:18pt;text-align:center;font-size:8pt;color:#94a3b8;border-top:1pt solid #e2e8f0;padding-top:8pt;">
  Inspect-able &copy; ${new Date().getFullYear()} &nbsp;|&nbsp; Internal Regulatory Document &nbsp;|&nbsp; Page 1 of 1
</div>`;

  openPrint('KPI Phase Inspection Plan', html, true);
}

// ─── REPORT 3: Unit Consolidation ────────────────────────────────────────────

interface GroupedDept {
  id: string;
  name: string;
  abbr?: string;
  totalAssets?: number;
  auditorCount?: number;
}

interface AuditGroupData {
  id: string;
  name: string;
  color?: string;
  departments: GroupedDept[];
  subTotal: number;
  subAuditors: number;
}

interface GroupedData {
  groups: AuditGroupData[];
  unassignedDepts: GroupedDept[];
}

export function printUnitConsolidation(
  groupedData: GroupedData,
  overallTotal: number,
): void {
  const overallAuditors = groupedData.groups.reduce((s, g) => s + g.subAuditors, 0)
    + groupedData.unassignedDepts.reduce((s, d) => s + (d.auditorCount || 0), 0);

  const groupRows = groupedData.groups.map(group => {
    const deptRows = group.departments.map(d =>
      `<tr class="subrow">
        <td style="padding-left:20pt;">${d.name}</td>
        <td>${d.abbr || ''}</td>
        <td class="right">${fmt(d.totalAssets || 0)}</td>
        <td class="right">${d.auditorCount || 0}</td>
      </tr>`
    ).join('');
    return `
      <tr style="background:#eff6ff;" class="no-break">
        <td colspan="2"><strong>${group.name}</strong></td>
        <td class="right"><strong>${fmt(group.subTotal)}</strong></td>
        <td class="right"><strong>${group.subAuditors}</strong></td>
      </tr>
      ${deptRows}`;
  }).join('');

  const unassignedRows = groupedData.unassignedDepts.length > 0
    ? `<tr style="background:#fef9c3;" class="no-break">
        <td colspan="2"><strong>Unassigned (Standalone Units)</strong></td>
        <td class="right"><strong>${fmt(groupedData.unassignedDepts.reduce((s, d) => s + (d.totalAssets || 0), 0))}</strong></td>
        <td class="right"><strong>${groupedData.unassignedDepts.reduce((s, d) => s + (d.auditorCount || 0), 0)}</strong></td>
      </tr>` +
      groupedData.unassignedDepts.map(d =>
        `<tr class="subrow">
          <td style="padding-left:20pt;">${d.name}</td>
          <td>${d.abbr || ''}</td>
          <td class="right">${fmt(d.totalAssets || 0)}</td>
          <td class="right">${d.auditorCount || 0}</td>
        </tr>`
      ).join('')
    : '';

  const html = `
<div class="header">
  <h1>Unit Consolidation</h1>
  <p class="subtitle">Institutional grouping of departments for the cross-audit programme.</p>
</div>

<div class="stat-row">
  <div class="stat-box">
    <div class="stat-label">Total Groups</div>
    <div class="stat-value">${groupedData.groups.length}</div>
  </div>
  <div class="stat-box">
    <div class="stat-label">Standalone Units</div>
    <div class="stat-value">${groupedData.unassignedDepts.length}</div>
  </div>
  <div class="stat-box">
    <div class="stat-label">Institution Total Assets</div>
    <div class="stat-value">${fmt(overallTotal)}</div>
  </div>
  <div class="stat-box">
    <div class="stat-label">Total Certified Officers</div>
    <div class="stat-value">${overallAuditors}</div>
  </div>
</div>

<table>
  <thead>
    <tr>
      <th>Group / Department</th>
      <th>Abbr.</th>
      <th class="right">Assets</th>
      <th class="right">Certified Officers</th>
    </tr>
  </thead>
  <tbody>
    ${groupRows}
    ${unassignedRows}
    <tr style="border-top:2pt solid #111;">
      <td colspan="2"><strong>Grand Total</strong></td>
      <td class="right"><strong>${fmt(overallTotal)}</strong></td>
      <td class="right"><strong>${overallAuditors}</strong></td>
    </tr>
  </tbody>
</table>`;

  openPrint('Unit Consolidation', html);
}

// ─── REPORT 4: Cross-Audit Active Assignment ──────────────────────────────────

interface Entity {
  id?: string;
  name: string;
  assets: number;
  auditors: number;
  isConsolidated?: boolean;
  isJoint?: boolean;
  members?: { id: string; abbr?: string; name?: string }[];
}

interface EntityPermission {
  auditorEntityId: string;
  targetEntityId: string;
  isMutual: boolean;
  rawPermIds?: string[];
}

export function printCrossAuditAssignments(
  entityPermissions: EntityPermission[],
  entities: Entity[],
): void {
  if (entityPermissions.length === 0) {
    alert('No active cross-audit pairings to print.');
    return;
  }

  const getEntity = (id: string) => entities.find(e => e.id === id);

  const mutualCount = entityPermissions.filter(ep => ep.isMutual).length;
  const oneWayCount = entityPermissions.length - mutualCount;

  // Build entity cell HTML — assets inline under member pills
  // assetLabel: null = hide, 'inspect' = "X assets to inspect" (prominent), 'capacity' = "own: X assets" (muted)
  function entityCell(entity: Entity | undefined, id: string, assetLabel: 'inspect' | 'capacity' | null): string {
    if (!entity) return `<em style="color:#94a3b8;">${id}</em>`;
    const members = entity.members?.map(m => m.abbr || m.name || '').filter(Boolean) || [];
    const isGroup = members.length > 1 || entity.isConsolidated;
    const groupBadge = isGroup
      ? `<span style="font-size:7pt;color:#6366f1;font-weight:700;letter-spacing:0.5pt;"> GROUP</span>`
      : '';
    const memberPills = members.map(m => `<span class="pill">${m}</span>`).join(' ');
    let assetLine = '';
    if (assetLabel === 'inspect' && entity.assets > 0) {
      assetLine = `<div style="margin-top:4pt;font-size:7.5pt;color:#0f172a;font-weight:800;">
           <span style="color:#6366f1;">&#9654;</span>&nbsp;${fmt(entity.assets)} assets to inspect
         </div>`;
    } else if (assetLabel === 'capacity' && entity.assets > 0) {
      // Muted — shows own asset count for workload context on the inspecting side
      assetLine = `<div style="margin-top:4pt;font-size:7pt;color:#94a3b8;font-weight:600;">
           own: ${fmt(entity.assets)} assets
         </div>`;
    }
    return `<strong>${entity.name}</strong>${groupBadge}
      <div style="margin-top:3pt;">${memberPills}</div>
      ${assetLine}`;
  }

  const bodyRows = entityPermissions.map((ep, i) => {
    const auditor = getEntity(ep.auditorEntityId);
    const target = getEntity(ep.targetEntityId);

    if (ep.isMutual) {
      // Mutual: A inspects B's assets, B inspects A's assets — each entity's own assets
      // are exactly what the other party will come to inspect
      return `<tr class="no-break">
        <td style="vertical-align:top;color:#94a3b8;font-weight:700;">${i + 1}</td>
        <td style="vertical-align:top;">${entityCell(auditor, ep.auditorEntityId, 'inspect')}</td>
        <td class="center" style="vertical-align:middle;">
          <div style="font-size:11pt;font-weight:900;color:#6366f1;">&#x21C4;</div>
          <div style="font-size:7pt;font-weight:800;color:#6366f1;letter-spacing:0.5pt;margin-top:2pt;">MUTUAL</div>
        </td>
        <td style="vertical-align:top;">${entityCell(target, ep.targetEntityId, 'inspect')}</td>
      </tr>`;
    } else {
      // One-way A → B: inspecting entity shows own capacity (muted), target shows assets to inspect (bold)
      return `<tr class="no-break">
        <td style="vertical-align:top;color:#94a3b8;font-weight:700;">${i + 1}</td>
        <td style="vertical-align:top;">${entityCell(auditor, ep.auditorEntityId, 'capacity')}</td>
        <td class="center" style="vertical-align:middle;">
          <div style="font-size:14pt;font-weight:900;color:#334155;">&#x2192;</div>
        </td>
        <td style="vertical-align:top;">${entityCell(target, ep.targetEntityId, 'inspect')}</td>
      </tr>`;
    }
  }).join('');

  const html = `
<div class="header">
  <h1>Cross-Audit Active Assignment</h1>
  <p class="subtitle">Active inspection pairings. Asset counts shown under each entity indicate the volume each party is responsible for inspecting.</p>
</div>

<div class="stat-row">
  <div class="stat-box">
    <div class="stat-label">Total Pairings</div>
    <div class="stat-value">${entityPermissions.length}</div>
  </div>
  <div class="stat-box">
    <div class="stat-label">Mutual (&#x21C4;)</div>
    <div class="stat-value">${mutualCount}</div>
    <div class="stat-sub">Both parties inspect each other</div>
  </div>
  <div class="stat-box">
    <div class="stat-label">One-Way (&#x2192;)</div>
    <div class="stat-value">${oneWayCount}</div>
    <div class="stat-sub">Single direction only</div>
  </div>
  <div class="stat-box">
    <div class="stat-label">Entities Involved</div>
    <div class="stat-value">${new Set(entityPermissions.flatMap(ep => [ep.auditorEntityId, ep.targetEntityId])).size}</div>
  </div>
</div>

<table>
  <thead>
    <tr>
      <th style="width:22pt;">#</th>
      <th>Inspecting Entity</th>
      <th class="center" style="width:56pt;">Direction</th>
      <th>Target Entity</th>
    </tr>
  </thead>
  <tbody>
    ${bodyRows}
  </tbody>
</table>

<p style="margin-top:10pt;font-size:7.5pt;color:#94a3b8;">
  <strong style="color:#6366f1;">&#9654;</strong> Bold asset figure = assets the counterpart will come to inspect. &nbsp;|&nbsp;
  <em>own: X assets</em> = inspecting entity's own holdings (workload reference, shown in muted text for one-way pairings only). &nbsp;|&nbsp;
  For mutual pairings both parties carry symmetric inspection obligations.
</p>`;

  openPrint('Cross-Audit Active Assignment', html, true);
}

// ─── REPORT 5: Inspection Schedule by Department ──────────────────────────────

interface PrintSchedule {
  id: string;
  date?: string;
  locationId: string;
  departmentId: string;
  phaseId: string;
  status: string;
  supervisorId?: string;
  auditor1Id?: string;
  auditor2Id?: string;
}

interface PrintLocation {
  id: string;
  name: string;
  buildingId?: string | null;
  building?: string;
  level?: string;
  totalAssets?: number;
  contact?: string;
}

interface PrintDept {
  id: string;
  name: string;
  abbr?: string;
}

interface PrintUser {
  id: string;
  name: string;
  contactNumber?: string;
}

interface PrintPhase {
  id: string;
  name: string;
}

export function printInspectionSchedule(
  schedules: PrintSchedule[],
  allDepartments: PrintDept[],
  allLocations: PrintLocation[],
  users: PrintUser[],
  phases: PrintPhase[],
  selectedDept: string,
  buildings: any[] = []
): void {
  if (schedules.length === 0) {
    alert('No schedules to print for the current selection.');
    return;
  }

  const getDept = (id: string) => allDepartments.find(d => d.id === id);
  const getLoc = (id: string) => allLocations.find(l => l.id === id);
  const getUser = (id?: string) => id ? users.find(u => u.id === id) : null;
  const getPhaseName = (id: string) => phases.find(p => p.id === id)?.name || id;

  // Group schedules by department
  const byDept = new Map<string, PrintSchedule[]>();
  schedules.forEach(s => {
    const key = s.departmentId || 'unknown';
    if (!byDept.has(key)) byDept.set(key, []);
    byDept.get(key)!.push(s);
  });

  // Sort within each dept by date
  byDept.forEach(rows => rows.sort((a, b) => (a.date || '').localeCompare(b.date || '')));

  const statusBadge = (s: string) => {
    if (s === 'Completed') return `<span class="badge badge-green">${s}</span>`;
    if (s === 'In Progress') return `<span class="badge badge-blue">${s}</span>`;
    return `<span class="badge badge-slate">${s}</span>`;
  };

  const getBuildingDisplay = (buildingId?: string | null, buildingName?: string) => {
    if (buildingId) {
      const b = buildings.find(b => b.id === buildingId);
      if (b) return b.abbr;
    }
    return buildingName || '—';
  };

  const deptSections: string[] = [];
  let firstSection = true;

  byDept.forEach((rows, deptId) => {
    const dept = getDept(deptId);
    const deptName = dept ? `${dept.name}${dept.abbr ? ` (${dept.abbr})` : ''}` : deptId;

    const tableRows = rows.map(s => {
      const loc = getLoc(s.locationId);
      const sup = getUser(s.supervisorId);
      const a1 = getUser(s.auditor1Id);
      const a2 = getUser(s.auditor2Id);
      const officers = [a1?.name, a2?.name].filter(Boolean).join(', ') || '—';

      return `<tr>
        <td>${s.date ? fmtDate(s.date) : '<span style="color:#f59e0b;">Unset</span>'}</td>
        <td>${loc?.name || s.locationId}</td>
        <td>${getBuildingDisplay(loc?.buildingId, loc?.building)}</td>
        <td>${loc?.level || '—'}</td>
        <td class="right">${fmt(loc?.totalAssets || 0)}</td>
        <td>${getPhaseName(s.phaseId)}</td>
        <td>${sup?.name || '—'}</td>
        <td>${officers}</td>
        <td class="center">${statusBadge(s.status)}</td>
      </tr>`;
    }).join('');

    const completed = rows.filter(r => r.status === 'Completed').length;
    const inProgress = rows.filter(r => r.status === 'In Progress').length;
    const pending = rows.filter(r => r.status === 'Pending').length;

    deptSections.push(`
      ${!firstSection ? '<div class="page-break"></div>' : ''}
      <div class="no-break" style="margin-bottom:4pt;">
        <h2>${deptName}</h2>
        <p>${rows.length} inspection(s) &nbsp;|&nbsp;
          <span class="badge badge-green">Completed: ${completed}</span>&nbsp;
          <span class="badge badge-blue">In Progress: ${inProgress}</span>&nbsp;
          <span class="badge badge-slate">Pending: ${pending}</span>
        </p>
      </div>
      <table>
        <thead>
          <tr>
            <th style="width:65pt;">Date</th>
            <th>Asset Location</th>
            <th>Block</th>
            <th>Level</th>
            <th class="right" style="width:55pt;">Assets</th>
            <th style="width:65pt;">Phase</th>
            <th style="width:70pt;">Supervisor</th>
            <th>Certified Officers</th>
            <th class="center" style="width:70pt;">Status</th>
          </tr>
        </thead>
        <tbody>${tableRows}</tbody>
      </table>`);

    firstSection = false;
  });

  const filterLabel = selectedDept === 'All'
    ? 'All Departments'
    : allDepartments.find(d => d.name === selectedDept)?.name || selectedDept;

  const html = `
<div class="header">
  <h1>Inspection Schedule by Department</h1>
  <p class="subtitle">Filter: ${filterLabel} &nbsp;|&nbsp; ${schedules.length} total inspection(s)</p>
</div>
${deptSections.join('\n')}`;

  openPrint(`Inspection Schedule — ${filterLabel}`, html);
}

// ─── EXPORT: Inspection Schedule to Excel (one sheet per department) ──────────

import * as XLSX from 'xlsx';

export function exportInspectionSchedule(
  schedules: PrintSchedule[],
  allDepartments: PrintDept[],
  allLocations: PrintLocation[],
  users: PrintUser[],
  phases: PrintPhase[],
  selectedDept: string,
  buildings: any[] = []
): void {
  if (schedules.length === 0) {
    alert('No schedules to export for the current selection.');
    return;
  }

  const getDept = (id: string) => allDepartments.find(d => d.id === id);
  const getLoc = (id: string) => allLocations.find(l => l.id === id);
  const getUser = (id?: string) => id ? users.find(u => u.id === id) : null;
  const getPhaseName = (id: string) => phases.find(p => p.id === id)?.name || id;

  // Group schedules by department
  const byDept = new Map<string, PrintSchedule[]>();
  schedules.forEach(s => {
    const key = s.departmentId || 'unknown';
    if (!byDept.has(key)) byDept.set(key, []);
    byDept.get(key)!.push(s);
  });

  // Sort within each dept by date
  byDept.forEach(rows => rows.sort((a, b) => (a.date || '').localeCompare(b.date || '')));

  const wb = XLSX.utils.book_new();

  byDept.forEach((rows, deptId) => {
    const dept = getDept(deptId);
    const sheetName = (dept?.abbr || dept?.name || deptId).substring(0, 31); // Excel sheet name limit

    const headerRow = ['Date', 'Asset Location', 'Block', 'Level', 'Assets', 'Phase', 'Supervisor', 'Inspecting Officers', 'Status'];

    const dataRows = rows.map(s => {
      const loc = getLoc(s.locationId);
      const sup = getUser(s.supervisorId);
      const a1 = getUser(s.auditor1Id);
      const a2 = getUser(s.auditor2Id);
      const officers = [a1?.name, a2?.name].filter(Boolean).join(', ') || '';
      
      const getBuildingDisplay = (buildingId?: string | null, buildingName?: string) => {
        if (buildingId) {
          const b = buildings.find(b => b.id === buildingId);
          if (b) return b.abbr;
        }
        return buildingName || '';
      };

      return [
        fmtDate(s.date) || '',
        loc?.name || s.locationId,
        getBuildingDisplay(loc?.buildingId, loc?.building),
        loc?.level || '',
        loc?.totalAssets || 0,
        getPhaseName(s.phaseId),
        sup?.name || '',
        officers,
        s.status
      ];
    });

    const ws = XLSX.utils.aoa_to_sheet([headerRow, ...dataRows]);

    // Column widths
    ws['!cols'] = [
      { wch: 12 }, // Date
      { wch: 30 }, // Asset Location
      { wch: 20 }, // Block
      { wch: 10 }, // Level
      { wch: 8 },  // Assets
      { wch: 15 }, // Phase
      { wch: 20 }, // Supervisor
      { wch: 35 }, // Officers
      { wch: 12 }, // Status
    ];

    XLSX.utils.book_append_sheet(wb, ws, sheetName);
  });

  const filterLabel = selectedDept === 'All' ? 'AllDepartments' : (allDepartments.find(d => d.name === selectedDept)?.abbr || selectedDept);
  const fileName = `Inspection_Schedule_${filterLabel}_${new Date().toISOString().split('T')[0]}.xlsx`;
  XLSX.writeFile(wb, fileName);
}

// ─── REPORT 6: Strategic Inspection Plan Approval (Management Grade) ──────────

export function generateStrategicInspectionPlanHTML(
  institutionName: string,
  year: number,
  globalStats: GlobalStats,
  feasibility: any,
  entities: Entity[],
  entityPermissions: EntityPermission[],
  signatures: { approver: string; supporter: string },
  auditGroups: any[],
  departments: any[],
  phases: any[],
  kpiTiers: any[],
  kpiTierTargets: any[],
  locations: any[],
  schedules: any[] = [],
  maxAssetsPerDay: number = 1000,
  maxLocationsPerDay: number = 5
): string {
  const overallAuditors = departments.reduce((s, d) => s + (d.auditorCount || 0), 0);
  const overallLocations = locations.length;
  
  const sortedPhases = [...phases].sort((a, b) => a.startDate.localeCompare(b.startDate));
  const sortedTiers = [...kpiTiers].sort((a, b) => a.minAssets - b.minAssets);

  // Helper detect task force
  const isTaskForceDept = (d: any) =>
    d.isTaskForce || d.is_task_force === 1 || d.is_task_force === true ||
    d.abbr === 'UPKK' || (d.name && (d.name.includes('UPKK') || d.name.includes('PENGURUSAN KOLEJ KEDIAMAN')));

  // 1. Group-to-Dept Mapping
  const groupRows = auditGroups.map((g, i) => {
    const depts = departments.filter(d => d.auditGroupId === g.id);
    const names = depts.map(d => d.name).join(', ');
    const assets = depts.reduce((s, d) => s + (d.totalAssets || 0), 0);
    return `
      <tr>
        <td class="center">${i + 1}</td>
        <td><strong>${g.name}</strong></td>
        <td>${names || '<em style="color:#94a3b8;">Empty</em>'}</td>
        <td class="right">${fmt(assets)}</td>
      </tr>
    `;
  }).join('');

  // 2. Standalone / Internal Audit Highlight
  const internalAuditDepts = departments.filter(d => d.isExempted || (d as any).is_exempted === 1 || (d as any).is_exempted === true);
  const taskForceDepts = departments.filter(d => {
    const isIntAudit = d.isExempted || (d as any).is_exempted === 1 || (d as any).is_exempted === true;
    return !isIntAudit && isTaskForceDept(d);
  });

  const internalRows = internalAuditDepts.map((d, i) => {
    const locCount = locations.filter(l => l.departmentId === d.id).length;
    return `
      <tr>
        <td class="center">${i + 1}</td>
        <td><strong>${d.name}</strong></td>
        <td class="center">${fmt(d.totalAssets || 0)}</td>
        <td class="center">${locCount}</td>
        <td class="center">${d.auditorCount || 0}</td>
        <td>Internal Regulatory Audit</td>
      </tr>
    `;
  }).join('');

  // 3. Department Distribution (Full Overview - Grouped)
  const gMap: Record<string, { name: string; depts: any[]; assets: number; auditors: number }> = {};
  departments.forEach(d => {
    const gId = d.auditGroupId || 'standalone';
    if (!gMap[gId]) {
      const gObj = auditGroups.find(g => g.id === gId);
      gMap[gId] = {
        name: gObj?.name || (gId === 'standalone' ? 'Standalone / Ungrouped Units' : 'Group'),
        depts: [],
        assets: 0,
        auditors: 0
      };
    }
    gMap[gId].depts.push(d);
    gMap[gId].assets += (d.totalAssets || 0);
    gMap[gId].auditors += (d.auditorCount || 0);
  });

  const sortedGroups = Object.values(gMap).sort((a, b) => {
    if (a.name.includes('Standalone')) return 1;
    if (b.name.includes('Standalone')) return -1;
    return a.name.localeCompare(b.name);
  });

  const distributionRows = sortedGroups.map(group => {
    const groupHdr = `
      <tr style="background:#f8fafc;">
        <td colspan="2" style="font-weight:900;padding:8pt 10pt;border-left:3pt solid #6366f1;color:#1e293b;font-size:9.5pt;">${group.name.toUpperCase()}</td>
        <td class="right" style="font-weight:900;color:#1e293b;">${fmt(group.assets)}</td>
        <td class="right" style="font-weight:900;color:#1e293b;">${fmt(group.auditors)}</td>
      </tr>
    `;
    const rows = group.depts.map(d => `
      <tr>
        <td style="padding-left:25pt;color:#475569;font-weight:600;">${d.name}</td>
        <td class="center" style="font-weight:700;color:#94a3b8;font-size:8pt;">${d.abbr || '-'}</td>
        <td class="right" style="color:#64748b;">${fmt(d.totalAssets || 0)}</td>
        <td class="right" style="color:#64748b;">${fmt(d.auditorCount || 0)}</td>
      </tr>
    `).join('');
    return groupHdr + rows;
  }).join('');

  // 4. Phase Timeline Summary
  const phaseTimeline = sortedPhases.map(p => `
    <div class="stat-box" style="padding: 6pt; border-left: 2pt solid #6366f1;">
      <div style="font-weight:800;font-size:8pt;color:#1e293b;">${p.name}</div>
      <div style="font-size:7pt;color:#64748b;">${p.startDate} – ${p.endDate}</div>
    </div>
  `).join('');

  // 5. KPI Tier Summary
  const kpiSummary = sortedTiers.map(tier => {
    const target = kpiTierTargets.find(t => t.tierId === tier.id);
    return `
      <div style="margin-bottom:4pt;border-bottom:1pt solid #f1f5f9;padding-bottom:2pt;">
        <span style="font-weight:700;font-size:8pt;">${tier.name}</span>: 
        <span style="font-weight:800;color:#4f46e5;">${target ? target.targetPercentage : 0}%</span> target 
        <span style="font-size:7pt;color:#94a3b8;">(Min ${fmt(tier.minAssets || 0)} assets)</span>
      </div>
    `;
  }).join('');

  // ── KPI Phase Plan Logic (New) ──
  const instTotal = departments.reduce((s, d) => s + (d.totalAssets || 0), 0);
  const kpiPhaseRows = departments.sort((a, b) => (b.totalAssets || 0) - (a.totalAssets || 0)).map(dept => {
    const deptPct = instTotal > 0 ? ((dept.totalAssets || 0) / instTotal) * 100 : 0;
    const tier = sortedTiers.filter(t => deptPct >= t.minAssets).sort((a,b) => b.minAssets - a.minAssets)[0];
    const deptAudits = schedules.filter(s => s.departmentId === dept.id);
    const deptLocIds = new Set(locations.filter(l => l.departmentId === dept.id).map(l => l.id));
    const allLocsScheduled = deptLocIds.size > 0 && Array.from(deptLocIds).every(lid => deptAudits.some(a => a.locationId === lid));

    let reached100 = false;
    const phaseCells = sortedPhases.map(phase => {
      const targetPct = tier ? (kpiTierTargets.find(kt => kt.tierId === tier.id && kt.phaseId === phase.id)?.targetPercentage ?? 0) : 0;
      const isReq = (dept.totalAssets || 0) > 0 && targetPct > 0 && !reached100;
      if (targetPct >= 100) reached100 = true;

      if (!isReq) return `<td class="center" style="color:#e2e8f0;font-size:12pt;opacity:0.3;">•</td>`;

      const hasAudit = deptAudits.some(a => a.phaseId === phase.id) || allLocsScheduled;
      const isComp = deptAudits.some(a => a.phaseId === phase.id && a.status === 'Completed');
      const assets = Math.ceil((dept.totalAssets || 0) * targetPct / 100);

      const color = isComp ? '#059669' : hasAudit ? '#2563eb' : '#e11d48';
      const bg = isComp ? '#ecfdf5' : hasAudit ? '#eff6ff' : '#fff1f2';
      const border = isComp ? '1pt solid #10b981' : hasAudit ? '1pt solid #bfdbfe' : '1pt dashed #fecdd3';

      return `
        <td class="center">
          <div style="display:inline-block;padding:2pt 4pt;background:${bg};border:${border};border-radius:4pt;min-width:28pt;">
            <div style="font-weight:900;color:${color};font-size:7.5pt;line-height:1;">${targetPct}%</div>
            <div style="font-size:6pt;color:#64748b;margin-top:1pt;">${fmt(assets)}</div>
          </div>
        </td>
      `;
    }).join('');

    const statusLabel = (dept.totalAssets || 0) === 0 ? 'EXEMPT' : allLocsScheduled || deptAudits.length > 0 ? 'READY' : 'INCOMPLETE';
    return `
      <tr>
        <td>
          <div style="font-weight:800;font-size:8pt;">${dept.name}</div>
          <div style="font-size:6.5pt;color:#94a3b8;font-weight:600;">${dept.abbr || ''}</div>
        </td>
        <td class="center">
          <div style="font-weight:700;font-size:7.5pt;">${fmt(dept.totalAssets || 0)}</div>
          <div style="font-size:6pt;color:#4f46e5;font-weight:800;text-transform:uppercase;">${tier?.name || '---'}</div>
        </td>
        ${phaseCells}
        <td class="right" style="font-weight:900;font-size:7pt;color:${statusLabel === 'READY' ? '#059669' : '#f59e0b'}">${statusLabel}</td>
      </tr>
    `;
  }).join('');

  const consolidatedPairings = entityPermissions.map(p => {
    const aud = entities.find(e => e.id === p.auditorEntityId);
    const tgt = entities.find(e => e.id === p.targetEntityId);
    return {
      auditor: aud?.name || '?',
      target: tgt?.name || '?',
      assets: aud?.assets || 0,
      targetAssets: tgt?.assets || 0,
      isMutual: p.isMutual
    };
  });

  const bottleneckItems = feasibility?.bottlenecks?.map((b: string) => `<li>${b}</li>`).join('') || '<li>None identified.</li>';

  return `
<div class="header" style="display:flex;justify-content:space-between;align-items:center;">
  <div>
    <h1>Strategic Audit Plan Approval Memo</h1>
    <p class="subtitle">Cycle Year: ${year} &nbsp;|&nbsp; Target Compliance: ${pct(globalStats.targetPercentage)}</p>
  </div>
  <div style="text-align:right;">
    <div style="font-size:8pt;font-weight:900;color:#6366f1;text-transform:uppercase;letter-spacing:1pt;">Official Strategic Record</div>
    <div style="font-size:12pt;font-weight:900;color:#1e293b;">${institutionName}</div>
  </div>
</div>

<div class="stat-row" style="display:grid;grid-template-columns: repeat(4, 1fr); gap:10pt; margin-bottom:15pt;">
  <div class="stat-box" style="border:1pt solid #e2e8f0;border-radius:8pt;padding:10pt;background:#fff;">
    <div class="stat-label" style="font-size:7pt;font-weight:800;color:#64748b;text-transform:uppercase;">Institutional Assets</div>
    <div class="stat-value" style="font-size:16pt;font-weight:900;color:#1e293b;margin-top:2pt;">${fmt(globalStats.totalInstitutionAssets)}</div>
  </div>
  <div class="stat-box" style="border:1pt solid #e2e8f0;border-radius:8pt;padding:10pt;background:#fff;">
    <div class="stat-label" style="font-size:7pt;font-weight:800;color:#64748b;text-transform:uppercase;">Resource Pool</div>
    <div class="stat-value" style="font-size:16pt;font-weight:900;color:#1e293b;margin-top:2pt;">${overallAuditors} Officers</div>
  </div>
  <div class="stat-box" style="border:1pt solid #e2e8f0;border-radius:8pt;padding:10pt;background:#fff;">
    <div class="stat-label" style="font-size:7pt;font-weight:800;color:#64748b;text-transform:uppercase;">Total Locations</div>
    <div class="stat-value" style="font-size:16pt;font-weight:900;color:#1e293b;margin-top:2pt;">${overallLocations}</div>
  </div>
  <div class="stat-box" style="border:1pt solid #e2e8f0;border-radius:8pt;padding:10pt;background:#fff;border-color:${feasibility?.riskLevel === 'Low' ? '#10b981' : '#f59e0b'};">
    <div class="stat-label" style="font-size:7pt;font-weight:800;color:#64748b;text-transform:uppercase;">Feasibility Score</div>
    <div class="stat-value" style="font-size:16pt;font-weight:900;color:${feasibility?.riskLevel === 'Low' ? '#059669' : '#d97706'};margin-top:2pt;">${feasibility?.score}%</div>
  </div>
</div>

<div class="section" style="display:grid;grid-template-columns: 1.5fr 1fr; gap:16pt;margin-bottom:15pt;">
  <div>
    <h3>1. PHASE EXECUTION TIMELINE</h3>
    <div style="display:grid;grid-template-columns: repeat(3, 1fr); gap:8pt;margin-top:6pt;">
      ${phaseTimeline || '<p style="color:#888;font-size:8pt;">No phase schedule defined.</p>'}
    </div>
  </div>
  <div style="background:#f8fafc;padding:10pt;border-radius:10pt;border:1pt solid #e2e8f0;">
    <h3 style="margin-top:0;">2. INSTITUTIONAL KPI PLAN</h3>
    <div style="margin-top:6pt;">
      ${kpiSummary || '<p style="color:#888;font-size:8pt;">No KPI tiers configured.</p>'}
      <div style="margin-top:8pt;font-size:7.5pt;font-weight:900;color:#1e293b;text-transform:uppercase;">Institutional Target: ${pct(globalStats.targetPercentage)}</div>
    </div>
  </div>
</div>

<div class="section" style="margin-bottom:15pt;">
  <h3>3. KPI PHASE INSPECTION PLAN (DETAILED)</h3>
  <div style="background:#f0f9ff;padding:8pt;border-radius:8pt;font-size:7.5pt;color:#0369a1;margin-bottom:10pt;font-weight:600;border:1pt solid #bae6fd;">
    Keperluan fasa pemeriksaan mengikut tier KPI. Setiap peratusan menunjukkan sasaran kumulatif aset yang perlu diliputi.
  </div>
  <table>
    <thead>
      <tr>
        <th>Department / Unit</th>
        <th style="width:50pt;" class="center">Assets / Tier</th>
        ${sortedPhases.map(p => `<th class="center" style="width:40pt;">${p.name}</th>`).join('')}
        <th style="width:50pt;" class="right">Status</th>
      </tr>
    </thead>
    <tbody>
      ${kpiPhaseRows}
    </tbody>
  </table>
</div>

<div class="section" style="margin-bottom:15pt;">
  <h3>4. TABURAN SUMBER JABATAN / DEPARTMENT RESOURCE DISTRIBUTION</h3>
  <p style="font-size:8.5pt;margin-bottom:6pt;">Institutional resource detail by audit group and constituent unit:</p>
  <table>
    <thead>
      <tr>
        <th>Group / Department</th>
        <th style="width:60pt;" class="center">Abbr.</th>
        <th style="width:80pt;" class="right">Assets</th>
        <th style="width:80pt;" class="right">Inspectors</th>
      </tr>
    </thead>
    <tbody>
      ${distributionRows}
    </tbody>
  </table>
</div>

<div class="page-break"></div>

<div class="section" style="margin-bottom:15pt;">
  <h3>5. JABATAN AUDIT DALAMAN / INTERNAL AUDIT DEPARTMENT</h3>
  <p style="font-size:8.5pt;margin-bottom:6pt;">The following units are proposed for **Internal/Regulatory Audit** based on asset volume or specialty status:</p>
  ${internalAuditDepts.length === 0 ? '<p style="font-size:8pt;color:#94a3b8;font-style:italic;">Tiada jabatan ditetapkan sebagai Audit Dalaman.</p>' : `
    <table>
      <thead>
        <tr>
          <th style="width:25pt;" class="center">Bil</th>
          <th>Unit / Department</th>
          <th class="center">Total Assets</th>
          <th class="center">Locs</th>
          <th class="center">Personnel</th>
          <th>Justification</th>
        </tr>
      </thead>
      <tbody>
        ${internalRows}
      </tbody>
    </table>
  `}

  <div style="margin-top:12pt;background:#f8fafc;padding:8pt;border-radius:8pt;border:1pt solid #e2e8f0;">
    <h4 style="margin:0 0 4pt 0;font-size:8.5pt;text-transform:uppercase;color:#475569;">Analisis Kekangan / Bottleneck Analysis:</h4>
    <ul style="padding-left:15pt;font-size:8pt;margin:0;">
      ${bottleneckItems}
    </ul>
  </div>
</div>

${taskForceDepts.length > 0 ? `
<div class="section" style="margin-bottom:15pt;">
  <h3>6. UNIT TUGAS KHAS / SPECIAL TASK FORCE UNITS</h3>
  <div style="background:#eff6ff;padding:8pt;border-radius:8pt;font-size:7.5pt;color:#1e40af;margin-bottom:10pt;font-weight:600;border:1pt solid #bfdbfe;">
    Jabatan ini mempunyai skala operasi yang besar dan ditetapkan sebagai unit Tugas Khas dalam struktur audit silang.
  </div>
  <table>
    <thead>
      <tr>
        <th style="width:30pt;" class="center">Bil</th>
        <th>Jabatan / Unit</th>
        <th class="center">Jumlah Aset</th>
        <th class="center">Lokasi</th>
        <th class="center">Pegawai</th>
        <th class="right">Skor BBI</th>
      </tr>
    </thead>
    <tbody>
      ${taskForceDepts.map((d, i) => {
        const locCount = locations.filter(l => l.departmentId === d.id).length;
        const bbi = Math.round((d.totalAssets || 0) * 0.5 + locCount * 100 + (d.auditorCount || 0) * 300);
        return `
          <tr>
            <td class="center">${i + 1}</td>
            <td><strong>${d.name}</strong></td>
            <td class="center">${fmt(d.totalAssets || 0)}</td>
            <td class="center">${locCount}</td>
            <td class="center">${d.auditorCount || 0}</td>
            <td class="right"><strong>${fmt(bbi)}</strong></td>
          </tr>
        `;
      }).join('')}
    </tbody>
  </table>
</div>
` : ''}

<div class="section" style="margin-bottom:15pt;">
  <h3>${taskForceDepts.length > 0 ? '7' : '6'}. STRATEGI PEMADANAN AUDIT / STRATEGIC AUDIT PAIRING</h3>
  <p style="font-size:8.5pt;margin-bottom:6pt;">Strategi pemadanan telah diringkaskan untuk keberkesanan (Mutual pairings are consolidated):</p>
  <table>
    <thead>
      <tr>
        <th style="width:30pt;" class="center">Bil</th>
        <th style="text-align:left;">ENTITI PEMERIKSA / INSPECTOR</th>
        <th class="center" style="width:110pt;">MOD / DIRECTION</th>
        <th style="text-align:left;">ENTITI SASARAN / TARGET</th>
      </tr>
    </thead>
    <tbody>
      ${consolidatedPairings.map((p, i) => `
        <tr>
          <td class="center">${i + 1}</td>
          <td>
            <div style="font-weight:800;font-size:9pt;">${p.auditor}</div>
            <div style="font-size:7.5pt;color:#64748b;font-weight:600;margin-top:1pt;">${fmt(p.assets)} ASSETS</div>
          </td>
          <td class="center" style="font-size:7pt;color:${p.isMutual ? '#10b981' : '#4f46e5'}">
            <div style="font-weight:900;font-size:12pt;line-height:1;margin-bottom:2pt;">${p.isMutual ? '↔' : '→'}</div>
            <div style="font-weight:700;letter-spacing:0.5pt;">${p.isMutual ? 'MUTUAL / TIMBAL BALAS' : 'ONE-WAY / SOKONGAN'}</div>
          </td>
          <td>
            <div style="font-weight:800;font-size:9pt;">${p.target}</div>
            <div style="font-size:7.5pt;color:#64748b;font-weight:600;margin-top:1pt;">${fmt(p.targetAssets)} ASSETS</div>
          </td>
        </tr>
      `).join('')}
    </tbody>
  </table>
</div>

<div class="section" style="margin-top:15pt;background:#fff7ed;padding:12pt;border:1pt solid #ffedd5;border-radius:10pt;margin-bottom:15pt;">
  <h3 style="margin-top:0;color:#9a3412;border:none;">${taskForceDepts.length > 0 ? '8' : '7'}. PROTOKOL INTEGRITI DAN KEPATUHAN / INTEGRITY PROTOCOLS</h3>
  <p style="font-size:8.5pt;margin-bottom:0;color:#9a3412;">
    <strong>KAWALAN KESELAMATAN:</strong> Sistem telah mengunci tugasan untuk mengelakkan "Self-Audit".<br>
    <strong>KONFLIK KEPETINGAN:</strong> Site Supervisor <strong>TIDAK DIBENARKAN</strong> secara mutlak untuk menjadi Pemeriksa bagi lokasi tersebut.<br>
    <strong>SENSITIVITI SOSIAL:</strong> Syor AI telah mengambil kira sensitiviti jantina bagi lokasi khas (mis: Kolej Kediaman Siswi).
  </p>
</div>

${feasibility?.exemptionRecommendations && feasibility.exemptionRecommendations.length > 0 ? `
<div class="section" style="margin-bottom:15pt;">
  <h3>${taskForceDepts.length > 0 ? '9' : '8'}. CADANGAN PENGECUALIAN POLISI / PROPOSED POLICY EXCEPTIONS</h3>
  <table>
    <thead>
      <tr>
        <th style="width:30pt;" class="center">Bil</th>
        <th>Unit / Department</th>
        <th>Justifikasi / Justification (AI Suggested)</th>
      </tr>
    </thead>
    <tbody>
      ${feasibility.exemptionRecommendations.map((ex: any, i: number) => `
        <tr>
          <td class="center">${i + 1}</td>
          <td><strong>${ex.unit}</strong></td>
          <td>${ex.reason}</td>
        </tr>
      `).join('')}
    </tbody>
  </table>
</div>
` : ''}

<div class="page-break"></div>

<div class="section">
  <h3>${feasibility?.exemptionRecommendations && feasibility.exemptionRecommendations.length > 0 ? (taskForceDepts.length > 0 ? '10' : '9') : (taskForceDepts.length > 0 ? '9' : '8')}. PERAKUAN DAN KELULUSAN / RECOMMENDATION AND APPROVAL</h3>
  <div style="margin-top:10pt;display:grid;grid-template-columns: 1fr 1fr; gap:20pt;">
    
    <div style="border:1pt solid #cbd5e1;padding:12pt;border-radius:10pt;background:#f8fafc;">
      <p style="font-weight:800;margin-bottom:8pt;color:#1e293b;font-size:9pt;">DISOKONG OLEH / SUPPORTED BY:</p>
      <div style="height:40pt;border-bottom:1pt dashed #94a3b8;margin-bottom:8pt;"></div>
      <p style="font-weight:800;font-size:10pt;">(${signatures.supporter})</p>
      <p style="font-size:7.5pt;color:#64748b;margin-top:2pt;">Ketua Unit / Timbalan Pengarah</p>
      <p style="font-size:7.5pt;color:#64748b;margin-top:8pt;">Tarikh / Date: .......................................</p>
    </div>

    <div style="border:2pt solid #1e293b;padding:12pt;border-radius:10pt;">
      <p style="font-weight:800;margin-bottom:8pt;color:#1e293b;font-size:9pt;">KEPUTUSAN PENGARAH / DIRECTOR'S DECISION:</p>
      
      <div style="margin: 10pt 0;">
        <div style="display:flex;align-items:center;gap:8pt;margin-bottom:6pt;">
          <div style="width:12pt;height:12pt;border:1.5pt solid #1e293b;border-radius:3pt;"></div>
          <span style="font-size:8.5pt;font-weight:700;">LULUS / APPROVED</span>
        </div>
        <div style="display:flex;align-items:center;gap:8pt;margin-bottom:6pt;">
          <div style="width:12pt;height:12pt;border:1.5pt solid #1e293b;border-radius:3pt;"></div>
          <span style="font-size:8.5pt;font-weight:700;">PINDAAN / AMENDMENT</span>
        </div>
        <div style="display:flex;align-items:center;gap:8pt;">
          <div style="width:12pt;height:12pt;border:1.5pt solid #1e293b;border-radius:3pt;"></div>
          <span style="font-size:8.5pt;font-weight:700;">TOLAK / REJECTED</span>
        </div>
      </div>

      <div style="height:30pt;border-bottom:1pt dashed #94a3b8;margin-bottom:8pt;"></div>
      <p style="font-weight:800;font-size:10pt;">(${signatures.approver})</p>
      <p style="font-size:7.5pt;color:#64748b;margin-top:2pt;">Pengarah</p>
    </div>

  </div>

  <div style="margin-top:15pt; border: 1pt solid #cbd5e1; border-radius:10pt; padding:10pt;">
    <h4 style="margin:0 0 6pt 0;font-size:8.5pt;text-transform:uppercase;">Catatan / Comments:</h4>
    <div style="height:60pt;"></div>
  </div>
</div>

<div class="footer" style="margin-top:20pt;text-align:center;font-size:7.5pt;color:#94a3b8;border-top:1pt solid #e2e8f0;padding-top:8pt;">
  Dokumen ini dijanakan secara digital oleh Sistem <strong>Inspect-able</strong> AI Strategy Engine.<br>
</div>
  `;
}
export function printStrategicInspectionPlanApproval(
  institutionName: string,
  year: number,
  globalStats: GlobalStats,
  feasibility: any,
  entities: Entity[],
  entityPermissions: EntityPermission[],
  signatures: { approver: string; supporter: string },
  auditGroups: any[],
  departments: any[],
  phases: any[],
  kpiTiers: any[],
  kpiTierTargets: any[],
  locations: any[],
  schedules: any[] = [],
  maxAssetsPerDay: number = 1000,
  maxLocationsPerDay: number = 5
): void {
  const html = generateStrategicInspectionPlanHTML(
    institutionName,
    year,
    globalStats,
    feasibility,
    entities,
    entityPermissions,
    signatures,
    auditGroups,
    departments,
    phases,
    kpiTiers,
    kpiTierTargets,
    locations,
    schedules,
    maxAssetsPerDay,
    maxLocationsPerDay
  );
  openPrint('Strategic Audit Plan Approval Memo', html);
}

export function printTeamList(
  users: User[],
  departments: Department[],
  selectedStatus: string,
  selectedDept: string,
  selectedRole: string
): void {
  const getDept = (id?: string) => departments.find(d => d.id === id)?.name || id || '—';
  
  const statusBadge = (s: string) => {
    if (s === 'Active') return `<span class="badge badge-green">${s}</span>`;
    if (s === 'Pending') return `<span class="badge badge-amber">${s}</span>`;
    return `<span class="badge badge-slate">${s}</span>`;
  };

  const certStatus = (expiry?: string) => {
    if (!expiry) return '<span class="badge badge-slate">Uncertified</span>';
    const expiryDate = new Date(expiry);
    const today = new Date();
    if (expiryDate > today) return `<span class="badge badge-green">Certified (Exp: ${expiry})</span>`;
    return `<span class="badge badge-amber">Expired (${expiry})</span>`;
  };

  const bodyRows = users.map((u, i) => {
    const rolesStr = u.roles.map(r => r === 'Auditor' ? 'Inspector' : r).join(', ');
    return `<tr>
      <td class="center">${i + 1}</td>
      <td><strong>${u.name}</strong><br><span style="font-size:7.5pt;color:#666;">${u.email}</span></td>
      <td>${u.designation || '—'}</td>
      <td>${getDept(u.departmentId)}</td>
      <td>${rolesStr}</td>
      <td class="center">${certStatus(u.certificationExpiry)}</td>
      <td>${u.contactNumber || '—'}</td>
    </tr>`;
  }).join('');

  const activeCount = users.filter(u => u.status === 'Active').length;
  const pendingCount = users.filter(u => u.status === 'Pending').length;
  const certifiedCount = users.filter(u => u.certificationExpiry && new Date(u.certificationExpiry) > new Date()).length;

  const html = `
<div class="header">
  <div style="display:flex;justify-content:space-between;align-items:flex-start;">
    <div>
      <h1>Institutional Team Report</h1>
      <p class="subtitle">Platform: Inspect-able — Asset Inspection Scheduling &amp; Management System</p>
    </div>
    <div style="text-align:right;">
      <div style="font-size:12pt;font-weight:900;color:#2563eb;">POLITEKNIK KUCHING SARAWAK</div>
      <div style="font-size:8pt;color:#94a3b8;margin-top:2pt;">Asset Inspection Scheduling &amp; Management System</div>
    </div>
  </div>
</div>

<div class="stat-row">
  <div class="stat-box">
    <div class="stat-label">Total Officers</div>
    <div class="stat-value">${users.length}</div>
    <div class="stat-sub">Active in filter</div>
  </div>
  <div class="stat-box">
    <div class="stat-label">Active Duty</div>
    <div class="stat-value text-green">${activeCount}</div>
  </div>
  <div class="stat-box">
    <div class="stat-label">Pending Approval</div>
    <div class="stat-value text-amber">${pendingCount}</div>
  </div>
  <div class="stat-box">
    <div class="stat-label">Certified Officers</div>
    <div class="stat-value text-green">${certifiedCount}</div>
  </div>
</div>

<div class="section">
  <h2>Officer Directory Listing</h2>
  <table>
    <thead>
      <tr>
        <th style="width:30pt;" class="center">Bil</th>
        <th>Full Name & Email</th>
        <th>Designation</th>
        <th>Department</th>
        <th>System Roles</th>
        <th class="center">Certification</th>
        <th>Contact</th>
      </tr>
    </thead>
    <tbody>
      ${bodyRows || '<tr><td colspan="7" style="text-align:center;color:#888;">No team members found matching the active filters.</td></tr>'}
    </tbody>
  </table>
</div>

<div class="footer" style="margin-top:18pt;text-align:center;font-size:8pt;color:#94a3b8;border-top:1pt solid #e2e8f0;padding-top:8pt;">
  Inspect-able &copy; ${new Date().getFullYear()} &nbsp;|&nbsp; Internal Regulatory Document &nbsp;|&nbsp; Page 1 of 1
</div>`;

  openPrint('Institutional Team Report', html, true);
}
