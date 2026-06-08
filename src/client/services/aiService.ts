import { AuditSchedule, AuditInsight } from '@shared/types';
import { api, getAuthHeaders } from './honoClient';

export const generateAuditReport = async (audit: AuditSchedule, resolvedData?: any): Promise<string> => {
  try {
    const res = await (api as any).ai.report.$post(
      { json: { audit, resolvedData } },
      { headers: await getAuthHeaders() }
    );
    if (!res.ok) throw new Error('AI report failed');
    const data = await res.json() as { report: string };
    return data.report;
  } catch {
    return 'Error: Could not generate report at this time.';
  }
};

export const suggestThresholds = async (departments: any[]) => {
  try {
    const res = await (api as any).ai['suggest-thresholds'].$post(
      { json: { departments } },
      { headers: await getAuthHeaders() }
    );
    if (!res.ok) throw new Error('AI threshold suggestion failed');
    return await res.json() as { assetThreshold: number; megaTargetThreshold: number; reasoning: string };
  } catch (err) {
    console.error('Threshold suggestion error:', err);
    return { assetThreshold: 500, megaTargetThreshold: 3000, reasoning: 'Fallback due to error.' };
  }
};
