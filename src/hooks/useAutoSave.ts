import { useEffect, useRef } from 'react';
import { useSelector } from 'react-redux';
import { RootState } from '../store';
import { selectForecastCycle } from '../store/forecastSlice';
import { serializeForecast } from '../utils/fileUtils';
import { getScopedStorageKey, getStorageScope } from '../utils/storageScope';

const AUTOSAVE_DELAY = 5000; // 5 seconds debounce
const LOCAL_STORAGE_KEY = 'forecastData';

/** Returns the autosave key for an account scope, or the legacy key anonymously. */
export const getAutoSaveStorageKey = (userId?: string | null): string =>
  userId ? getScopedStorageKey(LOCAL_STORAGE_KEY, getStorageScope(userId)) : LOCAL_STORAGE_KEY;

/** Moves an anonymous autosave into the signed-in account scope once, without overwriting account data.
 * When the live editor is available, persist it instead of copying a potentially stale legacy snapshot.
 */
export const migrateLegacyAutoSave = (userId?: string | null, liveSession?: unknown): void => {
  if (!userId) return;

  try {
    const scopedKey = getAutoSaveStorageKey(userId);
    if (localStorage.getItem(scopedKey) === null) {
      const legacyValue = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (legacyValue !== null) {
        localStorage.setItem(scopedKey, liveSession === undefined ? legacyValue : JSON.stringify(liveSession));
        localStorage.removeItem(LOCAL_STORAGE_KEY);
      }
    }
  } catch {
    // Ignore storage failures so sign-in never disrupts editing.
  }
};

/** Debounces forecast edits into the current anonymous or account-scoped autosave. */
export const useAutoSave = (userId?: string | null) => {
  const forecastCycle = useSelector(selectForecastCycle);
  const mapView = useSelector((state: RootState) => state.forecast.currentMapView);
  const workflowMetadata = useSelector((state: RootState) => state.forecast.workflowMetadata);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const isFirstRender = useRef(true);

  useEffect(function autoSaveEffect() {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }

    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }

    timerRef.current = setTimeout(() => {
      try {
        const data = serializeForecast(forecastCycle, mapView, workflowMetadata);
        localStorage.setItem(getAutoSaveStorageKey(userId), JSON.stringify(data));
      } catch {
        // Auto-save silently fails to avoid disrupting the user
      }
    }, AUTOSAVE_DELAY);

    return function cleanupAutoSaveEffect() {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, [forecastCycle, mapView, userId, workflowMetadata]);
};
