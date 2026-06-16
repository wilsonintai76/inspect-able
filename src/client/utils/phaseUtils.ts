export const PHASE_NAMES = ['Phase 1', 'Phase 2', 'Phase 3'];

export interface PhaseRange {
  start: string; // ISO date string
  end: string;   // ISO date string
}

// Static placeholder ranges – replace with real dates from server if needed
export const PHASE_RANGES: Record<string, PhaseRange> = {
  'Phase 1': { start: '2026-01-01', end: '2026-03-31' },
  'Phase 2': { start: '2026-04-01', end: '2026-06-30' },
  'Phase 3': { start: '2026-07-01', end: '2026-09-30' },
};

/**
 * Get the date range for a given phase name.
 */
export function getPhaseDateRange(phaseName: string): PhaseRange | undefined {
  return PHASE_RANGES[phaseName];
}

/**
 * Validate that a date string falls within the specified phase's range.
 */
export function isDateInPhase(date: string, phaseName: string): boolean {
  const range = getPhaseDateRange(phaseName);
  if (!range) return false;
  return date >= range.start && date <= range.end;
}
