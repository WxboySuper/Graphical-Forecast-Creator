import { useEffect } from 'react';
import { useDispatch } from 'react-redux';
import type { Store } from 'redux';
import type { RootState } from '../store';
import { loadCycleHistory } from '../store/forecastSlice';
import type { SavedCycle, SavedCycleStats } from '../store/forecastSlice';
import { deserializeForecast, serializeForecast } from './fileUtils';
import { countForecastMetrics } from './forecastMetrics';
import { normalizeForecastCycle } from './outlookMapCoercion';
import type { ForecastCycle, GFCForecastSaveData, CycleMetadata } from '../types/outlooks';
import { getScopedStorageKey, getStorageScope } from './storageScope';

const CYCLE_HISTORY_KEY = 'gfc-cycle-history';
const LEGACY_CYCLE_HISTORY_KEY = CYCLE_HISTORY_KEY;
const STORAGE_MAP_VIEW = { center: [0, 0] as [number, number], zoom: 0 };

interface PersistedSavedCycle {
  id: string;
  timestamp: string;
  cycleDate: string;
  label?: string;
  forecastData: GFCForecastSaveData;
  stats?: SavedCycleStats;
  /** v2 workflow metadata for the cycle (optional, present for workflow-imported cycles). */
  workflowMetadata?: CycleMetadata;
}

/** Converts an in-memory saved cycle into a JSON-safe storage shape that preserves map data. */
const toPersistedSavedCycle = (cycle: SavedCycle): PersistedSavedCycle => ({
  id: cycle.id,
  timestamp: cycle.timestamp,
  cycleDate: cycle.cycleDate,
  label: cycle.label,
  forecastData: serializeForecast(cycle.forecastCycle, STORAGE_MAP_VIEW, cycle.workflowMetadata),
  stats: cycle.stats,
  workflowMetadata: cycle.workflowMetadata,
});

/** Restores one saved cycle from storage, rehydrating its forecast maps and filling stats when missing. */
const fromPersistedSavedCycle = (cycle: PersistedSavedCycle): SavedCycle => {
  const forecastCycle = deserializeForecast(cycle.forecastData);

  return {
    id: cycle.id,
    timestamp: cycle.timestamp,
    cycleDate: cycle.cycleDate,
    label: cycle.label,
    forecastCycle,
    stats: cycle.stats ?? countForecastMetrics(forecastCycle),
    workflowMetadata: cycle.workflowMetadata,
  };
};

/** Best-effort migration path for older saved-cycle entries that stored raw forecastCycle objects. */
const fromLegacySavedCycle = (cycle: {
  id: string;
  timestamp: string;
  cycleDate: string;
  label?: string;
  forecastCycle: ForecastCycle;
  stats?: SavedCycleStats;
}): SavedCycle => {
  const forecastCycle = normalizeForecastCycle(cycle.forecastCycle);

  return {
    id: cycle.id,
    timestamp: cycle.timestamp,
    cycleDate: cycle.cycleDate,
    label: cycle.label,
    forecastCycle,
    stats: cycle.stats ?? countForecastMetrics(forecastCycle),
  };
};

/**
 * Save cycle history to localStorage
 */
export const getCycleHistoryStorageKey = (userId?: string | null): string =>
  userId ? getScopedStorageKey(CYCLE_HISTORY_KEY, getStorageScope(userId)) : CYCLE_HISTORY_KEY;

export const saveCycleHistoryToStorage = (cycles: SavedCycle[], userId?: string | null): void => {
  try {
    const serialized = JSON.stringify(cycles.map(toPersistedSavedCycle));
    localStorage.setItem(getCycleHistoryStorageKey(userId), serialized);
  } catch {
    // Silently ignore localStorage write failures
  }
};

/**
 * Load cycle history from localStorage
 */
export const loadCycleHistoryFromStorage = (userId?: string | null): SavedCycle[] => {
  try {
    const scopedKey = getCycleHistoryStorageKey(userId);
    let serialized = localStorage.getItem(scopedKey);

    if (!serialized && !userId) {
      serialized = localStorage.getItem(LEGACY_CYCLE_HISTORY_KEY);
      if (serialized) {
        localStorage.setItem(scopedKey, serialized);
      }
    }

    if (!serialized) return [];
    
    const parsed = JSON.parse(serialized);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .map((cycle) => {
        if (!cycle || typeof cycle !== 'object') {
          return null;
        }

        try {
          if ('forecastData' in cycle) {
            return fromPersistedSavedCycle(cycle as PersistedSavedCycle);
          }

          if ('forecastCycle' in cycle) {
            return fromLegacySavedCycle(cycle as SavedCycle);
          }

          return null;
        } catch {
          return null;
        }
      })
      .filter((cycle): cycle is SavedCycle => cycle !== null);
  } catch {
    return [];
  }
};

/**
 * Hook to hydrate cycle history on app startup
 */
export const useCycleHistoryPersistence = (userId?: string | null): void => {
  const dispatch = useDispatch();

  useEffect(() => {
    // Clear the previous account's history before hydrating the new scope.
    dispatch(loadCycleHistory([]));
    const savedCycles = loadCycleHistoryFromStorage(userId);
    if (savedCycles.length > 0) {
      dispatch(loadCycleHistory(savedCycles));
    }
  }, [dispatch, userId]);
};

/**
 * Subscribe to Redux store changes and persist cycle history
 * Call this from the root component after store initialization
 */
export const setupCycleHistoryListener = (store: Store<RootState>, userId?: string | null): (() => void) => {
  let previousCycles: SavedCycle[] = store.getState().forecast.savedCycles;

  return store.subscribe(() => {
    const state = store.getState();
    const currentCycles = state.forecast.savedCycles;

    if (currentCycles !== previousCycles) {
      if (userId) {
        saveCycleHistoryToStorage(currentCycles, userId);
      } else {
        saveCycleHistoryToStorage(currentCycles);
      }
      previousCycles = currentCycles;
    }
  });
};
