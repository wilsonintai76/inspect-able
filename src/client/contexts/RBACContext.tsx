import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { RBACMatrix, UserRole } from '@shared/types';
import { gateway } from '../services/dataGateway';
import { BRANDING } from '../constants';

// Source of truth: RBAC_ROLE_MATRIX.md
export const DEFAULT_RBAC_MATRIX: RBACMatrix = {
  // Institutional Overview
  'view:overview':            ['Admin', 'Coordinator', 'Supervisor', 'Auditor', 'Staff'],
  // Inspection Schedule
  'view:schedule:all':        ['Admin'],                                          // View All Dept Schedules — Admin only
  'view:schedule:own':        ['Admin', 'Coordinator', 'Supervisor', 'Auditor', 'Staff'],
  'view:schedule:matrix':     ['Admin', 'Coordinator', 'Supervisor', 'Auditor'], // Cross-Audit schedules + Audit Matrix
  'edit:audit:date':          ['Admin', 'Coordinator', 'Supervisor'],
  'edit:audit:assign':        ['Admin', 'Supervisor', 'Auditor'],                 // Self-Assign — Coordinator ✗
  'edit:audit:assign:others': ['Admin'],                                          // Assign Others — Admin only
  'edit:audit:auto_assign':   ['Admin'],                                          // Auto-Assign — Admin only
  // Officer Hub
  'view:audit:assigned':      ['Admin', 'Supervisor', 'Auditor'],                 // Officer Hub — Coordinator & Staff ✗
  // User Management
  'view:team:all':            ['Admin'],                                          // View All Members — Admin only
  'view:team:own':            ['Admin', 'Coordinator', 'Supervisor'],             // View Dept Members
  'edit:team':                ['Admin', 'Coordinator'],
  // Data Registries
  'manage:departments':       ['Admin', 'Coordinator'],                           // Department Registry
  'manage:locations':         ['Admin', 'Coordinator', 'Supervisor'],             // Location Registry
  // System
  'manage:system':            ['Admin'],
  'view:admin:dashboard':     ['Admin', 'Coordinator'],   // Coordinator: dept-scoped view
};

interface RBACContextType {
  rbacMatrix: RBACMatrix;
  isLoading: boolean;
  hasPermission: (permission: string, userRoles: UserRole[]) => boolean;
  updateRBAC: (newMatrix: RBACMatrix) => Promise<void>;
  refreshRBAC: () => Promise<void>;
}

const RBACContext = createContext<RBACContextType | undefined>(undefined);

export const RBACProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [rbacMatrix, setRbacMatrix] = useState<RBACMatrix>(DEFAULT_RBAC_MATRIX);
  const [isLoading, setIsLoading] = useState(true);

  const refreshRBAC = useCallback(async () => {
    try {
      setIsLoading(true);
      // Wait for session to avoid rogue 401s
      const { authService } = await import('../services/auth');
      const user = await authService.getCurrentUser();
      if (!user) return;

      const settings = await gateway.getSystemSettings();
      const brandingSetting = settings.find(s => s.id === 'branding');
      if (brandingSetting?.value) {
        const val = brandingSetting.value as any;
        if (val.logoBrand) {
          BRANDING.logoBrand = val.logoBrand;
        } else if (val.logoHorizontal || val.logoSquare) {
          BRANDING.logoBrand = val.logoHorizontal || val.logoSquare;
        }
        if (val.logoInstitution) BRANDING.logoInstitution = val.logoInstitution;
      }

      const rbacSetting = settings.find(s => s.id === 'rbac_matrix');
      if (rbacSetting?.value) {
        const dbMatrix = rbacSetting.value as RBACMatrix;
        const mergedMatrix = { ...DEFAULT_RBAC_MATRIX, ...dbMatrix };

        // Ensure Admin role is never locked out of critical system functions
        if (!mergedMatrix['view:admin:dashboard']?.includes('Admin')) {
            mergedMatrix['view:admin:dashboard'] = [...(mergedMatrix['view:admin:dashboard'] || []), 'Admin'];
        }
        if (!mergedMatrix['manage:system']?.includes('Admin')) {
            mergedMatrix['manage:system'] = [...(mergedMatrix['manage:system'] || []), 'Admin'];
        }
        
        // Ensure Auditor role retains its required self-assign capability
        if (!mergedMatrix['edit:audit:assign']?.includes('Auditor')) {
            mergedMatrix['edit:audit:assign'] = [...(mergedMatrix['edit:audit:assign'] || []), 'Auditor'];
        }

        setRbacMatrix(mergedMatrix);
      }
    } catch (error) {
      console.error('Failed to load RBAC matrix:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshRBAC();
  }, [refreshRBAC]);

  const hasPermission = useCallback((permission: string, userRoles: UserRole[]) => {
    const allowedRoles = rbacMatrix[permission] || [];
    return (userRoles || []).some(role => allowedRoles.includes(role));
  }, [rbacMatrix]);

  const updateRBAC = async (newMatrix: RBACMatrix) => {
    try {
      await gateway.updateSystemSetting('rbac_matrix', newMatrix);
      setRbacMatrix(newMatrix);
    } catch (error) {
      console.error('Failed to update RBAC matrix:', error);
      throw error;
    }
  };

  return (
    <RBACContext.Provider value={{ rbacMatrix, isLoading, hasPermission, updateRBAC, refreshRBAC }}>
      {children}
    </RBACContext.Provider>
  );
};

export const useRBAC = () => {
  const context = useContext(RBACContext);
  if (context === undefined) {
    throw new Error('useRBAC must be used within an RBACProvider');
  }
  return context;
};
