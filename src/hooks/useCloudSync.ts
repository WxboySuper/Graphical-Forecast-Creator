import { useEffect, useRef, useCallback, useMemo, useState, type MutableRefObject } from 'react';
import { useSelector } from 'react-redux';
import { RootState } from '../store';
import { serializeForecast } from '../utils/fileUtils';
import { countForecastMetrics } from '../utils/forecastMetrics';
import { useEntitlement } from '../billing/EntitlementProvider';
import type { UseCloudCyclesResult } from './useCloudCycles';
import { DEFAULT_FORECAST_WORKSPACE, type ForecastWorkspaceId } from '../config/forecastWorkspaces';

const SYNC_DEBOUNCE_MS = 5000; // 5 second debounce

/** Clears a pending cloud-sync timer when one is currently scheduled. */
const clearSyncTimeout = (syncTimeoutRef: MutableRefObject<ReturnType<typeof setTimeout> | null>) => {
  if (!syncTimeoutRef.current) {
    return;
  }

  clearTimeout(syncTimeoutRef.current);
  syncTimeoutRef.current = null;
};

/** Builds the current sync hash from all persisted forecast state, excluding volatile timestamp fields. */
const buildCloudSyncHash = (serializedPayload: ReturnType<typeof serializeForecast> | null) =>
  serializedPayload ?
  JSON.stringify({
    forecastCycle: serializedPayload.forecastCycle,
    mapView: serializedPayload.mapView,
    cycleMetadata: serializedPayload.cycleMetadata,
  }) : '';

/** Returns true when the current forecast state has not changed since the last successful sync. */
const isCurrentStateSynced = (lastSyncedHash: string | null, currentHash: string): boolean =>
  lastSyncedHash === currentHash;

/** Records a successful sync only when its request is still current. */
function applyCloudSyncSuccess({
  isLatestRequest,
  updateSyncState,
  setLastSyncedHash,
  currentCloud,
  currentHash,
}: {
  isLatestRequest: () => boolean;
  updateSyncState: Pick<UseCloudCyclesResult, 'updateSyncState'>['updateSyncState'];
  setLastSyncedHash: (cloudId: string, hash: string) => void;
  currentCloud: NonNullable<Pick<UseCloudCyclesResult, 'currentCloud'>['currentCloud']>;
  currentHash: string;
}): void {
  if (!isLatestRequest()) return;
  updateSyncState('saved', undefined, currentCloud.id);
  setLastSyncedHash(currentCloud.id, currentHash);
}

/** Records a failed sync only when its request is still current. */
function applyCloudSyncFailure({
  isLatestRequest,
  updateSyncState,
  currentCloud,
  message,
}: {
  isLatestRequest: () => boolean;
  updateSyncState: Pick<UseCloudCyclesResult, 'updateSyncState'>['updateSyncState'];
  currentCloud: NonNullable<Pick<UseCloudCyclesResult, 'currentCloud'>['currentCloud']>;
  message: string;
}): void {
  if (isLatestRequest()) updateSyncState('error', message, currentCloud.id);
}

/** Runs one hosted cloud save and scopes completion state to the cycle that started it. */
const syncCurrentCloudCycle = async ({
  canSync,
  currentCloud,
  saveCycle,
  updateSyncState,
  payload,
  cycleDate,
  forecastCycle,
  workflowMetadata,
  setLastSyncedHash,
  currentHash,
  workspaceId,
  isLatestRequest,
}: {
  canSync: boolean;
  currentCloud: Pick<UseCloudCyclesResult, 'currentCloud'>['currentCloud'];
  saveCycle: Pick<UseCloudCyclesResult, 'saveCycle'>['saveCycle'];
  updateSyncState: Pick<UseCloudCyclesResult, 'updateSyncState'>['updateSyncState'];
  payload: ReturnType<typeof serializeForecast>;
  cycleDate: RootState['forecast']['forecastCycle']['cycleDate'];
  forecastCycle: RootState['forecast']['forecastCycle'];
  workflowMetadata: RootState['forecast']['workflowMetadata'];
  setLastSyncedHash: (cloudId: string, hash: string) => void;
  currentHash: string;
  workspaceId: ForecastWorkspaceId;
  isLatestRequest: () => boolean;
}) => {
  if (!canSync || !currentCloud) {
    return;
  }

  try {
    updateSyncState('saving', undefined, currentCloud.id);

    const stats = countForecastMetrics(forecastCycle);
    const success = await saveCycle(currentCloud.label, cycleDate, stats, payload, workflowMetadata, { workspaceId });

    if (!success) {
      applyCloudSyncFailure({ isLatestRequest, updateSyncState, currentCloud, message: 'Failed to sync to cloud' });
      return;
    }

    applyCloudSyncSuccess({ isLatestRequest, updateSyncState, setLastSyncedHash, currentCloud, currentHash });
  } catch (error) {
    console.error('Error syncing to cloud:', error);
    applyCloudSyncFailure({
      isLatestRequest,
      updateSyncState,
      currentCloud,
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};

type CloudSyncInput = Pick<UseCloudCyclesResult, 'currentCloud' | 'updateSyncState' | 'saveCycle'>;

/** Owns debounced cloud-sync execution and exposes explicit sync controls. */
const useCloudSyncOperations = ({
  canSync,
  currentCloud,
  saveCycle,
  updateSyncState,
  serializedPayload,
  forecastCycle,
  workflowMetadata,
  currentHash,
  workspaceId,
}: {
  canSync: boolean;
  currentCloud: CloudSyncInput['currentCloud'];
  saveCycle: CloudSyncInput['saveCycle'];
  updateSyncState: CloudSyncInput['updateSyncState'];
  serializedPayload: ReturnType<typeof serializeForecast> | null;
  forecastCycle: RootState['forecast']['forecastCycle'];
  workflowMetadata: RootState['forecast']['workflowMetadata'];
  currentHash: string;
  workspaceId: ForecastWorkspaceId;
}) => {
  const syncTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const syncGenerationRef = useRef(0);
  const pendingSyncedCloudIdRef = useRef<string | null>(null);
  const [lastSyncedState, setLastSyncedState] = useState<{ cloudId: string; hash: string } | null>(null);
  useEffect(() => {
    syncGenerationRef.current += 1;
  }, [canSync, currentCloud?.id]);

  const performSync = useCallback(async () => {
    const requestGeneration = ++syncGenerationRef.current;
    await syncCurrentCloudCycle({
      canSync,
      currentCloud,
      saveCycle,
      updateSyncState,
      payload: serializedPayload as ReturnType<typeof serializeForecast>,
      cycleDate: forecastCycle.cycleDate,
      forecastCycle,
      workflowMetadata,
      setLastSyncedHash: (cloudId, hash) => setLastSyncedState({ cloudId, hash }),
      currentHash,
      workspaceId,
      isLatestRequest: () => syncGenerationRef.current === requestGeneration,
    });
  }, [canSync, currentCloud, currentHash, forecastCycle, saveCycle, serializedPayload, updateSyncState, workflowMetadata, workspaceId]);

  useCloudSyncScheduling({
    canSync,
    currentCloudId: currentCloud?.id ?? null,
    currentHash,
    lastSyncedState,
    performSync,
    syncTimeoutRef,
  });

  const syncNow = useCallback(async () => {
    clearSyncTimeout(syncTimeoutRef);
    await performSync();
  }, [performSync]);
  const markCurrentStateSynced = useCallback((cloudId?: string) => {
    if (!canSync) return;
    if (cloudId && currentCloud?.id !== cloudId) {
      pendingSyncedCloudIdRef.current = cloudId;
      return;
    }
    if (currentCloud) setLastSyncedState({ cloudId: currentCloud.id, hash: currentHash });
  }, [canSync, currentCloud, currentHash]);

  useEffect(() => {
    const pendingCloudId = pendingSyncedCloudIdRef.current;
    if (!canSync || !currentCloud) {
      pendingSyncedCloudIdRef.current = null;
      return;
    }
    if (!pendingCloudId || currentCloud.id !== pendingCloudId) return;
    pendingSyncedCloudIdRef.current = null;
    setLastSyncedState({ cloudId: pendingCloudId, hash: currentHash });
  }, [canSync, currentCloud, currentHash]);

  return {
    isSynced: Boolean(currentCloud && lastSyncedState?.cloudId === currentCloud.id && isCurrentStateSynced(lastSyncedState.hash, currentHash)),
    syncNow,
    markCurrentStateSynced,
  };
};

/** Schedules a debounced save whenever the selected cycle has unsynced state. */
function useCloudSyncScheduling({
  canSync,
  currentCloudId,
  currentHash,
  lastSyncedState,
  performSync,
  syncTimeoutRef,
}: {
  canSync: boolean;
  currentCloudId: string | null;
  currentHash: string;
  lastSyncedState: { cloudId: string; hash: string } | null;
  performSync: () => Promise<void>;
  syncTimeoutRef: MutableRefObject<ReturnType<typeof setTimeout> | null>;
}) {
  useEffect(() => {
    if (!canSync || !currentCloudId || (lastSyncedState?.cloudId === currentCloudId && isCurrentStateSynced(lastSyncedState.hash, currentHash))) {
      clearSyncTimeout(syncTimeoutRef);
      return;
    }

    clearSyncTimeout(syncTimeoutRef);
    syncTimeoutRef.current = setTimeout(() => {
      performSync().catch(() => undefined);
      syncTimeoutRef.current = null;
    }, SYNC_DEBOUNCE_MS);

    // skipcq: JS-0045 React effects intentionally return cleanup callbacks.
    return function cleanupPendingCloudSync() {
      clearSyncTimeout(syncTimeoutRef);
    };
  }, [canSync, currentCloudId, currentHash, lastSyncedState, performSync, syncTimeoutRef]);
}

/** Hook for managing automatic sync of the current forecast to cloud. */
export const useCloudSync = (
  cloud: CloudSyncInput,
  workspaceId: ForecastWorkspaceId = DEFAULT_FORECAST_WORKSPACE,
) => {
  const { premiumActive } = useEntitlement();
  const currentCloud = cloud.currentCloud;
  const forecastCycle = useSelector((state: RootState) => state.forecast.forecastCycle);
  const mapView = useSelector((state: RootState) => state.forecast.currentMapView);
  const workflowMetadata = useSelector((state: RootState) => state.forecast.workflowMetadata);
  const canSync = Boolean(currentCloud) && premiumActive;
  const serializedPayload = useMemo(
    () => canSync ? serializeForecast(forecastCycle, mapView, workflowMetadata) : null,
    [canSync, forecastCycle, mapView, workflowMetadata]
  );
  const currentHash = useMemo(() => buildCloudSyncHash(serializedPayload), [serializedPayload]);
  const operations = useCloudSyncOperations({
    canSync,
    currentCloud,
    saveCycle: cloud.saveCycle,
    updateSyncState: cloud.updateSyncState,
    serializedPayload,
    forecastCycle,
    workflowMetadata,
    currentHash,
    workspaceId,
  });

  return { ...operations, currentCloud };
};
