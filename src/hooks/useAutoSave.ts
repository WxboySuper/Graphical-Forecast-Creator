import { useEffect, useLayoutEffect, useRef } from 'react';
import { useSelector } from 'react-redux';
import { RootState } from '../store';
import { selectForecastCycle } from '../store/forecastSlice';
import { getScopedStorageKey, getStorageScope } from '../utils/storageScope';
import { DEFAULT_FORECAST_WORKSPACE, FORECAST_WORKSPACES, type ForecastWorkspaceId } from '../config/forecastWorkspaces';
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
  cycleGeneration: number;
}

interface PendingAutoSave extends AutoSaveScope, ForecastSnapshot {}

interface AutoSaveRefs {
  prevScopeRef: { current: AutoSaveScope };
  latestSnapshotRef: { current: ForecastSnapshot };
  lastScheduledSnapshotRef: { current: ForecastSnapshot };
  pendingAutoSaveRef: { current: PendingAutoSave | null };
  saveTimeoutRef: { current: ReturnType<typeof setTimeout> | null };
  saveGenerationRef: { current: number };
  currentScopeRef: { current: AutoSaveScope };
  isFirstRenderRef: { current: boolean };
}

interface SnapshotStorageState {
  scopedKey: string;
  anonymousKey: string;
  scopedValue: string | null;
  legacyValue: string | null;
}

interface LiveSessionReconciliation extends SnapshotStorageState {
  liveSession: unknown;
}

interface ScopeChangeFlushParams {
  userId: string | null | undefined;
  workspaceId: ForecastWorkspaceId;
  snapshot: ForecastSnapshot;
  refs: Pick<
    AutoSaveRefs,
    | 'prevScopeRef'
    | 'latestSnapshotRef'
    | 'lastScheduledSnapshotRef'
    | 'pendingAutoSaveRef'
    | 'saveTimeoutRef'
    | 'saveGenerationRef'
  >;
}

interface ScheduledAutoSaveCommit {
  generation: number;
  pending: PendingAutoSave;
  refs: Pick<AutoSaveRefs, 'saveGenerationRef' | 'pendingAutoSaveRef' | 'saveTimeoutRef'>;
}

interface ScheduledAutoSaveCleanup {
  pending: PendingAutoSave;
  effectScope: AutoSaveScope;
  refs: Pick<
    AutoSaveRefs,
    | 'pendingAutoSaveRef'
    | 'saveTimeoutRef'
    | 'currentScopeRef'
    | 'latestSnapshotRef'
    | 'lastScheduledSnapshotRef'
  >;
}

interface DebouncedAutoSaveParams {
  forecastCycle: ForecastSnapshot['forecastCycle'];
  mapView: ForecastSnapshot['mapView'];
  workflowMetadata: ForecastSnapshot['workflowMetadata'];
  cycleGeneration: ForecastSnapshot['cycleGeneration'];
  userId: string | null | undefined;
  workspaceId: ForecastWorkspaceId;
  refs: Pick<
    AutoSaveRefs,
    | 'isFirstRenderRef'
    | 'saveGenerationRef'
    | 'saveTimeoutRef'
    | 'pendingAutoSaveRef'
    | 'currentScopeRef'
    | 'lastScheduledSnapshotRef'
    | 'latestSnapshotRef'
  >;
}

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
const promoteAnonymousSnapshot = ({
  scopedKey,
  anonymousKey,
  scopedValue,
  legacyValue,
}: SnapshotStorageState): void => {
  if (scopedValue !== null) return;
  if (legacyValue === null) return;
  localStorage.setItem(scopedKey, legacyValue);
  localStorage.removeItem(anonymousKey);
};

/** Reconciles live editor state with scoped storage without overwriting existing account data. */
const reconcileLiveSessionSnapshot = ({
  scopedKey,
  anonymousKey,
  scopedValue,
  legacyValue,
  liveSession,
}: LiveSessionReconciliation): void => {
  if (scopedValue !== null) return;
  const liveValue = liveSession == null ? null : JSON.stringify(liveSession) ?? null;
  const preferred = pickNewestAutoSaveValue(legacyValue, liveValue);
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
      reconcileLiveSessionSnapshot({ scopedKey, anonymousKey, scopedValue, legacyValue, liveSession });
      return;
    }

    promoteAnonymousSnapshot({ scopedKey, anonymousKey, scopedValue, legacyValue });
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

/**
 * Signs every workspace in at once. Sign-in can happen on any page, so waiting
 * for each workspace to mount would leave anonymous drafts behind until the
 * user happened to open them. Only the mounted workspace can reconcile live
 * editor state; the rest promote their stored anonymous copy.
 */
export const migrateWorkspaceAutoSaves = (
  userId?: string | null,
  liveSession?: unknown,
  mountedWorkspaceId: ForecastWorkspaceId = DEFAULT_FORECAST_WORKSPACE,
): void => {
  if (!userId) return;
  for (const workspace of FORECAST_WORKSPACES) {
    migrateWorkspaceAutoSave(
      userId,
      workspace.id === mountedWorkspaceId ? liveSession : undefined,
      workspace.id,
    );
  }
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
  if (previous.workflowMetadata !== next.workflowMetadata) return false;
  return previous.cycleGeneration === next.cycleGeneration;
};

/** Combines a storage scope with a committed snapshot into a persistable edit. */
const createPendingAutoSave = (scope: AutoSaveScope, snapshot: ForecastSnapshot): PendingAutoSave => ({
  userId: scope.userId,
  workspaceId: scope.workspaceId,
  forecastCycle: snapshot.forecastCycle,
  mapView: snapshot.mapView,
  workflowMetadata: snapshot.workflowMetadata,
  cycleGeneration: snapshot.cycleGeneration,
});

/** Returns whether a scope-change flush has nothing new to persist. */
const shouldSkipScopeFlush = (
  pending: PendingAutoSave | null,
  latest: ForecastSnapshot,
  lastScheduled: ForecastSnapshot,
): boolean => {
  // A pending value has not reached storage yet. Flush it synchronously before
  // the old effect cleanup can write against a snapshot from the new workspace.
  if (pending !== null) return false;
  return isSameSnapshot(latest, lastScheduled);
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
const useScopeChangeFlush = ({ userId, workspaceId, snapshot, refs }: ScopeChangeFlushParams): void => {
  const {
    prevScopeRef,
    latestSnapshotRef,
    lastScheduledSnapshotRef,
    pendingAutoSaveRef,
    saveTimeoutRef,
    saveGenerationRef,
  } = refs;
  useLayoutEffect(() => {
    const prevScope = prevScopeRef.current;
    const nextScope: AutoSaveScope = { userId, workspaceId };
    prevScopeRef.current = nextScope;
    if (isSameScope(prevScope, nextScope)) return;
    const previousSnapshot = latestSnapshotRef.current;
    // A workspace reducer reset and scope change share one commit. Preserve the
    // prior committed document when its generation changes; for scope-only
    // changes, keep edits batched into the current render.
    const latest = previousSnapshot.cycleGeneration !== snapshot.cycleGeneration
      ? previousSnapshot
      : snapshot;
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
  }, [userId, workspaceId, snapshot, prevScopeRef, latestSnapshotRef, lastScheduledSnapshotRef, pendingAutoSaveRef, saveTimeoutRef, saveGenerationRef]);
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
const commitScheduledAutoSave = ({ generation, pending, refs }: ScheduledAutoSaveCommit): void => {
  const { saveGenerationRef, pendingAutoSaveRef, saveTimeoutRef } = refs;
  saveTimeoutRef.current = null;
  if (generation !== saveGenerationRef.current) return;
  if (pendingAutoSaveRef.current !== pending) return;
  pendingAutoSaveRef.current = null;
  persistAutoSave(pending);
};

/** Clears a scheduled debounce, flushing it when the storage scope already moved on. */
const cleanupScheduledAutoSave = ({ pending, effectScope, refs }: ScheduledAutoSaveCleanup): void => {
  const {
    pendingAutoSaveRef,
    saveTimeoutRef,
    currentScopeRef,
    latestSnapshotRef,
    lastScheduledSnapshotRef,
  } = refs;
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
const useDebouncedAutoSaveEffect = ({ forecastCycle, mapView, workflowMetadata, cycleGeneration, userId, workspaceId, refs }: DebouncedAutoSaveParams): void => {
  const {
    isFirstRenderRef,
    saveGenerationRef,
    saveTimeoutRef,
    pendingAutoSaveRef,
    currentScopeRef,
    lastScheduledSnapshotRef,
    latestSnapshotRef,
  } = refs;
  useEffect(() => {
    const snapshot: ForecastSnapshot = { forecastCycle, mapView, workflowMetadata, cycleGeneration };
    latestSnapshotRef.current = snapshot;
    if (consumeFirstRender(isFirstRenderRef, lastScheduledSnapshotRef, snapshot)) return;

    const effectScope: AutoSaveScope = { userId, workspaceId };
    const pendingAutoSave = createPendingAutoSave(effectScope, snapshot);
    pendingAutoSaveRef.current = pendingAutoSave;
    lastScheduledSnapshotRef.current = snapshot;
    const generation = ++saveGenerationRef.current;
    saveTimeoutRef.current = setTimeout(() => {
      commitScheduledAutoSave({ generation, pending: pendingAutoSave, refs: { saveGenerationRef, pendingAutoSaveRef, saveTimeoutRef } });
    }, AUTOSAVE_DELAY);

    // skipcq: JS-0045 React effects intentionally return cleanup callbacks.
    return function cleanupAutoSaveTimeout() {
      cleanupScheduledAutoSave({
        pending: pendingAutoSave,
        effectScope,
        refs: { pendingAutoSaveRef, saveTimeoutRef, currentScopeRef, latestSnapshotRef, lastScheduledSnapshotRef },
      });
    };
  }, [
    forecastCycle,
    mapView,
    userId,
    workspaceId,
    workflowMetadata,
    cycleGeneration,
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
  const cycleGeneration = useSelector((state: RootState) => state.forecast.cycleGeneration);
  const isFirstRender = useRef(true);
  const saveGenerationRef = useRef(0);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingAutoSaveRef = useRef<PendingAutoSave | null>(null);
  const currentScopeRef = useRef<AutoSaveScope>({ userId, workspaceId });
  const latestSnapshotRef = useRef<ForecastSnapshot>({ forecastCycle, mapView, workflowMetadata, cycleGeneration });
  const prevScopeRef = useRef<AutoSaveScope>({ userId, workspaceId });
  const lastScheduledSnapshotRef = useRef<ForecastSnapshot>({ forecastCycle, mapView, workflowMetadata, cycleGeneration });

  // Flush the old scope before publishing this render's selectors as latest.
  useScopeChangeFlush({
    userId,
    workspaceId,
    snapshot: { forecastCycle, mapView, workflowMetadata, cycleGeneration },
    refs: { prevScopeRef, latestSnapshotRef, lastScheduledSnapshotRef, pendingAutoSaveRef, saveTimeoutRef, saveGenerationRef },
  });

  // Keep refs tied to committed renders, and run this after the old-scope flush.
  useLayoutEffect(() => {
    currentScopeRef.current = { userId, workspaceId };
    latestSnapshotRef.current = { forecastCycle, mapView, workflowMetadata, cycleGeneration };
  }, [userId, workspaceId, forecastCycle, mapView, workflowMetadata, cycleGeneration]);
  useDebouncedAutoSaveEffect({
    forecastCycle,
    mapView,
    workflowMetadata,
    cycleGeneration,
    userId,
    workspaceId,
    refs: {
      isFirstRenderRef: isFirstRender,
      saveGenerationRef,
      saveTimeoutRef,
      pendingAutoSaveRef,
      currentScopeRef,
      lastScheduledSnapshotRef,
      latestSnapshotRef,
    },
  });
};
