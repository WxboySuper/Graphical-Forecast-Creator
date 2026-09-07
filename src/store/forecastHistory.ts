import type { CustomLayerCollection } from '../types/customProducts';
import type { DayType, OutlookData, OutlookType } from '../types/outlooks';
import { cloneCustomLayers, cloneOutlookData } from './forecastSnapshotHelpers';
import type { ForecastState } from './forecastSlice';

export interface ForecastDaySnapshot {
  day: DayType;
  data: OutlookData;
  lowProbabilityOutlooks: OutlookType[];
  outlookOpacities?: Partial<Record<OutlookType, number>>;
  customLayers?: CustomLayerCollection;
}

export interface ForecastHistoryEntry {
  day: DayType;
  snapshot: ForecastDaySnapshot;
}

export interface ForecastHistoryStacks {
  undoStack: ForecastHistoryEntry[];
  redoStack: ForecastHistoryEntry[];
}

const HISTORY_LIMIT = 50;

/** Returns the history stacks for one day, creating empty stacks when needed. */
export const getOrCreateDayHistory = (
  state: ForecastState,
  day: DayType = state.forecastCycle.currentDay,
): ForecastHistoryStacks => {
  if (!state.historyByDay[day]) {
    state.historyByDay[day] = {
      undoStack: [],
      redoStack: [],
    };
  }

  return state.historyByDay[day] as ForecastHistoryStacks;
};

/** Captures the current day's drawable outlook data and metadata for history. */
export const getCurrentDaySnapshot = (
  state: ForecastState,
  day = state.forecastCycle.currentDay,
): ForecastDaySnapshot | null => {
  const dayData = state.forecastCycle.days[day];
  if (!dayData) return null;

  return {
    day,
    data: cloneOutlookData(dayData.data),
    lowProbabilityOutlooks: [...(dayData.metadata.lowProbabilityOutlooks || [])],
    outlookOpacities: dayData.metadata.outlookOpacities ? { ...dayData.metadata.outlookOpacities } : undefined,
    customLayers: cloneCustomLayers(dayData.customLayers),
  };
};

/** Applies a stored day snapshot during undo or redo restoration. */
export const applyDaySnapshot = (
  state: ForecastState,
  snapshot: ForecastDaySnapshot,
  now: string,
  createEmptyDay: (day: DayType, timestamp: string) => NonNullable<ForecastState['forecastCycle']['days'][DayType]>,
) => {
  const dayData = state.forecastCycle.days[snapshot.day];
  if (!dayData) {
    state.forecastCycle.days[snapshot.day] = createEmptyDay(snapshot.day, now);
  }

  const targetDay = state.forecastCycle.days[snapshot.day];
  if (!targetDay) return;

  targetDay.data = cloneOutlookData(snapshot.data);
  targetDay.customLayers = cloneCustomLayers(snapshot.customLayers);
  targetDay.metadata.lowProbabilityOutlooks = [...snapshot.lowProbabilityOutlooks];
  targetDay.metadata.outlookOpacities = snapshot.outlookOpacities ? { ...snapshot.outlookOpacities } : undefined;
  targetDay.metadata.lastModified = now;
};

/** Moves a snapshot onto a history stack while enforcing the history limit. */
export const pushHistoryEntry = (stack: ForecastHistoryEntry[], snapshot: ForecastDaySnapshot) => {
  stack.push({ day: snapshot.day, snapshot });
  if (stack.length > HISTORY_LIMIT) {
    stack.shift();
  }
};

/** Saves the current day into undo history and clears redo after a new user edit. */
export const pushUndoSnapshot = (state: ForecastState, day = state.forecastCycle.currentDay) => {
  const snapshot = getCurrentDaySnapshot(state, day);
  if (!snapshot) return;

  const dayHistory = getOrCreateDayHistory(state, snapshot.day);
  pushHistoryEntry(dayHistory.undoStack, snapshot);
  dayHistory.redoStack = [];
};

/** Clears all per-day history stacks when the editing context changes. */
export const clearHistory = (state: ForecastState) => {
  state.historyByDay = {};
};

/** Moves one history snapshot to the opposite stack and restores it. */
export const restoreHistoryEntry = (
  sourceStack: ForecastHistoryEntry[],
  targetStack: ForecastHistoryEntry[],
  state: ForecastState,
  now: string,
  createEmptyDay: (day: DayType, timestamp: string) => NonNullable<ForecastState['forecastCycle']['days'][DayType]>,
) => {
  const nextEntry = sourceStack.pop();
  if (!nextEntry) return;

  const currentSnapshot = getCurrentDaySnapshot(state);
  if (currentSnapshot) {
    pushHistoryEntry(targetStack, currentSnapshot);
  }

  applyDaySnapshot(state, nextEntry.snapshot, now, createEmptyDay);
  state.forecastCycle.currentDay = nextEntry.day;
  state.isSaved = false;
};
