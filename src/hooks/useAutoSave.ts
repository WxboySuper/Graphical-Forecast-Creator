import { useEffect, useRef } from 'react';
import { useSelector } from 'react-redux';
import { RootState } from '../store';
import { selectForecastCycle } from '../store/forecastSlice';
import { getScopedStorageKey, getStorageScope } from '../utils/storageScope';
import { DEFAULT_FORECAST_WORKSPACE, type ForecastWorkspaceId } from '../config/forecastWorkspaces';
import { serializeForecastWorkspace } from '../utils/forecastWorkspacePersistenceAdapter';

const AUTOSAVE_DELAY = 5000; // 5 seconds debounce
const LOCAL_STORAGE_KEY = 'forecastData';

/** Returns the autosave key for an account scope, or the workspace key anonymously. */
const getWorkspaceAutoSaveBaseKey = (workspaceId: ForecastWorkspaceId): string =>
  workspaceId === DEFAULT_FORECAST_WORKSPACE ? LOCAL_STORAGE_KEY : `${LOCAL_STORAGE_KEY}:${workspaceId}`;

export const getAutoSaveStorageKey = (
  userId?: string | null,
  workspaceId: ForecastWorkspaceId = DEFAULT_FORECAST_WORKSPACE,
): string => {
  const baseKey = getWorkspaceAutoSaveBaseKey(workspaceId);
  return userId ? getScopedStorageKey(baseKey, getStorageScope(userId)) : baseKey;
};

/** Clears autosave snapshots before starting a deliberately fresh forecast workflow. */
export const clearAutoSave = (
  userId?: string | null,
  workspaceId: ForecastWorkspaceId = DEFAULT_FORECAST_WORKSPACE,
): void => {
  try {
    localStorage.removeItem(getAutoSaveStorageKey(userId, workspaceId));
    if (userId && workspaceId === DEFAULT_FORECAST_WORKSPACE) {
      localStorage.removeItem(LOCAL_STORAGE_KEY);
    }
  } catch {
    // Ignore storage failures so starting a workflow remains usable.
  }
};

/** Returns the persisted autosave timestamp, or 0 when missing or malformed. */
export const getAutoSaveTimestamp = (storedValue: string | null): number => {
  if (!storedValue) return 0;

  try {
    const parsed = JSON.parse(storedValue) as { timestamp?: string };
    if (!parsed.timestamp) return 0;
    const timestamp = Date.parse(parsed.timestamp);
    return Number.isFinite(timestamp) ? timestamp : 0;
  } catch {
    return 0;
  }
};

/** Returns whether a stored autosave has a usable timestamp or legacy shape. */
const isValidAutoSaveCandidate = (value: string | null): value is string => {
  if (value === null) return false;
  try {
    const parsed = JSON.parse(value) as { timestamp?: unknown };
    if (parsed.timestamp === undefined) return true;
    return typeof parsed.timestamp === 'string' && Number.isFinite(Date.parse(parsed.timestamp));
  } catch {
    return false;
  }
};

/** Picks the newest autosave snapshot when multiple scoped copies exist. */
export const pickNewestAutoSaveValue = (...values: (string | null)[]): string | null => {
  const candidates = values.filter(isValidAutoSaveCandidate);
  if (candidates.length === 0) return null;

  return candidates.reduce((best, current) => (
    getAutoSaveTimestamp(current) > getAutoSaveTimestamp(best) ? current : best
  ));
};

/** Picks the autosave snapshot for restore without crossing account boundaries. */
export const selectPreferredAutoSaveValue = (
  scopedValue: string | null,
  legacyValue: string | null,
): string | null => scopedValue ?? legacyValue;

/** Moves an anonymous autosave into the signed-in account scope once, without overwriting account data.
 * On sign-in, reconcile live editor state with scoped storage, but never promote unscoped legacy over an
 * existing account autosave on shared browsers.
 */
const migrateSevereLegacyAutoSave = (
  userId?: string | null,
  liveSession?: unknown,
): void => {
  if (!userId) return;

  try {
    const scopedKey = getAutoSaveStorageKey(userId);
    const scopedValue = localStorage.getItem(scopedKey);
    const legacyValue = localStorage.getItem(LOCAL_STORAGE_KEY);

    if (liveSession !== undefined) {
      if (scopedValue === null) {
        const liveValue = JSON.stringify(liveSession);
        const preferred = pickNewestAutoSaveValue(legacyValue, liveValue);
        if (preferred) {
          localStorage.setItem(scopedKey, preferred);
        }
        if (legacyValue !== null) {
          localStorage.removeItem(LOCAL_STORAGE_KEY);
        }
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

/** Migrates a non-Severe anonymous snapshot into the matching account scope. */
const migrateWorkspaceAutoSave = (
  userId?: string | null,
  liveSession?: unknown,
  workspaceId: ForecastWorkspaceId,
): void => {
  if (!userId) return;

  try {
    const scopedKey = getAutoSaveStorageKey(userId, workspaceId);
    const anonymousKey = getAutoSaveStorageKey(null, workspaceId);
    const scopedValue = localStorage.getItem(scopedKey);
    const anonymousValue = localStorage.getItem(anonymousKey);

    if (liveSession !== undefined && scopedValue === null) {
      const preferred = pickNewestAutoSaveValue(anonymousValue, JSON.stringify(liveSession));
      if (preferred) localStorage.setItem(scopedKey, preferred);
      if (anonymousValue !== null) localStorage.removeItem(anonymousKey);
      return;
    }

    if (scopedValue === null && anonymousValue !== null) {
      localStorage.setItem(scopedKey, anonymousValue);
      localStorage.removeItem(anonymousKey);
    }
  } catch {
    // Ignore storage failures so sign-in never disrupts editing.
  }
};

/** Migrates the anonymous snapshot for the active workspace into the account scope. */
export const migrateLegacyAutoSave = (
  userId?: string | null,
  liveSession?: unknown,
  workspaceId: ForecastWorkspaceId = DEFAULT_FORECAST_WORKSPACE,
): void => {
  if (workspaceId === DEFAULT_FORECAST_WORKSPACE) {
    migrateSevereLegacyAutoSave(userId, liveSession);
    return;
  }
  migrateWorkspaceAutoSave(userId, liveSession, workspaceId);
};

/** Debounces forecast edits into the current anonymous or account-scoped autosave. */
export const useAutoSave = (
  userId?: string | null,
  workspaceId: ForecastWorkspaceId = DEFAULT_FORECAST_WORKSPACE,
) => {
  const forecastCycle = useSelector(selectForecastCycle);
  const mapView = useSelector((state: RootState) => state.forecast.currentMapView);
  const workflowMetadata = useSelector((state: RootState) => state.forecast.workflowMetadata);
  const isFirstRender = useRef(true);
  const saveGenerationRef = useRef(0);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }

    const generation = ++saveGenerationRef.current;
    saveTimeoutRef.current = setTimeout(() => {
      saveTimeoutRef.current = null;
      if (generation !== saveGenerationRef.current) return;
      try {
        const data = serializeForecastWorkspace(workspaceId, forecastCycle, mapView, workflowMetadata);
        localStorage.setItem(getAutoSaveStorageKey(userId, workspaceId), JSON.stringify(data));
      } catch {
        // Auto-save silently fails to avoid disrupting the user
      }
    }, AUTOSAVE_DELAY);

    // skipcq: JS-0045 React effects intentionally return cleanup callbacks.
    return function cleanupAutoSaveTimeout() {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = null;
      }
    };
  }, [forecastCycle, mapView, userId, workspaceId, workflowMetadata]);
};
