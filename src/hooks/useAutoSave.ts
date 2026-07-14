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

/** Returns the persisted autosave timestamp, or 0 when missing or malformed. */
export const getAutoSaveTimestamp = (storedValue: string | null): number => {
  if (!storedValue) return 0;

  try {
    const parsed = JSON.parse(storedValue) as { timestamp?: string };
    return parsed.timestamp ? Date.parse(parsed.timestamp) : 0;
  } catch {
    return 0;
  }
};

/** Picks the newest autosave snapshot when multiple scoped copies exist. */
export const pickNewestAutoSaveValue = (...values: (string | null)[]): string | null => {
  const candidates = values.filter((value): value is string => value !== null);
  if (candidates.length === 0) return null;

  return candidates.reduce((best, current) => (
    getAutoSaveTimestamp(current) > getAutoSaveTimestamp(best) ? current : best
  ));
};

/** Picks the newest autosave snapshot when both scoped and legacy copies exist. */
export const selectPreferredAutoSaveValue = (
  scopedValue: string | null,
  legacyValue: string | null,
): string | null => pickNewestAutoSaveValue(scopedValue, legacyValue);

/** Moves an anonymous autosave into the signed-in account scope once, without overwriting account data.
 * On sign-in, reconcile scoped, legacy, and live editor snapshots by timestamp so anonymous work is not dropped.
 */
export const migrateLegacyAutoSave = (userId?: string | null, liveSession?: unknown): void => {
  if (!userId) return;

  try {
    const scopedKey = getAutoSaveStorageKey(userId);
    const scopedValue = localStorage.getItem(scopedKey);
    const legacyValue = localStorage.getItem(LOCAL_STORAGE_KEY);

    if (liveSession !== undefined) {
      const preferred = pickNewestAutoSaveValue(scopedValue, legacyValue, JSON.stringify(liveSession));
      if (preferred) {
        localStorage.setItem(scopedKey, preferred);
      }
      if (legacyValue !== null) {
        localStorage.removeItem(LOCAL_STORAGE_KEY);
      }
      return;
    }

    if (scopedValue === null && legacyValue !== null) {
      localStorage.setItem(scopedKey, legacyValue);
      localStorage.removeItem(LOCAL_STORAGE_KEY);
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
  const isFirstRender = useRef(true);
  const saveGenerationRef = useRef(0);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }

    const generation = ++saveGenerationRef.current;
    setTimeout(() => {
      if (generation !== saveGenerationRef.current) return;
      try {
        const data = serializeForecast(forecastCycle, mapView, workflowMetadata);
        localStorage.setItem(getAutoSaveStorageKey(userId), JSON.stringify(data));
      } catch {
        // Auto-save silently fails to avoid disrupting the user
      }
    }, AUTOSAVE_DELAY);
  }, [forecastCycle, mapView, userId, workflowMetadata]);
};
