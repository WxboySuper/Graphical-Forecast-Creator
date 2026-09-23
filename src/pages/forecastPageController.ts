import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { Dispatch, UnknownAction } from 'redux';
import type { ForecastMapHandle } from '../components/Map/ForecastMap';
import type { AddToastFn } from '../components/Layout';
import { useAuth } from '../auth/AuthProvider';
import {
  clearWorkflowMetadata,
  importForecastCycle,
  markAsSaved,
  resetForecasts,
  restoreForecastCycle,
  saveCurrentCycle,
  setMapView,
  setWorkflowMetadata,
  selectForecastCycle,
} from '../store/forecastSlice';
import type { RootState } from '../store';
import { downloadBlob, readForecastImportFile, serializeForecast, validateForecastDataReason } from '../utils/fileUtils';
import { resolveNativeFileContent } from '../utils/forecastTransfer/nativeImportUtils';
import type { ForecastCycle } from '../types/outlooks';
import { deserializeForecastWorkspace, serializeForecastWorkspace } from '../utils/forecastWorkspacePersistenceAdapter';
import { DEFAULT_FORECAST_WORKSPACE, type ForecastWorkspaceId } from '../config/forecastWorkspaces';
import { getForecastDataFromWorkspacePayload, type ForecastWorkspacePayload } from '../utils/forecastWorkspacePersistence';
import type { ForecastImportResult } from '../utils/forecastTransfer';
import { getAutoSaveStorageKey, migrateLegacyAutoSave, selectPreferredAutoSaveValue } from '../hooks/useAutoSave';
import {
  DAY_ROLLOVER_CHECK_INTERVAL_MS,
  DAY_ROLLOVER_LAST_ACTIVE_KEY,
  DAY_ROLLOVER_PROMPTED_KEY,
  type DayRolloverPromptState,
  clearStoredRolloverPrompt,
  getRolloverStorageKey,
  readStoredDayValue,
  readStoredRolloverPrompt,
  writeStoredDayValue,
  writeStoredRolloverPrompt,
} from '../utils/dayRolloverStorage';
import { getStorageScope, getScopedStorageKey } from '../utils/storageScope';
import { countForecastMetrics } from '../utils/forecastMetrics';
import { getLocalCalendarDate } from '../utils/localDate';
import { queueProductMetric } from '../utils/productMetrics';
import type { UseCloudCyclesResult } from '../hooks/useCloudCycles';

export type ShortcutDispatch = Dispatch<UnknownAction>;

interface LoadedForecastPayload {
  rawData: {
    mapView?: { center: [number, number]; zoom: number };
    cycleMetadata?: import('../types/workflow').CycleMetadata | null;
  };
  deserializedCycle: ForecastCycle;
}

interface StoredCloudMeta {
  id?: string;
  label?: string;
}

const CLOUD_CYCLE_PAYLOAD_KEY = 'cloudCyclePayload';
const CLOUD_CYCLE_META_KEY = 'cloudCycleMeta';

/** Reads the current map view through the adapter, with the application default as a safe fallback. */
export const buildMapView = (ref: React.RefObject<ForecastMapHandle | null>) => {
  const adapter = ref.current;
  return adapter?.getView() ?? {
    center: [39.8283, -98.5795] as [number, number],
    zoom: 4,
  };
};

const getForecastImportErrorMessage = (file: File, error: unknown): string => {
  if (error instanceof SyntaxError && !file.name.toLowerCase().endsWith('.zip')) {
    return 'File is not valid JSON.';
  }
  return error instanceof Error ? error.message : 'File is not a valid forecast or workflow package.';
};

/** Reads and validates one forecast JSON file through the workspace-aware import pipeline. */
export const parseLoadedForecast = async (
  file: File,
  addToast: AddToastFn,
  workspaceId: ForecastWorkspaceId = DEFAULT_FORECAST_WORKSPACE,
): Promise<LoadedForecastPayload | null> => {
  let data: unknown;
  try {
    data = await readForecastImportFile(file);
  } catch (error) {
    addToast(getForecastImportErrorMessage(file, error), 'error');
    return null;
  }

  const validationError = validateForecastDataReason(data);
  if (validationError) {
    addToast(validationError, 'error');
    return null;
  }

  let resolved: ReturnType<typeof resolveNativeFileContent>;
  try {
    resolved = resolveNativeFileContent(data);
  } catch (error) {
    addToast(error instanceof Error ? error.message : 'File is not a valid forecast or workflow package.', 'error');
    return null;
  }

  if (resolved.workspaceId !== workspaceId) {
    addToast(`This forecast belongs to the ${resolved.workspaceId} workspace. Open it there before importing it.`, 'error');
    return null;
  }

  return {
    rawData: { mapView: resolved.mapView, cycleMetadata: resolved.cycleMetadata },
    deserializedCycle: resolved.forecastCycle,
  };
};

/** Returns true when one serialized forecast day contains drawable outlook features. */
export const dayHasAnyFeatures = (dayData: unknown): boolean => {
  if (!dayData || typeof dayData !== 'object') return false;
  return Object.values(dayData as Record<string, { size?: number } | undefined>)
    .some((outlookMap) => (outlookMap?.size ?? 0) > 0);
};

/** Imports the cycle payload and its workflow metadata into the active session. */
const applyImportCycleState = (dispatch: ShortcutDispatch, result: ForecastImportResult): void => {
  dispatch(importForecastCycle(result.forecastCycle));
  if (result.cycleMetadata) dispatch(setWorkflowMetadata(result.cycleMetadata));
  else if (result.cycleMetadata === null) dispatch(clearWorkflowMetadata());
};

/** Applies the imported map view, falling back to the US center for drawn days. */
const applyImportMapViewState = (
  dispatch: ShortcutDispatch,
  mapRef: React.RefObject<ForecastMapHandle | null>,
  result: ForecastImportResult,
): null => {
  if (result.mapView) {
    dispatch(setMapView(result.mapView));
    return null;
  }
  const currentDayData = result.forecastCycle.days[result.forecastCycle.currentDay]?.data;
  if (mapRef.current?.getMap() && dayHasAnyFeatures(currentDayData)) {
    dispatch(setMapView({ center: [39.8283, -98.5795], zoom: 4 }));
  }
  return null;
};

/** Applies any supported forecast import result to the active workspace session. */
export const applyForecastImportResult = (
  result: ForecastImportResult,
  dispatch: ShortcutDispatch,
  mapRef: React.RefObject<ForecastMapHandle | null>,
  workspaceId: ForecastWorkspaceId,
): string | null => {
  const workspaceError = getForecastImportWorkspaceError(result, workspaceId);
  if (workspaceError) return workspaceError;
  applyImportCycleState(dispatch, result);
  return applyImportMapViewState(dispatch, mapRef, result);
};

/** Returns an error when a transfer cannot be opened in the active forecast workspace. */
export const getForecastImportWorkspaceError = (
  result: ForecastImportResult,
  workspaceId: ForecastWorkspaceId,
): string | null => {
  if (result.workspaceId === null) {
    if (result.format === 'kml' || result.format === 'kmz') {
      return 'This file does not declare a forecast workspace. KML/KMZ geometry cannot be imported across the workspace boundary.';
    }
    return 'This file does not declare a forecast workspace and cannot be imported.';
  }
  return result.workspaceId === workspaceId
    ? null
    : `This forecast belongs to the ${result.workspaceId} workspace. Open it there before importing it.`;
};

/** Downloads the active workspace cycle as a workspace-owned native JSON file. */
export const downloadWorkspaceForecastJson = (
  workspaceId: ForecastWorkspaceId,
  forecastCycle: ReturnType<typeof selectForecastCycle>,
  mapView: { center: [number, number]; zoom: number },
  workflowMetadata?: import('../types/workflow').CycleMetadata,
): void => {
  const payload = serializeForecastWorkspace(workspaceId, forecastCycle, mapView, workflowMetadata);
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  downloadBlob(
    new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }),
    `gfc-${workspaceId}-forecast-${timestamp}.json`,
  );
};

const useForecastSaveAction = (
  dispatch: ShortcutDispatch,
  addToast: AddToastFn,
  forecastCycle: ReturnType<typeof selectForecastCycle>,
  mapRef: React.RefObject<ForecastMapHandle | null>,
  user: ReturnType<typeof useAuth>['user'],
  workflowMetadata?: import('../types/workflow').CycleMetadata,
  workspaceId: ForecastWorkspaceId = DEFAULT_FORECAST_WORKSPACE,
) => useCallback(() => {
  try {
    downloadWorkspaceForecastJson(workspaceId, forecastCycle, buildMapView(mapRef), workflowMetadata);
    dispatch(markAsSaved());
    queueProductMetric({ event: 'cycle_saved', user });
    addToast('Forecast exported to JSON!', 'success');
  } catch {
    addToast('Error exporting forecast.', 'error');
  }
}, [addToast, dispatch, forecastCycle, mapRef, user, workflowMetadata, workspaceId]);

/** Composes the save action owned by the forecast session controller. */
export const useForecastFileActions = (
  dispatch: ShortcutDispatch,
  addToast: AddToastFn,
  forecastCycle: ReturnType<typeof selectForecastCycle>,
  mapRef: React.RefObject<ForecastMapHandle | null>,
  user: ReturnType<typeof useAuth>['user'],
  workflowMetadata?: import('../types/workflow').CycleMetadata,
  workspaceId: ForecastWorkspaceId = DEFAULT_FORECAST_WORKSPACE,
) => ({
  handleSave: useForecastSaveAction(dispatch, addToast, forecastCycle, mapRef, user, workflowMetadata, workspaceId),
});

/** Returns true when a cycle has at least one forecast day or discussion. */
export const hasRolloverForecastData = (forecastCycle: ReturnType<typeof selectForecastCycle>): boolean =>
  countForecastMetrics(forecastCycle).forecastDays > 0;

export const cycleHasDiscussionContent = (forecastCycle: ReturnType<typeof selectForecastCycle>): boolean =>
  Object.values(forecastCycle.days).some((dayData) => Boolean(dayData?.discussion));

export const hasUnpublishedDiscussionDrafts = (
  discussionDraftsByScope: RootState['forecast']['discussionDraftsByScope'],
): boolean => Object.keys(discussionDraftsByScope).length > 0;

export const hasUnsavedRolloverCandidateSession = (
  forecastCycle: ReturnType<typeof selectForecastCycle>,
  isSaved: boolean,
): boolean => !isSaved && (hasRolloverForecastData(forecastCycle) || cycleHasDiscussionContent(forecastCycle));

export const buildRolloverSaveLabel = (cycleDate: string): string => {
  const parsedDate = new Date(`${cycleDate}T00:00:00`);
  const labelDate = Number.isNaN(parsedDate.getTime())
    ? cycleDate
    : parsedDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return `Rollover save • ${labelDate}`;
};

export const formatRolloverDayLabel = (value: string): string => {
  const parsedDate = new Date(`${value}T00:00:00`);
  return Number.isNaN(parsedDate.getTime())
    ? value
    : parsedDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
};

export const parseStoredForecastPayload = (
  storedValue: string | null,
  workspaceId: ForecastWorkspaceId = DEFAULT_FORECAST_WORKSPACE,
): ForecastWorkspacePayload | null => {
  if (!storedValue) return null;
  try {
    const parsed = JSON.parse(storedValue) as unknown;
    const restored = deserializeForecastWorkspace(parsed);
    return restored.workspaceId === workspaceId ? parsed as ForecastWorkspacePayload : null;
  } catch {
    return null;
  }
};

export const parseStoredCloudMeta = (storedValue: string | null): StoredCloudMeta | null => {
  if (!storedValue) return null;
  try {
    return JSON.parse(storedValue) as StoredCloudMeta;
  } catch {
    return null;
  }
};

/** Returns the source workspace when a stored cloud handoff belongs elsewhere, else null. */
export const getMismatchedCloudWorkspaceId = (
  storedValue: string | null,
  workspaceId: ForecastWorkspaceId,
): ForecastWorkspaceId | null => {
  if (!storedValue) return null;
  try {
    const parsed = JSON.parse(storedValue) as unknown;
    const restored = deserializeForecastWorkspace(parsed);
    return restored.workspaceId === workspaceId ? null : restored.workspaceId;
  } catch {
    return null;
  }
};

export const clearStoredCloudSession = (userId?: string | null) => {
  sessionStorage.removeItem(getScopedStorageKey(CLOUD_CYCLE_PAYLOAD_KEY, getStorageScope(userId)));
  sessionStorage.removeItem(getScopedStorageKey(CLOUD_CYCLE_META_KEY, getStorageScope(userId)));
  if (!userId) {
    sessionStorage.removeItem(CLOUD_CYCLE_PAYLOAD_KEY);
    sessionStorage.removeItem(CLOUD_CYCLE_META_KEY);
  }
};

export const hasRestorableCloudSelection = (
  cloudMeta: StoredCloudMeta | null,
): cloudMeta is Required<Pick<StoredCloudMeta, 'id' | 'label'>> => Boolean(cloudMeta?.id && cloudMeta.label);

const restoreStoredForecastPayload = (
  data: ForecastWorkspacePayload,
  dispatch: ShortcutDispatch,
  preserveDiscussionDrafts = false,
) => {
  const restored = deserializeForecastWorkspace(data);
  const deserializedCycle = restored.forecastCycle;
  dispatch(preserveDiscussionDrafts ? restoreForecastCycle(deserializedCycle, true) : importForecastCycle(deserializedCycle));
  const rawData = getForecastDataFromWorkspacePayload(data) as LoadedForecastPayload['rawData'];
  if (rawData.cycleMetadata) dispatch(setWorkflowMetadata(rawData.cycleMetadata));
  else if (rawData.cycleMetadata === null) dispatch(clearWorkflowMetadata());
  if (rawData.mapView) dispatch(setMapView(rawData.mapView));
};

interface RestoreCloudSessionOptions {
  dispatch: ShortcutDispatch;
  addToast: AddToastFn;
  onCloudCycleLoaded?: (cloudCycle: { id: string; label: string }) => void;
  userId?: string | null;
  workspaceId: ForecastWorkspaceId;
}

const restoreCloudSession = ({
  dispatch,
  addToast,
  onCloudCycleLoaded,
  userId,
  workspaceId,
}: RestoreCloudSessionOptions): boolean => {
  const payloadKey = getScopedStorageKey(CLOUD_CYCLE_PAYLOAD_KEY, getStorageScope(userId));
  const storedValue = sessionStorage.getItem(payloadKey) ?? (!userId ? sessionStorage.getItem(CLOUD_CYCLE_PAYLOAD_KEY) : null);
  const payload = parseStoredForecastPayload(storedValue, workspaceId);
  if (!payload) {
    // A pending handoff for another workspace must not fail silently into local
    // restore. Surface it, drop the stale handoff, and stop the fallback chain.
    if (getMismatchedCloudWorkspaceId(storedValue, workspaceId)) {
      clearStoredCloudSession(userId);
      addToast('This cloud cycle belongs to a different forecast workspace and was not loaded.', 'error');
      return true;
    }
    return false;
  }

  const metaKey = getScopedStorageKey(CLOUD_CYCLE_META_KEY, getStorageScope(userId));
  const cloudMeta = parseStoredCloudMeta(sessionStorage.getItem(metaKey) ?? (!userId ? sessionStorage.getItem(CLOUD_CYCLE_META_KEY) : null));
  restoreStoredForecastPayload(payload, dispatch);
  if (onCloudCycleLoaded && hasRestorableCloudSelection(cloudMeta)) onCloudCycleLoaded({ id: cloudMeta.id, label: cloudMeta.label });
  clearStoredCloudSession(userId);
  addToast('Cloud forecast loaded successfully.', 'success');
  return true;
};

const shouldSkipLocalRestore = (
  forecastCycle: ReturnType<typeof selectForecastCycle>,
  discussionDraftsByScope: RootState['forecast']['discussionDraftsByScope'],
) => hasRolloverForecastData(forecastCycle) || cycleHasDiscussionContent(forecastCycle) || hasUnpublishedDiscussionDrafts(discussionDraftsByScope);

const copyLegacyAutoSaveToScopedStorage = (scopedKey: string, legacyValue: string | null): void => {
  if (legacyValue === null) return;
  localStorage.setItem(scopedKey, legacyValue);
  localStorage.removeItem('forecastData');
};

interface LocalRestoreCandidate {
  scopedKey: string;
  storedValue: string | null;
  legacyValue: string | null;
  shouldMigrateLegacy: boolean;
}

const readLocalRestoreCandidate = (
  userId?: string | null,
  workspaceId: ForecastWorkspaceId = DEFAULT_FORECAST_WORKSPACE,
): LocalRestoreCandidate => {
  const scopedKey = getAutoSaveStorageKey(userId, workspaceId);
  const scopedValue = localStorage.getItem(scopedKey);
  if (!userId || workspaceId !== DEFAULT_FORECAST_WORKSPACE) {
    return { scopedKey, storedValue: scopedValue, legacyValue: null, shouldMigrateLegacy: false };
  }

  const legacyValue = localStorage.getItem('forecastData');
  const storedValue = selectPreferredAutoSaveValue(scopedValue, legacyValue);
  return {
    scopedKey,
    storedValue,
    legacyValue,
    shouldMigrateLegacy: legacyValue !== null && storedValue === legacyValue,
  };
};

interface RestoreLocalSessionOptions {
  dispatch: ShortcutDispatch;
  addToast: AddToastFn;
  currentSession: { forecastCycle: ReturnType<typeof selectForecastCycle>; discussionDraftsByScope: RootState['forecast']['discussionDraftsByScope'] };
  userId?: string | null;
  workspaceId: ForecastWorkspaceId;
}

const restoreLocalSession = ({
  dispatch,
  addToast,
  currentSession,
  userId,
  workspaceId,
}: RestoreLocalSessionOptions): boolean => {
  if (shouldSkipLocalRestore(currentSession.forecastCycle, currentSession.discussionDraftsByScope)) return false;
  const candidate = readLocalRestoreCandidate(userId, workspaceId);
  const data = parseStoredForecastPayload(candidate.storedValue, workspaceId);
  if (!data) return false;
  if (candidate.shouldMigrateLegacy) copyLegacyAutoSaveToScopedStorage(candidate.scopedKey, candidate.legacyValue);
  restoreStoredForecastPayload(data, dispatch, true);
  addToast('Session restored from auto-save.', 'success');
  return true;
};

const restoreAvailableSession = (
  dispatch: ShortcutDispatch,
  addToast: AddToastFn,
  currentSession: { forecastCycle: ReturnType<typeof selectForecastCycle>; discussionDraftsByScope: RootState['forecast']['discussionDraftsByScope']; onCloudCycleLoaded?: (cloudCycle: { id: string; label: string }) => void },
  userId?: string | null,
  workspaceId: ForecastWorkspaceId = DEFAULT_FORECAST_WORKSPACE,
) => restoreCloudSession({ dispatch, addToast, onCloudCycleLoaded: currentSession.onCloudCycleLoaded, userId, workspaceId })
  || restoreLocalSession({ dispatch, addToast, currentSession, userId, workspaceId });

export const buildRestoreKey = (
  userId?: string | null,
  workspaceId: ForecastWorkspaceId = DEFAULT_FORECAST_WORKSPACE,
): string => workspaceId === DEFAULT_FORECAST_WORKSPACE
  ? userId || 'anonymous'
  : `${userId || 'anonymous'}:${workspaceId}`;

/** Restores the pending cloud or local session once per signed-in storage scope. */
export const useSessionRestore = (
  dispatch: ShortcutDispatch,
  addToast: AddToastFn,
  currentSession: {
    forecastCycle: ReturnType<typeof selectForecastCycle>;
    discussionDraftsByScope: RootState['forecast']['discussionDraftsByScope'];
    currentMapView: RootState['forecast']['currentMapView'];
    workflowMetadata: RootState['forecast']['workflowMetadata'];
    onCloudCycleLoaded?: (cloudCycle: { id: string; label: string }) => void;
  },
  userId?: string | null,
  workspaceId: ForecastWorkspaceId = DEFAULT_FORECAST_WORKSPACE,
) => {
  const onCloudCycleLoadedRef = useRef(currentSession.onCloudCycleLoaded);
  const forecastCycleRef = useRef(currentSession.forecastCycle);
  const initialDraftsRef = useRef(currentSession.discussionDraftsByScope);
  const currentMapViewRef = useRef(currentSession.currentMapView);
  const workflowMetadataRef = useRef(currentSession.workflowMetadata);
  const previousUserIdRef = useRef(userId);
  const appliedRestoreKeyRef = useRef<string | null>(null);
  const [restoreComplete, setRestoreComplete] = useState(false);
  const [restoredSession, setRestoredSession] = useState(false);
  const [restoreAttempted, setRestoreAttempted] = useState(false);

  useEffect(() => {
    onCloudCycleLoadedRef.current = currentSession.onCloudCycleLoaded;
    forecastCycleRef.current = currentSession.forecastCycle;
    currentMapViewRef.current = currentSession.currentMapView;
    workflowMetadataRef.current = currentSession.workflowMetadata;
  }, [currentSession.currentMapView, currentSession.forecastCycle, currentSession.onCloudCycleLoaded, currentSession.workflowMetadata]);

  useEffect(() => {
    try {
      const liveSession = previousUserIdRef.current == null && userId
        ? serializeForecastWorkspace(workspaceId, forecastCycleRef.current, currentMapViewRef.current, workflowMetadataRef.current)
        : undefined;
      migrateLegacyAutoSave(userId, liveSession, workspaceId);
      previousUserIdRef.current = userId;
      const restoreKey = buildRestoreKey(userId, workspaceId);
      if (appliedRestoreKeyRef.current === restoreKey) {
        setRestoreAttempted(true);
        return;
      }
      appliedRestoreKeyRef.current = restoreKey;
      setRestoredSession(restoreAvailableSession(dispatch, addToast, {
        forecastCycle: forecastCycleRef.current,
        discussionDraftsByScope: initialDraftsRef.current,
        onCloudCycleLoaded: onCloudCycleLoadedRef.current,
      }, userId, workspaceId));
    } catch {
      setRestoredSession(false);
    } finally {
      setRestoreAttempted(true);
    }
  }, [addToast, dispatch, userId, workspaceId]);

  useEffect(() => {
    if (restoreAttempted) setRestoreComplete(true);
  }, [restoreAttempted]);

  return { restoreComplete, restoredSession };
};

export const useUnsavedChangesWarning = (isSaved: boolean) => {
  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!isSaved) {
        const message = 'You have unsaved changes. Are you sure you want to leave?';
        event.returnValue = message;
        return message;
      }
      return undefined;
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isSaved]);
};

interface RolloverStorageSnapshot {
  today: string;
  scopedLastActiveKey: string;
  scopedPromptedKey: string;
  legacyLastActiveDay: string | null;
  legacyPromptedDay: string | null;
  scopedLastActiveDay: string | null;
  lastActiveDay: string | null;
  alreadyPromptedToday: boolean;
  existingPendingPrompt: DayRolloverPromptState | null;
}

const readRolloverStorageSnapshot = (userId: string | null | undefined, today: string): RolloverStorageSnapshot => {
  const scopedLastActiveKey = getRolloverStorageKey(DAY_ROLLOVER_LAST_ACTIVE_KEY, userId);
  const scopedPromptedKey = getRolloverStorageKey(DAY_ROLLOVER_PROMPTED_KEY, userId);
  const legacyLastActiveDay = userId ? null : readStoredDayValue(DAY_ROLLOVER_LAST_ACTIVE_KEY);
  const legacyPromptedDay = userId ? null : readStoredDayValue(DAY_ROLLOVER_PROMPTED_KEY);
  const scopedLastActiveDay = readStoredDayValue(scopedLastActiveKey);
  const promptedDay = readStoredDayValue(scopedPromptedKey) ?? legacyPromptedDay;

  return {
    today,
    scopedLastActiveKey,
    scopedPromptedKey,
    legacyLastActiveDay,
    legacyPromptedDay,
    scopedLastActiveDay,
    lastActiveDay: scopedLastActiveDay ?? legacyLastActiveDay,
    alreadyPromptedToday: promptedDay === today,
    existingPendingPrompt: readStoredRolloverPrompt(userId),
  };
};

const deriveLegacyRolloverPrompt = ({ today, legacyLastActiveDay, legacyPromptedDay, existingPendingPrompt }: RolloverStorageSnapshot): DayRolloverPromptState | null => {
  if (existingPendingPrompt) return existingPendingPrompt;
  if (legacyPromptedDay !== today) return null;
  if (!legacyLastActiveDay) return null;
  if (legacyLastActiveDay === today) return null;
  return { previousDay: legacyLastActiveDay, currentDay: today };
};

const migrateAnonymousLastActiveDay = (userId: string | null | undefined, snapshot: RolloverStorageSnapshot): void => {
  if (userId) return;
  if (!snapshot.legacyLastActiveDay) return;
  if (snapshot.scopedLastActiveDay) return;
  writeStoredDayValue(snapshot.scopedLastActiveKey, snapshot.legacyLastActiveDay);
};

const migratePendingRolloverPrompt = (
  userId: string | null | undefined,
  snapshot: RolloverStorageSnapshot,
  pendingPrompt: DayRolloverPromptState | null,
): void => {
  if (!pendingPrompt) return;
  if (snapshot.existingPendingPrompt) return;
  writeStoredRolloverPrompt(pendingPrompt, userId);
};

const migrateLegacyRolloverStorage = (
  userId: string | null | undefined,
  snapshot: RolloverStorageSnapshot,
  pendingPrompt: DayRolloverPromptState | null,
): void => {
  migrateAnonymousLastActiveDay(userId, snapshot);
  migratePendingRolloverPrompt(userId, snapshot, pendingPrompt);
};

const getDayRolloverSnapshot = (userId?: string | null) => {
  const snapshot = readRolloverStorageSnapshot(userId, getLocalCalendarDate());
  const pendingPrompt = deriveLegacyRolloverPrompt(snapshot);
  migrateLegacyRolloverStorage(userId, snapshot, pendingPrompt);
  return {
    today: snapshot.today,
    lastActiveDay: snapshot.lastActiveDay,
    alreadyPromptedToday: snapshot.alreadyPromptedToday,
    pendingPrompt,
  };
};

export const shouldSkipDayRolloverPrompt = ({ restoreComplete, lastActiveDay, today, alreadyPromptedToday, promptOpen, hasUnsavedWork }: {
  restoreComplete: boolean;
  lastActiveDay: string | null;
  today: string;
  alreadyPromptedToday: boolean;
  promptOpen: boolean;
  hasUnsavedWork: boolean;
}) => !restoreComplete || !lastActiveDay || lastActiveDay === today || alreadyPromptedToday || promptOpen || !hasUnsavedWork;

interface PendingPromptForTodayInput {
  restoreComplete: boolean;
  promptOpen: boolean;
  pendingPrompt?: DayRolloverPromptState | null;
  today: string;
}

const getPendingPromptForToday = ({ restoreComplete, promptOpen, pendingPrompt, today }: PendingPromptForTodayInput): DayRolloverPromptState | null => {
  if (!restoreComplete) return null;
  if (promptOpen) return null;
  if (!pendingPrompt) return null;
  if (pendingPrompt.currentDay !== today) return null;
  return pendingPrompt;
};

export const getDayRolloverPromptState = ({ restoreComplete, lastActiveDay, today, alreadyPromptedToday, promptOpen, forecastCycle, isSaved, pendingPrompt }: {
  restoreComplete: boolean;
  lastActiveDay: string | null;
  today: string;
  alreadyPromptedToday: boolean;
  promptOpen: boolean;
  forecastCycle: ReturnType<typeof selectForecastCycle>;
  isSaved: boolean;
  pendingPrompt?: DayRolloverPromptState | null;
}): DayRolloverPromptState | null => {
  const existingPrompt = getPendingPromptForToday({ restoreComplete, promptOpen, pendingPrompt, today });
  if (existingPrompt) return existingPrompt;
  const hasUnsavedWork = hasUnsavedRolloverCandidateSession(forecastCycle, isSaved);
  const shouldSkipPrompt = shouldSkipDayRolloverPrompt({ restoreComplete, lastActiveDay, today, alreadyPromptedToday, promptOpen, hasUnsavedWork });
  if (shouldSkipPrompt) return null;
  return { previousDay: lastActiveDay as string, currentDay: today };
};

export const runDayRolloverSaveAction = ({ forecastCycle, isSaved, dispatch }: { forecastCycle: ReturnType<typeof selectForecastCycle>; isSaved: boolean; dispatch: ShortcutDispatch }): boolean => {
  const didSaveSession = hasUnsavedRolloverCandidateSession(forecastCycle, isSaved);
  if (didSaveSession) dispatch(saveCurrentCycle({ label: buildRolloverSaveLabel(forecastCycle.cycleDate) }));
  dispatch(resetForecasts());
  return didSaveSession;
};

export const runDayRolloverDownloadAction = ({ forecastCycle, mapView, dispatch, clearCurrent, workspaceId = DEFAULT_FORECAST_WORKSPACE }: { forecastCycle: ReturnType<typeof selectForecastCycle>; mapView: RootState['forecast']['currentMapView']; dispatch: ShortcutDispatch; clearCurrent?: UseCloudCyclesResult['clearCurrent']; workspaceId?: ForecastWorkspaceId }): boolean => {
  try {
    downloadWorkspaceForecastJson(workspaceId, forecastCycle, mapView);
    clearCurrent?.();
    dispatch(resetForecasts());
    return true;
  } catch {
    return false;
  }
};

export const runDayRolloverCloudSaveAction = async ({ forecastCycle, currentMapView, saveCycle, clearCurrent, dispatch, workspaceId }: { forecastCycle: ReturnType<typeof selectForecastCycle>; currentMapView: RootState['forecast']['currentMapView']; saveCycle: UseCloudCyclesResult['saveCycle']; clearCurrent: UseCloudCyclesResult['clearCurrent']; dispatch: ShortcutDispatch; workspaceId: ForecastWorkspaceId }): Promise<boolean> => {
  try {
    const success = await saveCycle(buildRolloverSaveLabel(forecastCycle.cycleDate), forecastCycle.cycleDate, countForecastMetrics(forecastCycle), serializeForecast(forecastCycle, currentMapView), undefined, { saveAsNew: true, workspaceId });
    if (!success) return false;
    clearCurrent();
    dispatch(resetForecasts());
    return true;
  } catch {
    return false;
  }
};

interface DayRolloverPromptArgs {
  restoreComplete: boolean;
  restoredSession: boolean;
  dispatch: ShortcutDispatch;
  addToast: AddToastFn;
  forecastCycle: ReturnType<typeof selectForecastCycle>;
  currentMapView: RootState['forecast']['currentMapView'];
  isSaved: boolean;
  userId?: string;
  canSaveToCloud: boolean;
  saveCycle: UseCloudCyclesResult['saveCycle'];
  clearCurrent: UseCloudCyclesResult['clearCurrent'];
  workspaceId: ForecastWorkspaceId;
}

type PromptStateSetter = (value: DayRolloverPromptState | null) => void;
type ActionErrorSetter = (value: string | null) => void;
type BusyStateSetter = (value: boolean) => void;

interface DayRolloverRuntimeRefs {
  forecastCycleRef: React.MutableRefObject<ReturnType<typeof selectForecastCycle>>;
  isSavedRef: React.MutableRefObject<boolean>;
  restoredSessionRef: React.MutableRefObject<boolean>;
  promptStateRef: React.MutableRefObject<DayRolloverPromptState | null>;
}

const useDayRolloverRuntimeRefs = ({ forecastCycle, isSaved, restoredSession, promptState, userId, setPromptState, setActionError }: {
  forecastCycle: ReturnType<typeof selectForecastCycle>;
  isSaved: boolean;
  restoredSession: boolean;
  promptState: DayRolloverPromptState | null;
  userId?: string;
  setPromptState: PromptStateSetter;
  setActionError: ActionErrorSetter;
}): DayRolloverRuntimeRefs => {
  const forecastCycleRef = useRef(forecastCycle);
  const isSavedRef = useRef(isSaved);
  const restoredSessionRef = useRef(restoredSession);
  const promptStateRef = useRef(promptState);
  const previousUserIdRef = useRef(userId);

  useEffect(() => {
    if (previousUserIdRef.current === userId) return;
    previousUserIdRef.current = userId;
    setPromptState(null);
    setActionError(null);
  }, [setActionError, setPromptState, userId]);

  useEffect(() => {
    forecastCycleRef.current = forecastCycle;
    isSavedRef.current = isSaved;
    restoredSessionRef.current = restoredSession;
    promptStateRef.current = promptState;
  }, [forecastCycle, isSaved, promptState, restoredSession]);

  return { forecastCycleRef, isSavedRef, restoredSessionRef, promptStateRef };
};

const persistDetectedRolloverPrompt = (userId: string | undefined, today: string, nextPromptState: DayRolloverPromptState): void => {
  writeStoredDayValue(getRolloverStorageKey(DAY_ROLLOVER_PROMPTED_KEY, userId), today);
  writeStoredDayValue(getRolloverStorageKey(DAY_ROLLOVER_LAST_ACTIVE_KEY, userId), today);
  writeStoredRolloverPrompt(nextPromptState, userId);
};

const useDayRolloverDetection = ({ restoreComplete, userId, runtimeRefs, setPromptState, setActionError }: {
  restoreComplete: boolean;
  userId?: string;
  runtimeRefs: DayRolloverRuntimeRefs;
  setPromptState: PromptStateSetter;
  setActionError: ActionErrorSetter;
}): void => {
  const { forecastCycleRef, isSavedRef, restoredSessionRef, promptStateRef } = runtimeRefs;

  const detectDayRollover = useCallback(() => {
    const { today, lastActiveDay, alreadyPromptedToday, pendingPrompt } = getDayRolloverSnapshot(userId);
    const nextPromptState = getDayRolloverPromptState({ restoreComplete, lastActiveDay, today, alreadyPromptedToday, pendingPrompt, promptOpen: Boolean(promptStateRef.current), forecastCycle: forecastCycleRef.current, isSaved: isSavedRef.current && !restoredSessionRef.current });
    if (!nextPromptState) {
      if (restoreComplete) writeStoredDayValue(getRolloverStorageKey(DAY_ROLLOVER_LAST_ACTIVE_KEY, userId), today);
      return;
    }
    persistDetectedRolloverPrompt(userId, today, nextPromptState);
    setActionError(null);
    setPromptState(nextPromptState);
  }, [forecastCycleRef, isSavedRef, promptStateRef, restoreComplete, restoredSessionRef, setActionError, setPromptState, userId]);

  useEffect(() => {
    detectDayRollover();
    const handleVisibilityChange = () => { if (!document.hidden) detectDayRollover(); };
    const intervalId = window.setInterval(detectDayRollover, DAY_ROLLOVER_CHECK_INTERVAL_MS);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => { window.clearInterval(intervalId); document.removeEventListener('visibilitychange', handleVisibilityChange); };
  }, [detectDayRollover]);
};

const useDayRolloverActions = ({ addToast, clearCurrent, completeRollover, currentMapView, dispatch, forecastCycle, setActionError, setIsBusy, saveCycle, workspaceId }: Pick<DayRolloverPromptArgs, 'addToast' | 'clearCurrent' | 'currentMapView' | 'dispatch' | 'forecastCycle' | 'saveCycle' | 'workspaceId'> & {
  completeRollover: () => void;
  setActionError: ActionErrorSetter;
  setIsBusy: BusyStateSetter;
}) => {
  const handleKeepCurrentSession = useCallback(() => completeRollover(), [completeRollover]);
  const handleDownloadAndStartNewDay = useCallback(() => {
    if (!runDayRolloverDownloadAction({ forecastCycle, mapView: currentMapView, dispatch, clearCurrent, workspaceId })) {
      setActionError('Unable to download this session. Your current forecast is still open.');
      return;
    }
    addToast('Forecast downloaded and a new day started.', 'success');
    completeRollover();
  }, [addToast, clearCurrent, completeRollover, currentMapView, dispatch, forecastCycle, setActionError, workspaceId]);
  const handleSaveToCloudAndStartNewDay = useCallback(async () => {
    setIsBusy(true);
    setActionError(null);
    try {
      const success = await runDayRolloverCloudSaveAction({ forecastCycle, currentMapView, saveCycle, clearCurrent, dispatch, workspaceId });
      if (!success) {
        setActionError('Unable to save this session to the cloud. Your current forecast is still open.');
        return;
      }
      addToast('Session saved to the cloud and a new day started.', 'success');
      completeRollover();
    } finally {
      setIsBusy(false);
    }
  }, [addToast, clearCurrent, completeRollover, currentMapView, dispatch, forecastCycle, saveCycle, setActionError, setIsBusy, workspaceId]);
  const handleReplaceWithoutSaving = useCallback(() => {
    clearCurrent();
    dispatch(resetForecasts());
    addToast('Previous session replaced and a new forecast started.', 'success');
    completeRollover();
  }, [addToast, clearCurrent, completeRollover, dispatch]);

  return { handleKeepCurrentSession, handleDownloadAndStartNewDay, handleSaveToCloudAndStartNewDay, handleReplaceWithoutSaving };
};

/** Owns day-rollover detection and the save/download/replace actions for the page. */
export const useDayRolloverPrompt = ({ restoreComplete, restoredSession, dispatch, addToast, forecastCycle, currentMapView, isSaved, userId, canSaveToCloud, saveCycle, clearCurrent, workspaceId }: DayRolloverPromptArgs) => {
  const [promptState, setPromptState] = useState<DayRolloverPromptState | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const runtimeRefs = useDayRolloverRuntimeRefs({ forecastCycle, isSaved, restoredSession, promptState, userId, setPromptState, setActionError });
  useDayRolloverDetection({ restoreComplete, userId, runtimeRefs, setPromptState, setActionError });

  const completeRollover = useCallback(() => {
    clearStoredRolloverPrompt(userId);
    setPromptState(null);
    setActionError(null);
  }, [setActionError, setPromptState, userId]);
  const actions = useDayRolloverActions({ addToast, clearCurrent, completeRollover, currentMapView, dispatch, forecastCycle, saveCycle, setActionError, setIsBusy, workspaceId });

  return { promptState, canSaveToCloud, isBusy, error: actionError, ...actions };
};
