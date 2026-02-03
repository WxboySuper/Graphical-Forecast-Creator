import { useEffect } from 'react';
import { useDispatch } from 'react-redux';
import { loadCycleHistory } from '../store/forecastSlice';
import type { SavedCycle } from '../store/forecastSlice';

const CYCLE_HISTORY_KEY = 'gfc-cycle-history';

/**
 * Save cycle history to localStorage
 */
export const saveCycleHistoryToStorage = (cycles: SavedCycle[]): void => {
  try {
    const serialized = JSON.stringify(cycles);
    localStorage.setItem(CYCLE_HISTORY_KEY, serialized);
  } catch (error) {
    console.error('Failed to save cycle history to localStorage:', error);
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
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.error('Failed to load cycle history from localStorage:', error);
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
