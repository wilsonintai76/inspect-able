
import React, { useState, useMemo, useEffect } from 'react';
import { User, Department, UserRole } from '@shared/types';
import { Mail, CheckCircle2, User as UserIcon, Phone, Info, Loader2, Award, AlertCircle, RotateCw, Shield, KeyRound, Link2, ExternalLink, Unlink } from 'lucide-react';
import { hasCapability } from '../lib/pbacUtils';

interface UserProfileProps {
  user: User;
  departments: Department[];
  onUpdate: (id: string, data: Partial<User>) => Promise<void> | void;
}

export const UserProfile: React.FC<UserProfileProps> = ({ user, departments, onUpdate }) => {
  const [formData, setFormData] = useState<{ name: string; contactNumber: string; departmentId: string; designation: string }>({
    name: user.name || '',
    contactNumber: user.contactNumber || '',
    departmentId: user.departmentId || '',
    designation: user.designation || 'Staff',
  });
  const [passwordData, setPasswordData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const isAdmin = hasCapability(user, 'system:admin');

  // ── Connected OAuth accounts ───────────────────────────────────────────────
  type LinkedAccount = { provider: string; provider_email: string; created_at: string };
  const [linkedAccounts, setLinkedAccounts] = useState<LinkedAccount[] | null>(null);

  useEffect(() => {
    const token = localStorage.getItem('asset_audit_pro_token');
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    fetch('/api/auth/accounts', { credentials: 'include', headers })
      .then(r => r.json())
      .then((d: any) => setLinkedAccounts(d.success ? d.accounts : []))
      .catch(() => setLinkedAccounts([]));
  }, [user.id]);

  // If department and contact and designation are filled, the user has completed their profile
  const isProfileComplete = Boolean(user.departmentId && user.contactNumber && user.designation);


  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    setIsSaving(true);
    
    try {
      const updates: Partial<User> = { 
        ...formData
      } as Partial<User>;
      
      if (user.status === 'Pending') {
        updates.status = 'Active';
      }
      
      await onUpdate(user.id, updates);
      
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 3000);
    } catch (e) {
      // Error is handled by App.tsx showError, we just stop the saving state here
    } finally {
      setIsSaving(false);
    }
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError(null);
    setPasswordSuccess(false);

    if (passwordData.newPassword !== passwordData.confirmPassword) {
      setPasswordError('New passwords do not match');
      return;
    }

    if (passwordData.newPassword.length < 8) {
      setPasswordError('Password must be at least 8 characters');
      return;
    }

    setIsChangingPassword(true);
    try {
      // We use the standard onUpdate but specifically pass the new password
      // The backend will handle the hashing
      await onUpdate(user.id, { 
        password: passwordData.newPassword,
        mustChangePIN: false
      } as any);
      
      setPasswordSuccess(true);
      setPasswordData({ currentPassword: '', newPassword: '', confirmPassword: '' });
      setTimeout(() => setPasswordSuccess(false), 5000);
    } catch (err: any) {
      setPasswordError(err.message || 'Failed to update password');
    } finally {
      setIsChangingPassword(false);
    }
  };


  const certStatus = useMemo(() => {
    if (!user.certificationExpiry) return 'Uncertified';
    const expiry = new Date(user.certificationExpiry);
    const today = new Date();
    return expiry > today ? 'Valid' : 'Expired';
  }, [user.certificationExpiry]);

  return (
    <div className="max-w-3xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500 pb-20">
      <div className="bg-white rounded-[32px] border border-slate-200 shadow-sm overflow-hidden">
        <div className="h-32 bg-linear-to-r from-blue-600 to-indigo-700 relative">
          <div className="absolute -bottom-12 left-8 p-1 bg-white rounded-3xl shadow-xl">
            {user.picture ? (
              <img src={user.picture} className="w-24 h-24 rounded-2xl object-cover" alt="Profile" />
            ) : (
              <div className="w-24 h-24 bg-blue-600 rounded-2xl flex items-center justify-center text-white text-3xl font-black">
                {user.name[0]}
              </div>
            )}
          </div>
        </div>

        <div className="pt-16 pb-8 px-8">
          {user.status === 'Pending' && !isProfileComplete && (
            <div className="mb-6 flex items-start gap-4 p-4 bg-amber-50 border border-amber-200 rounded-2xl">
              <div className="w-9 h-9 rounded-xl bg-amber-100 flex items-center justify-center text-amber-600 shrink-0">
                <Info className="w-5 h-5" />
              </div>
              <div>
                <p className="text-sm font-black text-amber-800">Account Pending Approval</p>
                <p className="text-xs text-amber-700 mt-0.5">Your account is currently pending administrator approval. Please complete your profile details below to continue.</p>
              </div>
            </div>
          )}
          <div className="flex justify-between items-start mb-8">
            <div>
              <h2 className="text-2xl font-black text-slate-900">{user.name}</h2>
              <p className="text-slate-500 font-medium flex items-center gap-2">
                <Mail className="w-3 h-3 text-blue-500" />
                {user.email}
              </p>
              {isProfileComplete && (
                <p className="text-slate-500 font-medium flex items-center gap-2 mt-1">
                  <Phone className="w-3 h-3 text-blue-500" />
                  {user.contactNumber}
                </p>
              )}
            </div>
            <div className="px-3 py-1 bg-emerald-50 text-emerald-600 border border-emerald-100 rounded-full text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5">
              <CheckCircle2 className="w-3 h-3" />
              Verified Institutional Account
            </div>
          </div>

          <div className="grid lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2">
              <form onSubmit={handleSubmit} className="space-y-6">
                {isProfileComplete && (
                  <div className="mb-6 flex items-start gap-4 p-4 bg-emerald-50/80 border border-emerald-100/80 rounded-2xl animate-in fade-in duration-300">
                    <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center text-emerald-600 shrink-0">
                      <CheckCircle2 className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-emerald-900 mb-0.5">Profile Completed</h4>
                      <p className="text-xs text-emerald-700/80 leading-relaxed font-medium">
                        Your profile has been fully set up. If you need to change your Official Name, Department, or Designation, please contact the system administrator.
                      </p>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest block">Official Display Name</label>
                    <div className="relative group">
                      <UserIcon className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4 transition-colors group-focus-within:text-blue-500" />
                      <input 
                        required
                        type="text"
                        readOnly={isProfileComplete ? !isAdmin : !isAdmin}
                        className={`w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-semibold focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 outline-none transition-all ${(isProfileComplete && !isAdmin) ? 'opacity-70 cursor-not-allowed bg-slate-100' : ''}`}
                        placeholder="Enter your full legal name"
                        value={formData.name}
                        onChange={e => setFormData({ ...formData, name: e.target.value })}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest block">Personal Contact Number</label>
                    <div className="relative group">
                      <Phone className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4 transition-colors group-focus-within:text-blue-500" />
                      <input 
                        required
                        type="tel"
                        className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-semibold focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 outline-none transition-all"
                        placeholder="+1 (555) 000-0000"
                        value={formData.contactNumber}
                        onChange={e => setFormData({ ...formData, contactNumber: e.target.value })}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest block">Designation</label>
                    <div className="relative group">
                      <select 
                        title="Designation"
                        required
                        disabled={isProfileComplete && !isAdmin}
                        className={`w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-semibold focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 outline-none transition-all appearance-none ${(isProfileComplete && !isAdmin) ? 'opacity-70 cursor-not-allowed bg-slate-100' : ''}`}
                        value={formData.designation}
                        onChange={e => setFormData({ ...formData, designation: e.target.value })}
                      >
                        <option value="Staff">Staff</option>
                        <option value="Supervisor">Supervisor</option>
                        <option value="Coordinator">Coordinator</option>
                        <option value="Head Of Department">Head Of Department</option>
                        {user.email?.toLowerCase() === 'admin@poliku.edu.my' && <option value="Developer">Developer</option>}
                      </select>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest block">Department</label>
                    <div className="relative group">
                      <select 
                        title="Department"
                        required
                        disabled={isProfileComplete && !isAdmin}
                        className={`w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-semibold focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 outline-none transition-all appearance-none ${(isProfileComplete && !isAdmin) ? 'opacity-70 cursor-not-allowed bg-slate-100' : ''}`}
                        value={formData.departmentId}
                        onChange={e => setFormData({ ...formData, departmentId: e.target.value })}
                      >
                        <option value="">Select Department</option>
                        {departments.map(d => (
                          <option key={d.id} value={d.id}>{d.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>

                <div className="bg-blue-50/50 rounded-2xl p-4 border border-blue-100/50 flex items-start gap-4">
                  <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center text-blue-600 shrink-0">
                    <Info className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-blue-900 mb-1">Account Metadata</h4>
                    <p className="text-[10px] text-blue-700/70 leading-relaxed font-medium">
                      Assigned Department: <strong>{departments.find(d => d.id === user.departmentId)?.name || 'General'}</strong><br/>
                      Designation: <strong>{user.designation || 'Staff'}</strong><br/>
                      Roles: <strong>{user.roles.join(', ')}</strong><br/>
                      Last Login: <strong>{user.lastActive}</strong>
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-4 pt-4 border-t border-slate-100">
                  <button 
                    type="submit"
                    disabled={isSaving}
                    className="flex items-center gap-3 px-8 py-3.5 bg-slate-900 text-white rounded-2xl text-sm font-bold hover:bg-slate-800 transition-all shadow-xl shadow-slate-900/10 active:scale-95 disabled:opacity-50"
                  >
                    {isSaving ? (
                      <><Loader2 className="w-4 h-4 animate-spin" /> Processing...</>
                    ) : (
                      <>{isProfileComplete ? 'Save Profile Updates' : 'Complete Profile Setup'}</>
                    )}
                  </button>
                  
                  {showSuccess && (
                    <div className="flex items-center gap-2 text-emerald-600 text-sm font-bold animate-in fade-in slide-in-from-left-2">
                      <CheckCircle2 className="w-4 h-4" />
                      Profile updated successfully
                    </div>
                  )}
                </div>
              </form>
            </div>

            <div className="space-y-6">
               {/* Certification Section */}
               <div className="bg-slate-50 rounded-3xl p-6 border border-slate-200">
                  <h4 className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-4">Certification Management</h4>
                  <div className="flex flex-col gap-4">
                    <div className="p-4 bg-white rounded-2xl border border-slate-100 shadow-sm">
                       <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Status</p>
                       <div className="flex items-center justify-between">
                         <span className={`text-sm font-black uppercase tracking-tight ${certStatus === 'Valid' ? 'text-emerald-600' : 'text-rose-600'}`}>
                           {certStatus}
                         </span>
                         {certStatus === 'Valid' ? <Award className="w-5 h-5 text-blue-500" /> : <AlertCircle className="w-5 h-5 text-rose-500" />}
                       </div>
                    </div>

                    <div className="grid grid-cols-1 gap-4">
                      <div className="p-4 bg-white rounded-2xl border border-slate-100 shadow-sm">
                        <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Issued Date</p>
                        <p className="text-sm font-black text-slate-900 font-mono">{user.certificationIssued || 'N/A'}</p>
                      </div>
                      <div className="p-4 bg-white rounded-2xl border border-slate-100 shadow-sm">
                        <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Expiry Date</p>
                        <p className="text-sm font-black text-slate-900 font-mono">{user.certificationExpiry || 'N/A'}</p>
                      </div>
                    </div>

                     <div className="mt-2 p-4 bg-blue-50/50 rounded-2xl border border-blue-100 flex items-start gap-3">
                        <Shield className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
                        <p className="text-[10px] text-blue-700 font-medium leading-relaxed">
                          Certification renewal and issuance is managed exclusively by the <strong>System Administrator</strong>.
                        </p>
                     </div>
                  </div>
               </div>
            </div>
          </div>

          {/* Security Section (New) */}
          <div className="mt-12 pt-12 border-t border-slate-100">
            <div className="flex items-center gap-3 mb-8">
              <div className="w-10 h-10 rounded-xl bg-slate-900 flex items-center justify-center text-white">
                <KeyRound className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-slate-900">Access & Security</h3>
                <p className="text-sm text-slate-500 font-medium">Manage your institutional credentials.</p>
              </div>
            </div>

            <form onSubmit={handlePasswordChange} className="grid md:grid-cols-2 gap-8 items-start">
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest block">New Password</label>
                  <input 
                    required
                    type="password"
                    placeholder="Min. 8 characters"
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-semibold focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 outline-none transition-all"
                    value={passwordData.newPassword}
                    onChange={e => setPasswordData({ ...passwordData, newPassword: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest block">Confirm New Password</label>
                  <input 
                    required
                    type="password"
                    placeholder="Repeat new password"
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-semibold focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 outline-none transition-all"
                    value={passwordData.confirmPassword}
                    onChange={e => setPasswordData({ ...passwordData, confirmPassword: e.target.value })}
                  />
                </div>

                {passwordError && (
                  <div className="p-3 bg-rose-50 border border-rose-100 rounded-xl flex items-center gap-2 text-rose-600 text-[10px] font-bold">
                    <AlertCircle className="w-4 h-4" />
                    {passwordError}
                  </div>
                )}

                {passwordSuccess && (
                  <div className="p-3 bg-emerald-50 border border-emerald-100 rounded-xl flex items-center gap-2 text-emerald-600 text-[10px] font-bold">
                    <CheckCircle2 className="w-4 h-4" />
                    Password updated successfully
                  </div>
                )}

                <button 
                  type="submit"
                  disabled={isChangingPassword}
                  className="flex items-center justify-center gap-2 px-6 py-3 bg-slate-100 text-slate-900 rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-slate-900 hover:text-white transition-all active:scale-95 disabled:opacity-50"
                >
                  {isChangingPassword ? <Loader2 className="w-3 h-3 animate-spin" /> : <RotateCw className="w-3 h-3" />}
                  Update Credentials
                </button>
              </div>

              <div className="bg-slate-50/50 rounded-3xl p-6 border border-slate-100 self-center">
                 <div className="flex items-center gap-3 mb-4">
                    <Shield className="w-5 h-5 text-blue-500" />
                    <h4 className="text-xs font-black text-slate-900 uppercase">Credential Policy</h4>
                 </div>
                 <ul className="space-y-3">
                   <li className="flex items-start gap-2 text-[10px] text-slate-500 font-medium leading-relaxed">
                     <span className="w-1.5 h-1.5 rounded-full bg-blue-400 mt-1 shrink-0" />
                     Passwords must contain at least 8 characters.
                   </li>
                   <li className="flex items-start gap-2 text-[10px] text-slate-500 font-medium leading-relaxed">
                     <span className="w-1.5 h-1.5 rounded-full bg-blue-400 mt-1 shrink-0" />
                     Updating your password will require forced re-login on other devices.
                   </li>
                   <li className="flex items-start gap-2 text-[10px] text-slate-500 font-medium leading-relaxed">
                     <span className="w-1.5 h-1.5 rounded-full bg-blue-400 mt-1 shrink-0" />
                     If you forget your password, contact a <strong>System Administrator</strong> to initiate a recovery reset.
                   </li>
                 </ul>
              </div>
            </form>
          </div>

        </div>
      </div>

      {/* ── Connected Accounts ──────────────────────────────────────────────── */}
      <div className="mt-6 bg-white rounded-[32px] border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-8 py-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600">
              <Link2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">Connected Accounts</h3>
              <p className="text-xs text-slate-500 font-medium">Link your institutional Google Workspace account for single sign-on.</p>
            </div>
          </div>

          {linkedAccounts === null ? (
            <div className="flex items-center gap-2 text-slate-400 text-sm py-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              Loading...
            </div>
          ) : (() => {
            const google = linkedAccounts.find(a => a.provider === 'google');
            return google ? (
              <div className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-200">
                <div className="flex items-center gap-4">
                  {/* Google G logo */}
                  <div className="w-10 h-10 rounded-xl bg-white border border-slate-200 flex items-center justify-center shadow-sm shrink-0">
                    <svg className="w-5 h-5" viewBox="0 0 48 48" aria-hidden="true">
                      <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v8.5h12.7c-.6 3-2.3 5.5-4.9 7.2v6h7.9c4.6-4.3 7.8-10.6 7.8-17.2z"/>
                      <path fill="#34A853" d="M24 48c6.5 0 12-2.2 16-5.8l-7.9-6c-2.2 1.5-5 2.3-8.1 2.3-6.2 0-11.5-4.2-13.4-9.9H2.4v6.2C6.4 42.5 14.6 48 24 48z"/>
                      <path fill="#FBBC04" d="M10.6 28.6c-.5-1.5-.8-3-.8-4.6s.3-3.1.8-4.6v-6.2H2.4C.9 16.5 0 20.1 0 24s.9 7.5 2.4 10.8l8.2-6.2z"/>
                      <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.5l6.8-6.8C35.9 2.5 30.4 0 24 0 14.6 0 6.4 5.5 2.4 13.2l8.2 6.2c1.9-5.7 7.2-9.9 13.4-9.9z"/>
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-900">Google Workspace</p>
                    <p className="text-xs text-slate-500 font-medium">{google.provider_email}</p>
                    <p className="text-[10px] text-slate-400 font-medium mt-0.5">
                      Linked on {new Date(google.created_at).toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </p>
                  </div>
                </div>
                <a
                  href="https://myaccount.google.com/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 px-4 py-2 bg-white border border-slate-200 rounded-xl text-[11px] font-bold text-slate-600 hover:text-blue-600 hover:border-blue-200 transition-colors"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  Manage
                </a>
              </div>
            ) : (
              <div className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-200 border-dashed">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center shrink-0">
                    <Unlink className="w-4 h-4 text-slate-400" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-700">Google Workspace</p>
                    <p className="text-xs text-slate-400 font-medium">Not connected &mdash; @poliku.edu.my accounts only</p>
                  </div>
                </div>
                <a
                  href={`/api/auth/google?returnTo=${encodeURIComponent(window.location.origin)}`}
                  className="flex items-center gap-1.5 px-4 py-2.5 bg-slate-900 text-white rounded-xl text-[11px] font-bold hover:bg-slate-700 transition-colors"
                >
                  <Link2 className="w-3.5 h-3.5" />
                  Connect
                </a>
              </div>
            );
          })()}
        </div>
      </div>

      <div className="mt-6 bg-slate-900 rounded-[32px] p-8 text-white relative overflow-hidden shadow-2xl">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="max-w-md">
            <h3 className="text-xl font-bold mb-2">Institutional Security</h3>
            <p className="text-slate-400 text-sm leading-relaxed">
              Certification ensures you remain compliant with JKE and Kamsis institutional inspection standards.
            </p>
          </div>
          <button className="px-6 py-3 bg-white/10 hover:bg-white/20 rounded-xl text-xs font-black uppercase tracking-widest transition-all">
            Audit Logs
          </button>
        </div>
        <Shield className="absolute -right-4 -bottom-4 text-white/5 w-40 h-40 pointer-events-none" />
      </div>
    </div>
  );
};
