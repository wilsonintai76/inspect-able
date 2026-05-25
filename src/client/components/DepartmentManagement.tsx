import React, { useState } from 'react';
import { Department, Location, User, AuditGroup, UserRole } from '@shared/types';
import { Plus, Layers, UserRound, Boxes, Pencil, Archive, ArchiveRestore, UserPlus, Printer, Flame } from 'lucide-react';
import { AuditPhase } from '@shared/types';
import { useRBAC } from '../contexts/RBACContext';
import { DepartmentModal } from './DepartmentModal';
import { PurgeConfirmModal } from './PurgeConfirmModal';

interface DepartmentManagementProps {
  departments: Department[];
  locations: Location[];
  departmentMappings?: unknown[];
  users: User[];
  onAdd: (dept: Omit<Department, 'id'>) => void;
  onUpdate: (id: string, dept: Partial<Department>) => void;
  onBulkUpdate?: (updates: { id: string; data: Partial<Department> }[]) => void;
  onDelete: (id: string) => void;
  onPurge: (id: string) => void;
  isAdmin?: boolean;
  phases?: AuditPhase[];
  auditGroups?: AuditGroup[];
  onAddGroup?: (group: Omit<AuditGroup, 'id'>) => Promise<AuditGroup | void>;
  onUpdateGroup?: (id: string, group: Partial<AuditGroup>) => void;
  onDeleteGroup?: (id: string) => void;
  onAddAuditor: (deptId: string) => void;
  currentUserRoles?: string[];
  openAuditThreshold?: number;
  buildings?: any[];
}

export const DepartmentManagement: React.FC<DepartmentManagementProps> = ({
  departments,
  locations,
  onAdd,
  onUpdate,
  onDelete,
  onPurge,
  users,
  isAdmin = true,
  phases = [],
  auditGroups = [],
  onAddAuditor,
  currentUserRoles = [],
  openAuditThreshold = 500,
  buildings = []
}) => {
  const { rbacMatrix } = useRBAC();
  const isCoordinator = currentUserRoles.includes('Coordinator') && !currentUserRoles.includes('Admin');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingDept, setEditingDept] = useState<Department | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [purgeTarget, setPurgeTarget] = useState<Department | null>(null);

  const deptLocationCounts = React.useMemo(() => {
    const counts: Record<string, number> = {};
    (locations || []).forEach(loc => {
      if (loc.departmentId) {
        counts[loc.departmentId] = (counts[loc.departmentId] || 0) + 1;
      }
    });
    return counts;
  }, [locations]);

  const visibleDepts = React.useMemo(() => {
    return showArchived ? departments : departments.filter(d => !d.isArchived);
  }, [departments, showArchived]);

  const archivedCount = React.useMemo(() => departments.filter(d => d.isArchived).length, [departments]);

  const canManage = (() => {
    if (!rbacMatrix) return isAdmin;
    const allowedRoles = rbacMatrix['manage:departments'] || [];
    return (currentUserRoles || []).some(r => allowedRoles.includes(r as any));
  })();

  const handleSave = (data: Omit<Department, 'id'> | Partial<Department>) => {
    if (editingDept) {
      onUpdate(editingDept.id, data as Partial<Department>);
    } else {
      onAdd(data as Omit<Department, 'id'>);
    }
  };

  const startEdit = (dept: Department) => {
    setEditingDept(dept);
    setIsModalOpen(true);
  };

  const startAdd = () => {
    setEditingDept(null);
    setIsModalOpen(true);
  };

  const handlePrint = () => {
    const printWindow = window.open('', '_blank', 'width=1100,height=800');
    if (!printWindow) return;

    const activeDepts = departments.filter(d => !d.isArchived);
    const rows = activeDepts.map(dept => {
      const headUser = users.find(u => u.id === dept.headOfDeptId);
      const groupName = auditGroups.find(g => g.id === dept.auditGroupId)?.name || '—';
      const locCount = (locations || []).filter(l => l.departmentId === dept.id).length;
      
      return `
        <tr>
          <td><strong>${dept.abbr}</strong><br/><span class="sub">${dept.name}</span></td>
          <td>${headUser ? headUser.name : '<span class="na">Not Assigned</span>'}</td>
          <td class="center">
            <span style="font-weight:900; color:#4f46e5;">${dept.auditorsRequiredOverride ?? (dept.totalAssets > 0 ? Math.max(2, Math.ceil((dept.totalAssets || 0) / openAuditThreshold) * 2) : 0)}</span>
          </td>
          <td class="center">${(dept.totalAssets || 0).toLocaleString()}</td>
          <td class="center">${locCount || '—'}</td>
          <td>${groupName !== '—' ? `<span class="badge-blue">${groupName}</span>` : '—'}</td>
        </tr>`;
    }).join('');

    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <title>Department Registry — Inspect-able</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 12px; color: #1e293b; background: #fff; padding: 32px; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 28px; padding-bottom: 16px; border-bottom: 2px solid #e2e8f0; }
    .header-left h1 { font-size: 22px; font-weight: 900; color: #1e293b; letter-spacing: -0.5px; }
    .header-left p { font-size: 11px; color: #64748b; margin-top: 4px; }
    .header-right { text-align: right; font-size: 10px; color: #94a3b8; }
    .header-right .brand { font-size: 13px; font-weight: 900; color: #2563eb; letter-spacing: -0.3px; }
    .meta { display: flex; gap: 24px; margin-bottom: 20px; }
    .meta-card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px 16px; }
    .meta-card .val { font-size: 20px; font-weight: 900; color: #1e293b; }
    .meta-card .lbl { font-size: 9px; text-transform: uppercase; letter-spacing: 0.08em; color: #94a3b8; font-weight: 700; margin-top: 2px; }
    table { width: 100%; border-collapse: collapse; }
    thead tr { background: #1e293b; color: #fff; }
    thead th { padding: 10px 12px; text-align: left; font-size: 9px; text-transform: uppercase; letter-spacing: 0.1em; font-weight: 800; }
    thead th.center { text-align: center; }
    tbody tr:nth-child(even) { background: #f8fafc; }
    tbody tr:hover { background: #eff6ff; }
    td { padding: 9px 12px; border-bottom: 1px solid #f1f5f9; vertical-align: top; }
    td.center { text-align: center; }
    .sub { font-size: 10px; color: #94a3b8; }
    .na { font-style: italic; color: #cbd5e1; }
    .badge-amber { background: #fffbeb; color: #d97706; border: 1px solid #fde68a; border-radius: 4px; padding: 1px 6px; font-size: 10px; font-weight: 700; }
    .badge-green { background: #f0fdf4; color: #16a34a; border: 1px solid #bbf7d0; border-radius: 4px; padding: 1px 6px; font-size: 10px; font-weight: 700; }
    .badge-blue { background: #eff6ff; color: #2563eb; border: 1px solid #bfdbfe; border-radius: 4px; padding: 1px 6px; font-size: 10px; font-weight: 700; }
    .footer { margin-top: 24px; font-size: 9px; color: #94a3b8; text-align: center; border-top: 1px solid #e2e8f0; padding-top: 12px; }
    @media print { body { padding: 16px; } .no-print { display: none; } }
  </style>
</head>
<body>
  <div class="header">
    <div class="header-left">
      <h1>Department Registry</h1>
      <p>Institutional structure, departments and unit configuration</p>
    </div>
    <div class="header-right">
      <div class="brand">Inspect-able</div>
      <div>Printed: ${new Date().toLocaleString('en-MY', { dateStyle: 'long', timeStyle: 'short' })}</div>
    </div>
  </div>
  <div class="meta">
    <div class="meta-card"><div class="val">${departments.length}</div><div class="lbl">Total Departments</div></div>
    <div class="meta-card"><div class="val">${departments.filter(d => !d.isArchived).length}</div><div class="lbl">Active Departments</div></div>
    <div class="meta-card"><div class="val">${departments.reduce((s, d) => s + (d.totalAssets || 0), 0).toLocaleString()}</div><div class="lbl">Total Assets</div></div>
  </div>
  <table>
    <thead>
      <tr>
        <th>Department</th>
        <th>Head of Department</th>
        <th class="center">Required Auditors</th>
        <th class="center">Total Assets</th>
        <th class="center">Locations</th>
        <th>Audit Group</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
  <div class="footer">Inspect-able — Institutional Asset Audit Platform &nbsp;|&nbsp; Confidential — Internal Use Only</div>
  <script>window.onload = () => { window.print(); };</script>
</body>
</html>`;

    printWindow.document.write(html);
    printWindow.document.close();
  };

  const getColorIndex = (str: string) => {
    let hash = 0;
    for (let i = 0; i < (str?.length || 0); i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
    return Math.abs(hash);
  };
  
  const AVATAR_COLORS = [
    'bg-blue-100 text-blue-600 border-blue-200', 'bg-emerald-100 text-emerald-600 border-emerald-200',
    'bg-indigo-100 text-indigo-600 border-indigo-200', 'bg-purple-100 text-purple-600 border-purple-200',
    'bg-amber-100 text-amber-600 border-amber-200', 'bg-rose-100 text-rose-600 border-rose-200'
  ];

  const activePhase = React.useMemo(() => {
    const today = new Date();
    return (phases || []).find(p => {
      const start = new Date(p.startDate);
      const end = new Date(p.endDate);
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
      return today >= start && today <= end;
    });
  }, [phases]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-end gap-2">
        {canManage && (
          <button
            onClick={startAdd}
            className={`px-5 py-2.5 rounded-2xl text-sm font-bold shadow-lg transition-all flex items-center justify-center gap-2 active:scale-95 ${activePhase
                ? 'bg-white/10 text-white border border-white/20 hover:bg-white/20 shadow-none'
                : 'bg-blue-600 text-white shadow-blue-500/20 hover:bg-blue-700'
              }`}
          >
            <Plus className="w-4 h-4" />
            New Dept
          </button>
        )}
        <button
          onClick={handlePrint}
          title="Print Department Registry"
          className={`px-4 py-2.5 rounded-2xl text-sm font-bold transition-all flex items-center justify-center gap-2 active:scale-95 border ${
            activePhase
              ? 'bg-white/10 text-white border-white/20 hover:bg-white/20'
              : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50 shadow-sm'
          }`}
        >
          <Printer className="w-4 h-4" />
          Print
        </button>
      </div>

      <div className="bg-white rounded-[32px] border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto scrollbar-thin scrollbar-thumb-slate-200">
          <table className="w-full text-left min-w-225">
            <thead className="bg-slate-50/50 border-b border-slate-100">
              <tr>
                <th className="px-6 py-5 text-[10px] font-black uppercase text-slate-400 tracking-widest">Department</th>
                <th className="px-6 py-5 text-[10px] font-black uppercase text-slate-400 tracking-widest">Head of Department</th>
                <th className="px-6 py-5 text-[10px] font-black uppercase text-slate-400 tracking-widest text-center">Certified Officers</th>
                <th className="px-6 py-5 text-[10px] font-black uppercase text-slate-400 tracking-widest text-center">Required Auditors</th>
                <th className="px-6 py-5 text-[10px] font-black uppercase text-slate-400 tracking-widest">Total Asset</th>
                <th className="px-6 py-5 text-[10px] font-black uppercase text-slate-400 tracking-widest text-center">Locations</th>
                <th className="px-6 py-5 text-[10px] font-black uppercase text-slate-400 tracking-widest">Tier & Group</th>
                <th className="px-6 py-5 text-[10px] font-black uppercase text-slate-400 tracking-widest text-left">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {visibleDepts.map(dept => {
                const colorClass = AVATAR_COLORS[getColorIndex(dept.name) % AVATAR_COLORS.length];
                const headUser = users.find(u => u.id === dept.headOfDeptId);
                const isArchived = dept.isArchived === true;

                return (
                  <tr key={dept.id} className={`transition-colors align-top ${isArchived ? 'opacity-50 bg-slate-50/80' : 'hover:bg-slate-50/50'}`}>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-4">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center text-xs font-black shadow-sm border ${colorClass} shrink-0`}>
                          {dept.abbr}
                        </div>
                        <div className="min-w-0">
                          <div className="font-bold text-slate-900 text-sm flex items-center gap-2">
                            {dept.name}
                            {dept.isExempted && <span className="px-1.5 py-0.5 rounded bg-amber-50 text-amber-600 text-[9px] font-black border border-amber-100 uppercase tracking-widest" title="This unit performs its own internal audits and is excluded from institutional cross-audit grouping.">Internal Audit Mode</span>}
                            {dept.isSystemExempted && <span className="px-1.5 py-0.5 rounded bg-slate-50 text-slate-400 text-[9px] font-black border border-slate-100 uppercase tracking-widest" title="Automatically exempted: Unit has 0 Assets and 0 Auditors">System Exempted (Empty)</span>}
                            {isArchived && <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-400 text-[9px] font-black border border-slate-200 uppercase tracking-widest">Archived</span>}
                          </div>
                          {isArchived && (dept.archivedBy || dept.archivedAt) && (
                            <div className="text-[10px] text-slate-400 mt-0.5">
                              {dept.archivedBy && <span>by {dept.archivedBy}</span>}
                              {dept.archivedAt && <span className="ml-1">&middot; {new Date(dept.archivedAt).toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric' })}</span>}
                            </div>
                          )}
                          <div className="text-[11px] text-slate-500 font-medium leading-relaxed max-w-70 wrap-break-word mt-0.5">{dept.description || 'No description provided'}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-2 text-sm text-slate-600 font-medium">
                        <UserRound className="w-4 h-4 opacity-40" />
                        {headUser ? (
                          <span className="font-bold text-slate-900">{headUser.name}</span>
                        ) : (
                          <span className="text-slate-400 italic">Not Assigned</span>
                        )}
                      </div>
                    </td>
                     <td className="px-6 py-4 whitespace-nowrap text-center">
                       <span className="font-bold text-slate-700 text-sm">
                         {users.filter(u => 
                           u.departmentId === dept.id && 
                           u.status === 'Active' && 
                           u.certificationExpiry && 
                           u.certificationExpiry >= new Date().toISOString().split('T')[0]
                         ).length}
                       </span>
                     </td>
                     <td className="px-6 py-4 whitespace-nowrap text-center">
                       <span className="font-black text-indigo-600 text-sm">
                         {dept.auditorsRequiredOverride ?? (() => {
                            const assets = dept.totalAssets || 0;
                            if (assets === 0) return 0;
                            const raw = Math.ceil(assets / openAuditThreshold);
                            return Math.max(2, raw * 2);
                         })()}
                       </span>
                     </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-2 text-sm text-slate-600 font-bold">
                        <Boxes className="w-4 h-4 opacity-40" />
                        {(dept.totalAssets || 0).toLocaleString()}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      <span className="font-bold text-slate-900 text-sm">
                        {deptLocationCounts[dept.id] || 0}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-2 flex-wrap">
                        {dept.totalAssets !== undefined && (
                          <div className="px-2 py-0.5 rounded bg-blue-50 text-[9px] text-blue-600 border border-blue-100 font-bold uppercase tracking-tighter">
                            Tier Detected
                          </div>
                        )}
                        {(dept.auditGroupId) && (
                          <span className="px-2 py-0.5 rounded-md bg-indigo-50 text-[9px] text-indigo-600 border border-indigo-100 font-bold flex items-center gap-1" title="Consolidated Audit Group">
                            <Layers className="w-3 h-3" />
                            {auditGroups.find(g => g.id === dept.auditGroupId)?.name || 'Unknown Group'}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-left align-middle">
                      {canManage && (
                        <div className="flex gap-1 justify-start">
                          <button title="Edit department" onClick={() => startEdit(dept)} className="w-9 h-9 flex items-center justify-center bg-white border border-slate-200 text-slate-400 hover:text-blue-600 hover:border-blue-200 rounded-xl transition-colors"><Pencil className="w-4 h-4" /></button>
                          {isArchived ? (
                            <>
                              <button title="Restore department" onClick={() => onUpdate(dept.id, { isArchived: false })} className="w-9 h-9 flex items-center justify-center bg-amber-50 border border-amber-200 text-amber-500 hover:text-amber-700 hover:border-amber-300 rounded-xl transition-colors"><ArchiveRestore className="w-4 h-4" /></button>
                              {isAdmin && (
                                <button title="Purge permanently" onClick={() => setPurgeTarget(dept)} className="w-9 h-9 flex items-center justify-center bg-red-50 border border-red-200 text-red-400 hover:text-red-600 hover:border-red-300 rounded-xl transition-colors"><Flame className="w-4 h-4" /></button>
                              )}
                            </>
                          ) : (
                            <button title="Archive department" onClick={() => onDelete(dept.id)} className="w-9 h-9 flex items-center justify-center bg-white border border-slate-200 text-slate-400 hover:text-amber-600 hover:border-amber-200 rounded-xl transition-colors"><Archive className="w-4 h-4" /></button>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
              {(!visibleDepts || visibleDepts.length === 0) && (
                <tr><td colSpan={8} className="px-6 py-12 text-center text-slate-400"><div className="w-12 h-12 bg-slate-50 rounded-2xl flex items-center justify-center mx-auto mb-3"><Layers className="w-6 h-6" /></div>No departments defined.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <DepartmentModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSave={handleSave}
        initialData={editingDept}
        users={users}
        isAdmin={isAdmin}
        isCoordinator={isCoordinator}
        auditGroups={auditGroups}
      />

      <PurgeConfirmModal
        isOpen={purgeTarget !== null}
        onClose={() => setPurgeTarget(null)}
        onConfirm={() => { if (purgeTarget) onPurge(purgeTarget.id); }}
        itemType="department"
        itemName={purgeTarget?.name ?? ''}
        archivedBy={purgeTarget?.archivedBy}
        archivedAt={purgeTarget?.archivedAt}
      />
    </div>
  );
};