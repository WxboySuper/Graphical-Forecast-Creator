import { useEffect } from 'react';
import { useDispatch } from 'react-redux';
import { loadCycleHistory } from '../store/forecastSlice';
import type { SavedCycle, SavedCycleStats } from '../store/forecastSlice';
import { deserializeForecast, serializeForecast } from './fileUtils';
import { countForecastMetrics } from './forecastMetrics';
import type { ForecastCycle, GFCForecastSaveData } from '../types/outlooks';

const CYCLE_HISTORY_KEY = 'gfc-cycle-history';
const STORAGE_MAP_VIEW = { center: [0, 0] as [number, number], zoom: 0 };

interface PersistedSavedCycle {
  id: string;
  timestamp: string;
  cycleDate: string;
  label?: string;
  forecastData: GFCForecastSaveData;
  stats?: SavedCycleStats;
}

/** Converts an in-memory saved cycle into a JSON-safe storage shape that preserves map data. */
const toPersistedSavedCycle = (cycle: SavedCycle): PersistedSavedCycle => ({
  id: cycle.id,
  timestamp: cycle.timestamp,
  cycleDate: cycle.cycleDate,
  label: cycle.label,
  forecastData: serializeForecast(cycle.forecastCycle, STORAGE_MAP_VIEW),
  stats: cycle.stats,
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
}): SavedCycle => ({
  id: cycle.id,
  timestamp: cycle.timestamp,
  cycleDate: cycle.cycleDate,
  label: cycle.label,
  forecastCycle: cycle.forecastCycle,
  stats: cycle.stats ?? countForecastMetrics(cycle.forecastCycle),
});

/**
 * Save cycle history to localStorage
 */
export const saveCycleHistoryToStorage = (cycles: SavedCycle[]): void => {
  try {
    const serialized = JSON.stringify(cycles.map(toPersistedSavedCycle));
    localStorage.setItem(CYCLE_HISTORY_KEY, serialized);
  } catch {
    // Silently ignore localStorage write failures
  }
};

/**
 * Load cycle history from localStorage
 */
export const loadCycleHistoryFromStorage = (): SavedCycle[] => {
  try {
    const serialized = localStorage.getItem(CYCLE_HISTORY_KEY);
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
export const useCycleHistoryPersistence = (): void => {
  const dispatch = useDispatch();

  useEffect(() => {
    // Load cycle history from localStorage on mount
    const savedCycles = loadCycleHistoryFromStorage();
    if (savedCycles.length > 0) {
      dispatch(loadCycleHistory(savedCycles));
    }
  }, [dispatch]);
};

/**
 * Subscribe to Redux store changes and persist cycle history
 * Call this from the root component after store initialization
 */
export const setupCycleHistoryListener = (store: any): void => {
  let previousCycles: SavedCycle[] = [];

  store.subscribe(() => {
    const state = store.getState();
    const currentCycles = state.forecast.savedCycles;

    // Only save if cycles array has changed
    if (currentCycles !== previousCycles) {
      saveCycleHistoryToStorage(currentCycles);
      previousCycles = currentCycles;
    }
  });
};
