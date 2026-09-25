/**
 * Forecast-cycle persistence helpers: this module prepares active forecast
 * state for saved-cycle storage, cloning, metrics, and hydration boundaries.
 * It owns serialization-adjacent state shaping but not cloud transport,
 * browser storage access, or page-level save orchestration.
 */
import { cloneForecastCycle } from '../utils/fileUtils';
import { countForecastMetrics } from '../utils/forecastMetrics';
import type { ForecastState, SavedCycle } from './forecastSlice';

interface SaveForecastCycleOptions {
  label?: string;
  timestamp: string;
}

export const SAVED_CYCLES_LIMIT = 50;

/** Builds the next deterministic saved-cycle identifier for the current history. */
const createSavedCycleId = (state: ForecastState, timestamp: string): string => {
  const highest = state.savedCycles.reduce((max, cycle) => {
    const match = /-(\d+)$/.exec(cycle.id);
    const sequence = match ? Number(match[1]) : 0;
    return Number.isFinite(sequence) && sequence > max ? sequence : max;
  }, 0);
  return `cycle-${timestamp}-${highest + 1}`;
};

/** Saves a forecast snapshot and updates lifetime totals, streaks, and retention. */
export const saveForecastCycle = (
  state: ForecastState,
  { label, timestamp }: SaveForecastCycleOptions,
): void => {
  const forecastCycleSnapshot = cloneForecastCycle(state.forecastCycle);
  const savedCycle: SavedCycle = {
    id: createSavedCycleId(state, timestamp),
    timestamp,
    cycleDate: state.forecastCycle.cycleDate,
    label,
    forecastCycle: forecastCycleSnapshot,
    stats: countForecastMetrics(forecastCycleSnapshot),
    workflowMetadata: state.workflowMetadata ? { ...state.workflowMetadata } : undefined,
  };
  state.savedCycles.push(savedCycle);
  state.lifetimeCycleStats ??= { totalCyclesMade: 0, totalForecastsMade: 0 };
  state.lifetimeCycleStats.totalCyclesMade += 1;
  state.lifetimeCycleStats.totalForecastsMade += savedCycle.stats.forecastDays;
  const lastSavedCycleDate = state.lifetimeCycleStats.lastSavedCycleDate;
  if (!lastSavedCycleDate || savedCycle.cycleDate > lastSavedCycleDate) {
    const previousDate = lastSavedCycleDate ? new Date(lastSavedCycleDate).getTime() : 0;
    const currentDate = new Date(savedCycle.cycleDate).getTime();
    const isConsecutiveDay = currentDate - previousDate === 86400000;
    state.lifetimeCycleStats.forecastStreak = isConsecutiveDay
      ? (state.lifetimeCycleStats.forecastStreak ?? 0) + 1
      : 1;
    state.lifetimeCycleStats.lastSavedCycleDate = savedCycle.cycleDate;
  } else if (!state.lifetimeCycleStats.forecastStreak) {
    state.lifetimeCycleStats.forecastStreak = 1;
  }
  if (state.savedCycles.length > SAVED_CYCLES_LIMIT) {
    state.savedCycles.splice(0, state.savedCycles.length - SAVED_CYCLES_LIMIT);
  }
  state.isSaved = true;
};
