import { useEffect, useRef } from 'react';
import { useSelector } from 'react-redux';
import { RootState } from '../store';
import { selectForecastCycle } from '../store/forecastSlice';
import { getScopedStorageKey, getStorageScope } from '../utils/storageScope';
import { DEFAULT_FORECAST_WORKSPACE, type ForecastWorkspaceId } from '../config/forecastWorkspaces';
import { serializeForecastWorkspace } from '../utils/forecastWorkspacePersistenceAdapter';

const AUTOSAVE_DELAY = 5000; // 5 seconds debounce
const LOCAL_STORAGE_KEY = 'forecastData';

interface AutoSaveScope {
  userId?: string | null;
  workspaceId: ForecastWorkspaceId;
}

interface ForecastSnapshot {
  forecastCycle: ReturnType<typeof selectForecastCycle>;
  mapView: RootState['forecast']['currentMapView'];
  workflowMetadata: RootState['forecast']['workflowMetadata'];
}

interface PendingAutoSave extends AutoSaveScope, ForecastSnapshot {}

const persistAutoSave = ({ userId, workspaceId, forecastCycle, mapView, workflowMetadata }: PendingAutoSave): void => {
  try {
    const data = serializeForecastWorkspace(workspaceId, forecastCycle, mapView, workflowMetadata);
    localStorage.setItem(getAutoSaveStorageKey(userId, workspaceId), JSON.stringify(data));
  } catch {
    // Auto-save silently fails to avoid disrupting editing.
  }
};

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
    if (userId) {
      // Clear the anonymous fallback too, so a later sign-in migration cannot
      // resurrect the workspace snapshot the user deliberately discarded.
      localStorage.removeItem(getWorkspaceAutoSaveBaseKey(workspaceId));
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

/** Promotes an anonymous snapshot into the account scope only when the account scope is empty. */
const promoteAnonymousSnapshot = (
  scopedKey: string,
  anonymousKey: string,
  scopedValue: string | null,
  legacyValue: string | null,
): void => {
  if (scopedValue !== null) return;
  if (legacyValue === null) return;
  localStorage.setItem(scopedKey, legacyValue);
  localStorage.removeItem(anonymousKey);
};

/** Reconciles live editor state with scoped storage without overwriting existing account data. */
const reconcileLiveSessionSnapshot = (
  scopedKey: string,
  anonymousKey: string,
  scopedValue: string | null,
  legacyValue: string | null,
  liveSession: unknown,
): void => {
  if (scopedValue !== null) return;
  const preferred = pickNewestAutoSaveValue(legacyValue, JSON.stringify(liveSession));
  if (preferred !== null) {
    localStorage.setItem(scopedKey, preferred);
  }
  if (legacyValue !== null) {
    localStorage.removeItem(anonymousKey);
  }
};

/** Moves an anonymous autosave into the signed-in account scope once, without overwriting account data.
 * On sign-in, reconcile live editor state with scoped storage, but never promote unscoped legacy over an
 * existing account autosave on shared browsers.
 */
const migrateWorkspaceAutoSave = (
  userId?: string | null,
  liveSession?: unknown,
  workspaceId: ForecastWorkspaceId = DEFAULT_FORECAST_WORKSPACE,
): void => {
  if (!userId) return;

  try {
    const scopedKey = getAutoSaveStorageKey(userId, workspaceId);
    const scopedValue = localStorage.getItem(scopedKey);
    const anonymousKey = getWorkspaceAutoSaveBaseKey(workspaceId);
    const legacyValue = localStorage.getItem(anonymousKey);

    if (liveSession !== undefined) {
      reconcileLiveSessionSnapshot(scopedKey, anonymousKey, scopedValue, legacyValue, liveSession);
      return;
    }

    promoteAnonymousSnapshot(scopedKey, anonymousKey, scopedValue, legacyValue);
  } catch {
    // Ignore storage failures so sign-in never disrupts editing.
  }
};

/**
 * Migrates the anonymous workspace snapshot into the account scope.
 * Each workspace migrates only its own anonymous key into its own account
 * scope, so a non-Severe draft is never promoted into the Severe scope.
 */
export const migrateLegacyAutoSave = (
  userId?: string | null,
  liveSession?: unknown,
  workspaceId: ForecastWorkspaceId = DEFAULT_FORECAST_WORKSPACE,
): void => {
  migrateWorkspaceAutoSave(userId, liveSession, workspaceId);
};

/** Returns whether two autosave scopes resolve to the same storage destination. */
const isSameScope = (previous: AutoSaveScope, next: AutoSaveScope): boolean => {
  if (previous.userId !== next.userId) return false;
  return previous.workspaceId === next.workspaceId;
};

/** Returns whether two snapshots reference the same committed Redux objects. */
const isSameSnapshot = (previous: ForecastSnapshot, next: ForecastSnapshot): boolean => {
  if (previous.forecastCycle !== next.forecastCycle) return false;
  if (previous.mapView !== next.mapView) return false;
  return previous.workflowMetadata === next.workflowMetadata;
};

/** Combines a storage scope with a committed snapshot into a persistable edit. */
const createPendingAutoSave = (scope: AutoSaveScope, snapshot: ForecastSnapshot): PendingAutoSave => ({
  userId: scope.userId,
  workspaceId: scope.workspaceId,
  forecastCycle: snapshot.forecastCycle,
  mapView: snapshot.mapView,
  workflowMetadata: snapshot.workflowMetadata,
});

/** Returns whether a scope-change flush has nothing new to persist. */
const shouldSkipScopeFlush = (
  pending: PendingAutoSave | null,
  latest: ForecastSnapshot,
  lastScheduled: ForecastSnapshot,
): boolean => {
  if (isSameSnapshot(latest, lastScheduled)) return true;
  // The latest edit is already captured as the debounced pending. Its cleanup
  // flushes the old scope, so writing here would duplicate it.
  if (pending !== null && isSameSnapshot(pending, latest)) return true;
  return false;
};

/**
 * Flushes a dirty edit on workspace switch. This covers both a debounced edit
 * that never ran because React batched the document change and the switch
 * into one commit, and a newer batched edit that landed on top of an older
 * pending snapshot. In the latter case the latest snapshot wins for the old
 * scope, and the stale pending timer is suppressed so its cleanup cannot
 * overwrite the newer document. This runs before AppHooks resets the
 * document for the new workspace, so latestSnapshot still holds the old
 * workspace document.
 */
const useScopeChangeFlush = (
  userId: string | null | undefined,
  workspaceId: ForecastWorkspaceId,
  prevScopeRef: { current: AutoSaveScope },
  latestSnapshotRef: { current: ForecastSnapshot },
  lastScheduledSnapshotRef: { current: ForecastSnapshot },
  pendingAutoSaveRef: { current: PendingAutoSave | null },
  saveTimeoutRef: { current: ReturnType<typeof setTimeout> | null },
  saveGenerationRef: { current: number },
): void => {
  useEffect(() => {
    const prevScope = prevScopeRef.current;
    const nextScope: AutoSaveScope = { userId, workspaceId };
    prevScopeRef.current = nextScope;
    if (isSameScope(prevScope, nextScope)) return;
    const latest = latestSnapshotRef.current;
    if (shouldSkipScopeFlush(pendingAutoSaveRef.current, latest, lastScheduledSnapshotRef.current)) return;
    persistAutoSave(createPendingAutoSave(prevScope, latest));
    // Drop the older pending so the debounce cleanup sees a consumed pending
    // and cannot write its stale snapshot over the newer flush, regardless of
    // whether cleanup runs before or after this effect.
    if (saveTimeoutRef.current !== null) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }
    pendingAutoSaveRef.current = null;
    saveGenerationRef.current += 1;
    lastScheduledSnapshotRef.current = latest;
  }, [userId, workspaceId, prevScopeRef, latestSnapshotRef, lastScheduledSnapshotRef, pendingAutoSaveRef, saveTimeoutRef, saveGenerationRef]);
};

/** Consumes the mount render so the debounce effect skips its initial run. */
const consumeFirstRender = (
  isFirstRenderRef: { current: boolean },
  lastScheduledSnapshotRef: { current: ForecastSnapshot },
  snapshot: ForecastSnapshot,
): boolean => {
  if (!isFirstRenderRef.current) return false;
  isFirstRenderRef.current = false;
  lastScheduledSnapshotRef.current = snapshot;
  return true;
};

/** Commits a scheduled debounce only when it is still the latest generation. */
const commitScheduledAutoSave = (
  generation: number,
  saveGenerationRef: { current: number },
  pending: PendingAutoSave,
  pendingAutoSaveRef: { current: PendingAutoSave | null },
  saveTimeoutRef: { current: ReturnType<typeof setTimeout> | null },
): void => {
  saveTimeoutRef.current = null;
  if (generation !== saveGenerationRef.current) return;
  if (pendingAutoSaveRef.current !== pending) return;
  pendingAutoSaveRef.current = null;
  persistAutoSave(pending);
};

/** Clears a scheduled debounce, flushing it when the storage scope already moved on. */
const cleanupScheduledAutoSave = (
  pending: PendingAutoSave,
  effectScope: AutoSaveScope,
  pendingAutoSaveRef: { current: PendingAutoSave | null },
  saveTimeoutRef: { current: ReturnType<typeof setTimeout> | null },
  currentScopeRef: { current: AutoSaveScope },
  latestSnapshotRef: { current: ForecastSnapshot },
  lastScheduledSnapshotRef: { current: ForecastSnapshot },
): void => {
  if (saveTimeoutRef.current !== null) {
    clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = null;
  }
  if (pendingAutoSaveRef.current !== pending) return;
  // Do not lose the previous workspace's last debounced edit when a
  // route switch changes the storage destination.
  if (!isSameScope(currentScopeRef.current, effectScope)) {
    const latest = latestSnapshotRef.current;
    if (!isSameSnapshot(pending, latest)) {
      // A newer edit was batched with the switch after this pending was
      // scheduled. The newer document wins for the old scope, and marking it
      // scheduled keeps a later scope-change flush from writing it twice.
      persistAutoSave(createPendingAutoSave(effectScope, latest));
      lastScheduledSnapshotRef.current = latest;
    } else {
      persistAutoSave(pending);
    }
  }
  pendingAutoSaveRef.current = null;
};

/** Debounces forecast edits into the current anonymous or account-scoped autosave. */
const useDebouncedAutoSaveEffect = (
  forecastCycle: ForecastSnapshot['forecastCycle'],
  mapView: ForecastSnapshot['mapView'],
  workflowMetadata: ForecastSnapshot['workflowMetadata'],
  userId: string | null | undefined,
  workspaceId: ForecastWorkspaceId,
  isFirstRenderRef: { current: boolean },
  saveGenerationRef: { current: number },
  saveTimeoutRef: { current: ReturnType<typeof setTimeout> | null },
  pendingAutoSaveRef: { current: PendingAutoSave | null },
  currentScopeRef: { current: AutoSaveScope },
  lastScheduledSnapshotRef: { current: ForecastSnapshot },
  latestSnapshotRef: { current: ForecastSnapshot },
): void => {
  useEffect(() => {
    const snapshot: ForecastSnapshot = { forecastCycle, mapView, workflowMetadata };
    if (consumeFirstRender(isFirstRenderRef, lastScheduledSnapshotRef, snapshot)) return;

    const effectScope: AutoSaveScope = { userId, workspaceId };
    const pendingAutoSave = createPendingAutoSave(effectScope, snapshot);
    pendingAutoSaveRef.current = pendingAutoSave;
    lastScheduledSnapshotRef.current = snapshot;
    const generation = ++saveGenerationRef.current;
    saveTimeoutRef.current = setTimeout(() => {
      commitScheduledAutoSave(generation, saveGenerationRef, pendingAutoSave, pendingAutoSaveRef, saveTimeoutRef);
    }, AUTOSAVE_DELAY);

    // skipcq: JS-0045 React effects intentionally return cleanup callbacks.
    return function cleanupAutoSaveTimeout() {
      cleanupScheduledAutoSave(pendingAutoSave, effectScope, pendingAutoSaveRef, saveTimeoutRef, currentScopeRef, latestSnapshotRef, lastScheduledSnapshotRef);
    };
  }, [
    forecastCycle,
    mapView,
    userId,
    workspaceId,
    workflowMetadata,
    isFirstRenderRef,
    saveGenerationRef,
    saveTimeoutRef,
    pendingAutoSaveRef,
    currentScopeRef,
    lastScheduledSnapshotRef,
    latestSnapshotRef,
  ]);
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
  const pendingAutoSaveRef = useRef<PendingAutoSave | null>(null);
  const currentScopeRef = useRef<AutoSaveScope>({ userId, workspaceId });
  currentScopeRef.current = { userId, workspaceId };
  // Latest committed Redux snapshot, updated synchronously every render so a
  // workspace switch that batches past the debounce effect still has the
  // pre-switch document available for a scope-change flush.
  const latestSnapshotRef = useRef<ForecastSnapshot>({ forecastCycle, mapView, workflowMetadata });
  latestSnapshotRef.current = { forecastCycle, mapView, workflowMetadata };
  const prevScopeRef = useRef<AutoSaveScope>({ userId, workspaceId });
  const lastScheduledSnapshotRef = useRef<ForecastSnapshot>({ forecastCycle, mapView, workflowMetadata });

  // Keep this scope-change flush above the debounced save effect so a batched
  // document + scope commit flushes the old workspace first. Behavior is pinned
  // by useAutoSave.test.tsx ("flushes the previous workspace edit") and the
  // dirty-switch e2e spec.
  useScopeChangeFlush(userId, workspaceId, prevScopeRef, latestSnapshotRef, lastScheduledSnapshotRef, pendingAutoSaveRef, saveTimeoutRef, saveGenerationRef);
  useDebouncedAutoSaveEffect(
    forecastCycle,
    mapView,
    workflowMetadata,
    userId,
    workspaceId,
    isFirstRender,
    saveGenerationRef,
    saveTimeoutRef,
    pendingAutoSaveRef,
    currentScopeRef,
    lastScheduledSnapshotRef,
    latestSnapshotRef,
  );
};
