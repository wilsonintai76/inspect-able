import React, { useState } from 'react';
import { 
  ShieldCheck, 
  Key, 
  UserCheck 
} from 'lucide-react';
import { User } from '@shared/types';
import { ToastContainer, ToastMessage } from './Toast';
import { IssueCertificateModal } from './IssueCertificateModal';
import { gateway } from '../services/dataGateway';

interface GlobalModalsProps {
  confirmState: any;
  setConfirmState: (state: any) => void;
  toasts: ToastMessage[];
  closeToast: (id: string) => void;
  certRenewalModalUser: User | null;
  setCertRenewalModalUser: (user: User | null) => void;
  handleIssueCertForRenewal: (issuedDate: string, expiryDate: string) => Promise<void>;
  showForcePasswordModal: boolean;
  setShowForcePasswordModal: (show: boolean) => void;
  currentUser: User | null;
  setCurrentUser: (user: User | null) => void;
  showProfileCompleteModal: boolean;
  setShowProfileCompleteModal: (show: boolean) => void;
  setActiveView: (view: any) => void;
  setViewState: (state: any) => void;
  showToast: (message: string, type?: any) => void;
  showError: (error: any, title?: string) => void;
}

export const GlobalModals: React.FC<GlobalModalsProps> = ({
  confirmState,
  setConfirmState,
  toasts,
  closeToast,
  certRenewalModalUser,
  setCertRenewalModalUser,
  handleIssueCertForRenewal,
  showForcePasswordModal,
  setShowForcePasswordModal,
  currentUser,
  setCurrentUser,
  showProfileCompleteModal,
  setShowProfileCompleteModal,
  setActiveView,
  setViewState,
  showToast,
  showError
}) => {
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);
  const [newPassword, setNewPassword] = useState('');

  return (
    <>
      {/* Custom Confirm Modal */}
      {confirmState && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white rounded-3xl p-6 max-w-sm w-full shadow-2xl animate-in zoom-in-95">
            <h3 className="text-lg font-bold text-slate-900 mb-2">{confirmState.title}</h3>
            <p className="text-sm text-slate-600 mb-6">{confirmState.message}</p>
            <div className="flex gap-3 justify-end">
              {confirmState.isDestructive !== false && (
                <button
                  onClick={() => setConfirmState(null)}
                  className="px-4 py-2 text-sm font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors"
                >
                  Cancel
                </button>
              )}
              <button
                onClick={() => {
                  confirmState.onConfirm();
                  setConfirmState(null);
                }}
                className={`px-4 py-2 text-sm font-bold text-white rounded-xl transition-colors ${confirmState.isDestructive === false ? 'bg-blue-600 hover:bg-blue-700 w-full' : 'bg-red-600 hover:bg-red-700'
                  }`}
              >
                {confirmState.isDestructive === false ? 'OK' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast Notifications */}
      <ToastContainer toasts={toasts} onClose={closeToast} />

      {/* Admin cert-renewal approval modal */}
      {certRenewalModalUser && (
        <IssueCertificateModal
          user={certRenewalModalUser}
          onClose={() => setCertRenewalModalUser(null)}
          onIssue={handleIssueCertForRenewal}
        />
      )}

      {/* Forced Password Update Modal */}
      {showForcePasswordModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-md animate-in fade-in">
          <div className="bg-white rounded-[2rem] p-8 max-w-md w-full shadow-2xl border border-blue-50 animate-in zoom-in-95">
            <div className="w-16 h-16 bg-blue-50 rounded-2xl flex items-center justify-center mb-6">
              <Key className="w-8 h-8 text-blue-600" />
            </div>
            <h2 className="text-2xl font-bold text-slate-900 mb-2">Update Credentials</h2>
            <p className="text-slate-500 mb-8 leading-relaxed">
              Your account has been created with a temporary password. You must set a new secure password before proceeding.
            </p>
            
            <form onSubmit={async (e) => {
              e.preventDefault();
              if (newPassword.length < 8) {
                showToast('Password must be at least 8 characters long', 'warning');
                return;
              }
              try {
                setIsUpdatingPassword(true);
                await gateway.updateUser(currentUser!.id, { pin: newPassword, mustChangePIN: false });
                setShowForcePasswordModal(false);
                setCurrentUser(currentUser ? { ...currentUser, mustChangePIN: false } : null);
                showToast('Password updated successfully');
                
                if (!currentUser?.departmentId || !currentUser?.contactNumber) {
                  setShowProfileCompleteModal(true);
                }
              } catch (err: any) {
                showError(err, 'Failed to update password');
              } finally {
                setIsUpdatingPassword(false);
              }
            }}>
              <div className="space-y-4 mb-8">
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1.5 ml-1">New Password</label>
                  <input
                    type="password"
                    required
                    autoFocus
                    placeholder="Enter at least 8 characters"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl focus:ring-4 focus:ring-blue-100 focus:border-blue-400 focus:bg-white transition-all outline-none"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isUpdatingPassword}
                className="w-full py-4 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white font-bold rounded-2xl shadow-lg shadow-blue-200 transition-all active:scale-[0.98] flex items-center justify-center gap-2"
              >
                {isUpdatingPassword ? (
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <>Set New Password</>
                )}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Profile Incomplete Reminder */}
      {showProfileCompleteModal && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white rounded-[2rem] p-8 max-w-md w-full shadow-2xl border border-amber-50 animate-in zoom-in-95">
            <div className="w-16 h-16 bg-amber-50 rounded-2xl flex items-center justify-center mb-6">
              <UserCheck className="w-8 h-8 text-amber-600" />
            </div>
            <h2 className="text-2xl font-bold text-slate-900 mb-2">Complete Your Profile</h2>
            <p className="text-slate-500 mb-8 leading-relaxed">
              Some important details are missing from your profile (Department or Contact Number). Please complete them to ensure full access to institutional features.
            </p>
            
            <div className="flex flex-col gap-3">
              <button
                onClick={() => {
                  setShowProfileCompleteModal(false);
                  setActiveView('profile');
                  setViewState('app');
                }}
                className="w-full py-4 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-2xl shadow-lg shadow-amber-100 transition-all active:scale-[0.98]"
              >
                Go to Profile
              </button>
              <button
                onClick={() => setShowProfileCompleteModal(false)}
                className="w-full py-4 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold rounded-2xl transition-all"
              >
                Remind Me Later
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
