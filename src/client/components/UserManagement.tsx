
import React, { useState, useMemo, useRef } from 'react';
import Papa from 'papaparse';
import { User, UserRole, Department } from '@shared/types';
import { hasCapability, CAP_MANAGE_CERTS } from '../lib/pbacUtils';
import { IssueCertificateModal } from './IssueCertificateModal';
import { gateway } from '../services/dataGateway';
import { Filter, Plus, User as UserIcon, Check, X, Award, Stamp, Pencil, Trash2, Key, ChevronDown, Printer } from 'lucide-react';
import { AuditPhase } from '@shared/types';

interface UserManagementProps {
  users: User[];
  onAddMember: (user: User) => void;
  onBulkAddMembers: (users: User[]) => void;
  onUpdateMember: (id: string, user: Partial<User>) => void;
  onDeleteMember: (id: string) => void;
  onUpdateRoles: (userId: string, newRoles: string[]) => void;
  onUpdateStatus: (userId: string, status: 'Active' | 'Inactive' | 'Suspended' | 'Pending') => void;
  onResetPassword: (userId: string) => void;
  currentUserRoles: string[];
  departments: Department[];
  customConfirm: (title: string, message: string, onConfirm: () => void, isDestructive?: boolean) => void;
  customAlert: (message: string) => void;
  phases?: AuditPhase[];
  selectedDeptFilter?: string;
  onDeptFilterChange?: (deptId: string) => void;
  currentUserId?: string;
}

export const UserManagement: React.FC<UserManagementProps> = ({ 
  users, onAddMember, onBulkAddMembers, onUpdateMember, onDeleteMember, onUpdateRoles, onUpdateStatus, onResetPassword, currentUserRoles, departments, customConfirm, customAlert, phases = [], selectedDeptFilter: propSelectedDeptFilter, onDeptFilterChange, currentUserId 
}) => {
  // ── PBAC capability checks ───────────────────────────────────────────
  const currentUserData = users.find(u => u.id === currentUserId);
  const pbacUser = currentUserData ? { roles: currentUserData.roles, qualifications: currentUserData.qualifications, certificationExpiry: currentUserData.certificationExpiry, departmentId: currentUserData.departmentId } : { roles: [] as string[], qualifications: [] as string[], certificationExpiry: null as string | null, departmentId: null as string | null };

  const isAdmin = hasCapability(pbacUser, 'system:admin');
  const canViewAll = isAdmin;                              // Admin sees all users
  const canViewOwn = hasCapability(pbacUser, 'manage:users');  // Coordinators see dept users
  const canEditTeam = hasCapability(pbacUser, 'manage:users');  // Admin/Coordinator can edit
  const canIssueCert = hasCapability(pbacUser, CAP_MANAGE_CERTS); // Admin only

  const [internalSelectedDeptFilter, setInternalSelectedDeptFilter] = useState('All');
  
  const selectedDeptFilter = propSelectedDeptFilter !== undefined ? propSelectedDeptFilter : internalSelectedDeptFilter;
  const setSelectedDeptFilter = (deptId: string) => {
    if (onDeptFilterChange) {
      onDeptFilterChange(deptId);
    } else {
      setInternalSelectedDeptFilter(deptId);
    }
  };

  // ── Pending users ────────────────────────────────────────────────────
  const pendingUsers = useMemo(() => {
    return users.filter(u => u.status === 'Pending')
      .filter(u => selectedDeptFilter === 'All' || u.departmentId === selectedDeptFilter);
  }, [users, selectedDeptFilter]);

  const [selectedStatusFilter, setSelectedStatusFilter] = useState('All');
  const [selectedRoleFilter, setSelectedRoleFilter] = useState('All');
  const [searchName, setSearchName] = useState('');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [certifyingUser, setCertifyingUser] = useState<User | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    departmentId: '',
    roles: ['Guest'] as string[],
    designation: '' as string,
    contactNumber: '',
    qualifications: [] as string[],
  });

  // ── PBAC scoping for filteredUsers ───────────────────────────────────
  const filteredUsers = useMemo(() => {
    return users
      .filter(u => {
          // 1. PBAC Scope Filtering
          if (canViewOwn && !isAdmin) {
              if (u.departmentId !== currentUserData?.departmentId) return false;
          }
          if (!canViewAll && !canViewOwn) return false;

          // 2. Status Filtering
          if (selectedStatusFilter === 'Pending') return u.status === 'Pending';
          if (selectedStatusFilter !== 'All' && u.status !== selectedStatusFilter) return false;
          if (selectedStatusFilter === 'All' && u.status === 'Pending') return false;

          // 3. Dept Filtering
          if (selectedDeptFilter !== 'All' && u.departmentId !== selectedDeptFilter) return false;
          
          // 4. Role Filtering
          if (selectedRoleFilter !== 'All') {
            if (!u.roles.includes(selectedRoleFilter as UserRole)) return false;
          }
          
          // 5. Name Search
          if (searchName.trim()) {
            const q = searchName.trim().toLowerCase();
            if (!u.name?.toLowerCase().includes(q) && !u.email?.toLowerCase().includes(q)) return false;
          }

          // 6. Superadmin Privacy (Safety check in UI)
          if (u.email?.toLowerCase() === 'admin@poliku.edu.my' && currentUserId !== u.id && !users.find(curr => curr.id === currentUserId)?.email?.toLowerCase().includes('admin@poliku.edu.my')) {
              return false;
          }
          
          return true;
      });
  }, [users, selectedDeptFilter, selectedStatusFilter, selectedRoleFilter, searchName, canViewAll, canViewOwn, currentUserData]);

  const handleVerify = async (user: User) => {
      try {
          await gateway.verifyUser(user.id);
          let autoRoles: UserRole[] = ['Guest'];
          if (user.designation === 'Coordinator') autoRoles = ['Coordinator'];
          else if (user.designation === 'Supervisor') autoRoles = ['Supervisor'];
          
          await gateway.updateUser(user.id, { roles: autoRoles, isVerified: true, status: 'Active' });
          onUpdateMember(user.id, { roles: autoRoles, isVerified: true, status: 'Active' });
      } catch (e) {
          console.error("Verification failed", e);
          alert("Failed to verify user.");
      }
  };

  const handleApproveAll = async () => {
    for (const user of pendingUsers) {
      try {
        await gateway.verifyUser(user.id);
        let autoRoles: UserRole[] = ['Guest'];
        if (user.designation === 'Coordinator') autoRoles = ['Coordinator'];
        else if (user.designation === 'Supervisor') autoRoles = ['Supervisor'];
        
        await gateway.updateUser(user.id, { roles: autoRoles, isVerified: true, status: 'Active' });
        onUpdateMember(user.id, { roles: autoRoles, isVerified: true, status: 'Active' });
      } catch (e) {
        console.error(`Failed to approve ${user.name}`, e);
      }
    }
  };

  const getCertStatus = (expiry?: string) => {
    if (!expiry) return { label: 'None', color: 'bg-slate-100 text-slate-400' };
    const diff = new Date(expiry).getTime() - new Date().getTime();
    const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
    if (days <= 0) return { label: 'Expired', color: 'bg-rose-100 text-rose-600 border-rose-200' };
    if (days <= 30) return { label: `${days}d Left`, color: 'bg-amber-100 text-amber-600 border-amber-200' };
    return { label: 'Valid', color: 'bg-blue-100 text-blue-600 border-blue-200' };
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const newUsers: User[] = [];
        results.data.forEach((row: any) => {
          const id = row['StaffId'] || row['id'] || row['ID'] || crypto.randomUUID();
          const name = row['Name'] || row['name'];
          const email = row['Email'] || row['email'];
          
          if (name && email) {
            const rawDept = String(row['Department'] || row['department'] || '').trim().toLowerCase();
            const targetDept = departments.find(d => 
              d.id === rawDept || 
              d.abbr?.toLowerCase() === rawDept || 
              d.name.toLowerCase() === rawDept ||
              (rawDept === 'jka' && d.name.toLowerCase() === 'jabatan kejuruteraan awam') ||
              (rawDept === 'jke' && d.name.toLowerCase() === 'jabatan kejuruteraan elektrik')
            );

            newUsers.push({
              id,
              name, email,
              departmentId: targetDept?.id || '',
              roles: [(row['Role'] || row['role'] || 'Guest').split(',')[0].trim()] as UserRole[],

              status: 'Active',
              lastActive: new Date().toISOString(),
              isVerified: true 
            });
          }
        });
        if (newUsers?.length > 0) onBulkAddMembers(newUsers);
      }
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Enforcement: Domain check
    const allowedDomain = 'poliku.edu.my';
    if (!formData.email.toLowerCase().endsWith(`@${allowedDomain}`)) {
      customAlert(`Access restricted. Only emails from the @${allowedDomain} domain are allowed.`);
      return;
    }

    // Enforcement: Duplicate check
    const isDuplicate = users.some(u => u.email.toLowerCase() === formData.email.toLowerCase() && u.id !== editingId);
    if (isDuplicate) {
      customAlert(`The email ${formData.email} is already registered to another team member.`);
      return;
    }

    const assignedRoles = formData.roles;

    if (editingId) {
      // Editing existing user
      // Pass the current state to ensure email is included for the gateway fallback logic
      const currentUserState = users.find(u => u.id === editingId);
      onUpdateMember(editingId, { ...formData, email: formData.email || currentUserState?.email } as Partial<User>);
      setEditingId(null);
    } else {
      onAddMember({ 
        id: crypto.randomUUID(), // This will be overwritten by Supabase if registering, but for local state it needs an ID
        name: formData.name,
        email: formData.email,
        departmentId: formData.departmentId,
        designation: formData.designation as any,
        roles: assignedRoles,
        contactNumber: formData.contactNumber,
        status: 'Active', 
        lastActive: new Date().toISOString(),
        isVerified: true
      });
    }
    resetForm();
  };

  const resetForm = () => {
    const deptId = (!isAdmin && currentUserData?.departmentId) ? currentUserData.departmentId : '';
    setFormData({ name: '', email: '', departmentId: deptId, roles: ['Guest'] as string[], designation: '', contactNumber: '', qualifications: [] as string[] });
    setIsFormOpen(false);
    setEditingId(null);
  };



  const getRoleBadgeStyle = (role: string) => {
    switch(role) {
      case 'Admin': return 'bg-purple-50 text-purple-600 border-purple-100';
      case 'Coordinator': return 'bg-amber-50 text-amber-600 border-amber-100';
      case 'Supervisor': return 'bg-indigo-50 text-indigo-600 border-indigo-100';
      case 'Staff':
      case 'Guest': return 'bg-slate-50 text-slate-500 border-slate-100';
      default: return 'bg-blue-50 text-blue-600 border-blue-100';
    }
  };

  const startEdit = (user: User) => {
    setEditingId(user.id);
    // Derive the correct role from designation (not DB) to prevent
    // designation/role drift caused by prior profile saves with wrong defaults.
    const bound = (() => {
      switch (user.designation) {
        case 'Coordinator': return 'Coordinator';
        case 'Supervisor': return 'Supervisor';
        case 'Head Of Department':
        case 'Head Of Programme':
        default: return 'Guest';
      }
    })();
    const dbRole = (user.roles && user.roles.length > 0) ? user.roles[0] : 'Guest';
    // If DB role doesn't match designation binding, use the bound role
    const role = (dbRole !== bound && bound !== 'Guest') ? bound : dbRole;
    const initialQuals = user.qualifications ? user.qualifications.filter(q => q !== 'Inspector') : [];
    const todayStr = new Date().toISOString().split('T')[0];
    const isCertValid = !!user.certificationExpiry && user.certificationExpiry >= todayStr;
    if (isCertValid) {
      initialQuals.push('Inspector');
    }
    setFormData({
      name: user.name || '',
      email: user.email || '',
      departmentId: user.departmentId || '',
      roles: [role],
      designation: user.designation || '',
      contactNumber: user.contactNumber || '',
      qualifications: initialQuals,
    });
    setIsFormOpen(true);
  };

  const activePhase = useMemo(() => {
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
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-6 pb-6 border-b border-slate-100">
        <div>
          <h3 className="text-2xl font-black text-slate-900 tracking-tight">Institutional Team</h3>
          <p className="text-slate-500 text-sm mt-1">Manage credentials, certification status, and access levels.</p>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          {canEditTeam && (
            <button 
              onClick={() => { resetForm(); setIsFormOpen(true); }}
              className="group px-8 py-3.5 bg-slate-900 text-white rounded-[20px] text-xs font-black uppercase tracking-widest shadow-2xl shadow-slate-900/10 hover:bg-blue-600 hover:-translate-y-1 transition-all flex items-center gap-3 active:scale-95"
            >
              <div className="w-6 h-6 rounded-lg bg-white/10 flex items-center justify-center group-hover:bg-white/20 transition-colors">
                 <Plus className="w-4 h-4" />
              </div>
              Add New User
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-col lg:flex-row lg:items-center justify-end gap-3">
          <div className="flex items-center gap-2 text-[10px] font-black text-slate-400 uppercase tracking-widest mr-auto">
             <Filter className="w-3.5 h-3.5" />
             Quick Filters:
          </div>
          
          <div className="flex items-center gap-3 flex-wrap">
            <input
              type="text"
              placeholder="Search by name or email…"
              value={searchName}
              onChange={(e) => setSearchName(e.target.value)}
              className="pl-4 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold shadow-sm outline-none hover:border-blue-300 focus:border-blue-400 transition-colors min-w-52"
            />
            <div className="relative min-w-40">
              <select
                title="Status Filter"
                className="w-full pl-4 pr-10 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold shadow-sm appearance-none outline-none hover:border-blue-300 transition-colors cursor-pointer"
                value={selectedStatusFilter}
                onChange={(e) => setSelectedStatusFilter(e.target.value)}
              >
                <option value="All">All Status Levels</option>
                <option value="Active">Active Duty</option>
                <option value="Inactive">Inactive</option>
                <option value="Pending">Pending Approval</option>
                <option value="Suspended">Suspended</option>
              </select>
              <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 w-3 h-3 pointer-events-none" />
            </div>

            <div className="relative min-w-45">
              <select
                title="Role Filter"
                className="w-full pl-4 pr-10 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold shadow-sm appearance-none outline-none hover:border-blue-300 transition-colors cursor-pointer"
                value={selectedRoleFilter}
                onChange={(e) => setSelectedRoleFilter(e.target.value)}
              >
                <option value="All">All Access Roles</option>
                <option value="Admin">Admin</option>
                <option value="Coordinator">Coordinator</option>
                <option value="Supervisor">Supervisor</option>
                <option value="Guest">Staff</option>
              </select>
              <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 w-3 h-3 pointer-events-none" />
            </div>

            <div className="relative min-w-55">
              <select
                title="Department Filter"
                className="w-full pl-4 pr-10 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold shadow-sm appearance-none outline-none hover:border-blue-300 transition-colors cursor-pointer"
                value={selectedDeptFilter}
                onChange={(e) => setSelectedDeptFilter(e.target.value)}
              >
                <option value="All">All Institutional Departments</option>
                {departments.map(d => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 w-3 h-3 pointer-events-none" />
            </div>
          </div>
      </div>

      {/* Pending Approvals Section for Admins */}
      {isAdmin && pendingUsers?.length > 0 && selectedStatusFilter !== 'Pending' && (
          <div className="bg-amber-50 rounded-3xl p-6 border border-amber-100 shadow-sm animate-in fade-in slide-in-from-top-2">
              <div className="flex items-center gap-3 mb-4">
                  <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center text-amber-600 border border-amber-200">
                      <UserIcon className="w-4 h-4" />
                  </div>
                  <h4 className="font-black text-amber-800 uppercase text-xs tracking-widest">Pending Approvals ({pendingUsers?.length || 0})</h4>
                  <button
                    onClick={handleApproveAll}
                    className="ml-auto px-4 py-1.5 bg-emerald-600 text-white rounded-xl text-xs font-bold shadow-sm hover:bg-emerald-700 active:scale-95 transition-all flex items-center gap-1.5"
                  >
                    <Check className="w-3.5 h-3.5" />Approve All
                  </button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {pendingUsers.map(user => (
                      <div key={user.id} className="bg-white p-4 rounded-xl border border-amber-200 shadow-sm flex items-center justify-between">
                          <div className="min-w-0">
                              <p className="font-bold text-slate-900 text-sm truncate">{user.name}</p>
                              <div className="flex items-center gap-2 mt-1">
                                  <span className="text-[9px] text-slate-500 truncate">{user.designation} • {departments.find(d => d.id === user.departmentId)?.name || user.departmentId}</span>
                              </div>
                          </div>
                          <div className="flex gap-2">
                              <button 
                                  onClick={() => startEdit(user)}
                                  className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 flex items-center justify-center transition-all active:scale-95"
                                  title="Edit & Verify"
                              >
                                  <Pencil className="w-4 h-4" />
                              </button>
                              <button 
                                  onClick={() => handleVerify(user)}
                                  className="w-8 h-8 rounded-lg bg-emerald-500 text-white hover:bg-emerald-600 flex items-center justify-center shadow-lg shadow-emerald-500/20 transition-all active:scale-95"
                                  title="Verify User"
                              >
                                  <Check className="w-4 h-4" />
                              </button>
                              <button 
                                  onClick={() => onDeleteMember(user.id)}
                                  className="w-8 h-8 rounded-lg bg-rose-50 text-rose-600 hover:bg-rose-100 flex items-center justify-center transition-all active:scale-95"
                                  title="Reject"
                              >
                                  <X className="w-4 h-4" />
                              </button>
                          </div>
                      </div>
                  ))}
              </div>
          </div>
      )}

      {isFormOpen && (
        <div className="fixed inset-0 z-100 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="bg-white rounded-[32px] w-full max-w-2xl shadow-2xl border border-slate-100 flex flex-col max-h-[90vh] overflow-hidden animate-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="bg-blue-600 p-6 text-white flex items-center justify-between shrink-0">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center">
                  <UserIcon className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-xl font-bold">{editingId ? 'Edit Team Member' : 'New Member'}</h3>
                  <p className="text-blue-100 text-xs mt-0.5">Manage institutional credentials and access levels.</p>
                </div>
              </div>
              <button 
                onClick={resetForm}                  title="Close form"                className="w-10 h-10 flex items-center justify-center rounded-2xl bg-white/10 hover:bg-white/20 transition-all active:scale-95 text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto">
              <form id="member-form" onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-black uppercase text-slate-400">Full Name</label>
                    <input required title="Full Name" placeholder="Enter full name" className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value.replace(/\b\w/g, c => c.toUpperCase()) })} />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-black uppercase text-slate-400">Email</label>
                    {(() => {
                      const editingUser = editingId ? users.find(u => u.id === editingId) : null;
                      const isGoogleBound = editingUser && editingUser.hasPassword === false;
                      return (
                        <input 
                          required 
                          type="email" 
                          title={isGoogleBound ? "Email is managed by Google — cannot be changed here" : "Email"}
                          placeholder="Enter institutional email" 
                          className={`w-full px-4 py-3 border rounded-xl text-sm ${isGoogleBound ? 'bg-slate-100 text-slate-500 cursor-not-allowed' : 'bg-slate-50 border-slate-200'}`}
                          value={formData.email} 
                          disabled={isGoogleBound}
                          onChange={e => setFormData({ ...formData, email: e.target.value })} 
                        />
                      );
                    })()}
                    {(() => {
                      const editingUser = editingId ? users.find(u => u.id === editingId) : null;
                      if (editingUser && editingUser.hasPassword === false) return (
                        <p className="text-[9px] text-amber-600 font-medium flex items-center gap-1 mt-1">
                          <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
                          Email managed by Google — cannot be changed here
                        </p>
                      );
                      return null;
                    })()}
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-black uppercase text-slate-400">Department</label>
                    <select 
                      required 
                      disabled={!canEditTeam}
                      title="Department" 
                      className={`w-full px-4 py-3 border rounded-xl text-sm ${!canEditTeam ? 'bg-slate-100 cursor-not-allowed text-slate-500' : 'bg-slate-50 border-slate-200'}`} 
                      value={formData.departmentId} 
                      onChange={e => setFormData({ ...formData, departmentId: e.target.value })}
                    >
                      <option value="">Select Dept</option>
                      {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                    </select>
                  </div>                   <div className="space-y-1">
                    <label className="text-[10px] font-black uppercase text-slate-400">Designation</label>
                    <select 
                      required 
                      title="Designation" 
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm" 
                      value={formData.designation} 
                      onChange={e => {
                        const nextDesignation = e.target.value;
                        let autoRole: UserRole = 'Guest';
                        if (nextDesignation === 'Coordinator') autoRole = 'Coordinator';
                        else if (nextDesignation === 'Supervisor') autoRole = 'Supervisor';

                        setFormData(prev => ({ 
                          ...prev, 
                          designation: nextDesignation,
                          roles: [autoRole] as UserRole[]
                        }));
                      }}
                    >
                      <option value="">Select Designation</option>
                      <option value="Head Of Department">Head Of Department</option>
                      <option value="Head Of Programme">Head Of Programme</option>
                      <option value="Coordinator">Coordinator</option>
                      <option value="Supervisor">Supervisor</option>
                      <option value="Staff">Staff</option>
                    </select>
                  </div>
                  <div className="space-y-1 md:col-span-2">
                    <label className="text-[10px] font-black uppercase text-slate-400">Role {!isAdmin && <span className="text-amber-500 ml-1">(auto-bound to designation)</span>}</label>
                    {isAdmin ? (
                    <div className="mt-2 space-y-2">
                      <div className="px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-600">
                        {formData.roles[0] || 'Guest'} <span className="text-[10px] text-slate-400 font-medium">(bound to designation)</span>
                      </div>
                      <label className={`flex items-center gap-2 p-3 rounded-xl border transition-all cursor-pointer w-fit ${
                        formData.roles.includes('Admin')
                        ? 'bg-purple-50 border-purple-200 text-purple-700 shadow-sm' 
                        : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'
                      }`}>
                        <input 
                          type="checkbox" 
                          className="w-4 h-4 text-purple-600 focus:ring-purple-500 border-slate-300 rounded"
                          checked={formData.roles.includes('Admin')}
                          onChange={() => {
                            setFormData(prev => {
                              if (prev.roles.includes('Admin')) {
                                // Demote: find designation-bound role based on current designation
                                let boundRole: UserRole = 'Guest';
                                if (prev.designation === 'Coordinator') boundRole = 'Coordinator';
                                else if (prev.designation === 'Supervisor') boundRole = 'Supervisor';
                                return { ...prev, roles: [boundRole] as UserRole[] };
                              }
                              return { ...prev, roles: ['Admin'] as UserRole[] };
                            });
                          }}
                        />
                        <span className="text-xs font-bold">Promote to Admin</span>
                        <span className="text-[9px] text-purple-400 font-medium">(overrides designation binding)</span>
                      </label>
                    </div>
                    ) : (
                      <div className="mt-2 px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-600">
                        {formData.roles[0] || 'Guest'}
                      </div>
                    )}
                  </div>
                  <div className="space-y-1 md:col-span-2">
                    <label className="text-[10px] font-black uppercase text-slate-400 block mb-2">Qualifications</label>
                    <div className="flex flex-wrap gap-4">
                      <label className={`flex items-center gap-2 p-3 rounded-xl border transition-all cursor-not-allowed opacity-80 ${
                        formData.qualifications.includes('Inspector')
                        ? 'bg-blue-50 border-blue-100 text-blue-600 shadow-sm' 
                        : 'bg-slate-50 border-slate-200 text-slate-400'
                      }`}>
                        <input 
                          type="checkbox" 
                          disabled={true}
                          className="w-4 h-4 text-blue-600 focus:ring-blue-500 border-slate-300 rounded cursor-not-allowed"
                          checked={formData.qualifications.includes('Inspector')}
                          onChange={() => {}}
                        />
                        <span className="text-xs font-bold">Inspecting Officer (Inspector)</span>
                      </label>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-black uppercase text-slate-400">Contact</label>
                    <input title="Contact Number" placeholder="Enter contact number" className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm" value={formData.contactNumber} onChange={e => setFormData({ ...formData, contactNumber: e.target.value })} />
                  </div>

                </div>
              </form>
            </div>

            <div className="p-6 border-t border-slate-100 bg-slate-50/50 flex gap-3 justify-end items-center">
              <button 
                type="button" 
                onClick={resetForm} 
                className="px-6 py-2.5 bg-white border border-slate-200 text-slate-600 rounded-xl text-sm font-bold hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button 
                type="submit" 
                form="member-form"
                className="px-6 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-bold shadow-lg shadow-blue-500/20 hover:bg-blue-700 active:scale-95 transition-all text-center"
              >
                {editingId ? 'Update' : 'Save'} Member
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white rounded-[32px] border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left min-w-225">
            <thead className="bg-slate-50/50 border-b border-slate-100">
              <tr>
                <th className="px-6 py-5 text-[10px] font-black uppercase text-slate-400 tracking-widest">Team Member</th>
                <th className="px-6 py-5 text-[10px] font-black uppercase text-slate-400 tracking-widest">Certification</th>
                <th className="px-6 py-5 text-[10px] font-black uppercase text-slate-400 tracking-widest">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filteredUsers.map(user => {
                const cert = getCertStatus(user.certificationExpiry);
                
                return (
                  <tr key={user.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-slate-400 font-black border border-slate-200">
                          {user.name?.[0] || '?'}
                        </div>
                        <div>
                          <div className="text-sm font-bold text-slate-900">{user.name}</div>
                          <div className="flex items-center gap-1.5 flex-wrap mt-1">
                             {/* Single role badge — bound to designation, or Admin if promoted */}
                             {(() => {
                               const role = (user.roles && user.roles.length > 0) ? user.roles[0] : 'Guest';
                               // Map legacy Guest role to display as Staff
                               const displayRole = role;
                               return (
                                 <span key={displayRole} className={`px-2 py-0.5 rounded text-[8px] font-black uppercase border ${getRoleBadgeStyle(displayRole)}`}>
                                   {displayRole}
                                 </span>
                               );
                             })()}
                             {/* Certification indicator — shown if user has valid cert, regardless of role */}
                             {user.certificationExpiry && user.certificationExpiry >= new Date().toISOString().split('T')[0] && (
                               <span className="px-2 py-0.5 rounded text-[8px] font-black uppercase border bg-emerald-50 text-emerald-600 border-emerald-200">
                                 Inspector
                               </span>
                             )}
                             {/* Inspector Qualification indicator (show in blue if they have the qualification but no active cert) */}
                             {!(user.certificationExpiry && user.certificationExpiry >= new Date().toISOString().split('T')[0]) && user.qualifications && user.qualifications.includes('Inspector') && (
                               <span className="px-2 py-0.5 rounded text-[8px] font-black uppercase border bg-indigo-50 text-indigo-600 border-indigo-200">
                                 Inspector
                               </span>
                             )}
                             <span className="text-[9px] text-slate-400 font-bold uppercase">{user.designation}</span>
                             <span className="text-[9px] text-slate-400 font-bold uppercase">•</span>
                             <span className="text-[9px] text-slate-400 font-bold uppercase">{departments.find(d => d.id === user.departmentId)?.name || user.departmentId}</span>
                           </div>
                           {user.contactNumber && (
                             <div className="flex items-center gap-2 mt-1 text-[9px] text-slate-400 font-bold font-mono">
                               <span className="uppercase text-slate-300">TEL:</span>
                               <span className="text-slate-500">{user.contactNumber}</span>
                             </div>
                           )}
                        </div>
                      </div>
                    </td>

                    <td className="px-6 py-4">
                       <div className={`inline-flex flex-col gap-1`}>
                          <div className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[9px] font-black uppercase border w-fit ${cert.color}`}>
                             <Award className="w-3 h-3" />
                             {cert.label}
                          </div>
                          {user.certificationIssued && (
                            <span className="text-[8px] text-slate-400 font-bold ml-1">Issued: {user.certificationIssued}</span>
                          )}
                          {user.certificationExpiry && (
                            <span className="text-[8px] text-slate-400 font-bold ml-1">Expires: {user.certificationExpiry}</span>
                          )}
                          {user.certificationIssued && !user.certificationExpiry && (
                            <span className="text-[8px] text-rose-500 font-bold ml-1">⚠ No expiry — re-issue cert</span>
                          )}
                       </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        {isAdmin && (
                          <button 
                            onClick={() => setCertifyingUser(user)}
                            className="w-9 h-9 flex items-center justify-center bg-blue-50 text-blue-600 border border-blue-100 rounded-xl hover:bg-blue-600 hover:text-white transition-all shadow-sm"
                            title="Issue Official Institutional Certificate"
                          >
                            <Stamp className="w-4 h-4" />
                          </button>
                        )}
                        {canEditTeam && (
                          <button 
                            onClick={() => onResetPassword(user.id)}
                            className="w-9 h-9 flex items-center justify-center bg-amber-50 text-amber-600 border border-amber-100 rounded-xl hover:bg-amber-600 hover:text-white transition-all shadow-sm"
                            title="Reset to default password"
                          >
                            <Key className="w-4 h-4" />
                          </button>
                        )}
                        {canEditTeam && (
                          <>
                            <button 
                              onClick={() => startEdit(user)}
                              title="Edit member"
                              className="w-9 h-9 flex items-center justify-center bg-white border border-slate-200 text-slate-400 hover:text-blue-600 rounded-xl transition-all"
                            >
                              <Pencil className="w-4 h-4" />
                            </button>
                            <button 
                              onClick={() => onDeleteMember(user.id)}
                              title="Delete member"
                              className="w-9 h-9 flex items-center justify-center bg-white border border-slate-200 text-slate-400 hover:text-red-600 rounded-xl transition-all"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {certifyingUser && (
        <IssueCertificateModal 
          user={certifyingUser}
          onClose={() => setCertifyingUser(null)}
          onIssue={(issued, expiry) => {
            onUpdateMember(certifyingUser.id, { 
              certificationIssued: issued,
              certificationExpiry: expiry 
            });
            setCertifyingUser(null);
          }}
          onRevoke={() => {
            customConfirm(
              'Revoke Certificate',
              `Revoke the institutional certificate for ${certifyingUser.name}? This cannot be undone.`,
              () => {
                onUpdateMember(certifyingUser.id, { 
                  certificationIssued: null as any, 
                  certificationExpiry: null as any 
                });
                setCertifyingUser(null);
              }
            );
          }}
        />
      )}
    </div>
  );
};
