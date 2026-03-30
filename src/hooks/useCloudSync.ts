import { useEffect, useRef, useCallback, type MutableRefObject } from 'react';
import { useSelector } from 'react-redux';
import { RootState } from '../store';
import { serializeForecast } from '../utils/fileUtils';
import { countForecastMetrics } from '../utils/forecastMetrics';
import { useEntitlement } from '../billing/EntitlementProvider';
import type { UseCloudCyclesResult } from './useCloudCycles';

const SYNC_DEBOUNCE_MS = 5000; // 5 second debounce

/** Clears a pending cloud-sync timer when one is currently scheduled. */
const clearSyncTimeout = (syncTimeoutRef: MutableRefObject<ReturnType<typeof setTimeout> | null>) => {
  if (!syncTimeoutRef.current) {
    return;
  }

  clearTimeout(syncTimeoutRef.current);
  syncTimeoutRef.current = null;
};

/** Builds the current sync hash for the forecast and map state. */
const buildCloudSyncHash = (
  forecastCycle: RootState['forecast']['forecastCycle'],
  mapView: RootState['forecast']['currentMapView']
) => JSON.stringify({ forecastCycle, mapView });

/** Runs one hosted cloud save for the active cloud cycle and updates sync state around the request. */
const syncCurrentCloudCycle = async ({
  canSync,
  currentCloud,
  saveCycle,
  updateSyncState,
  forecastCycle,
  mapView,
  setLastSyncedHash,
  currentHash,
}: {
  canSync: boolean;
  currentCloud: Pick<UseCloudCyclesResult, 'currentCloud'>['currentCloud'];
  saveCycle: Pick<UseCloudCyclesResult, 'saveCycle'>['saveCycle'];
  updateSyncState: Pick<UseCloudCyclesResult, 'updateSyncState'>['updateSyncState'];
  forecastCycle: RootState['forecast']['forecastCycle'];
  mapView: RootState['forecast']['currentMapView'];
  setLastSyncedHash: (hash: string) => void;
  currentHash: string;
}) => {
  if (!canSync || !currentCloud) {
    return;
  }

  try {
    updateSyncState('saving');

    const payload = serializeForecast(forecastCycle, mapView);
    const stats = countForecastMetrics(forecastCycle);
    const success = await saveCycle(currentCloud.label, forecastCycle.cycleDate, stats, payload);

    if (!success) {
      updateSyncState('error', 'Failed to sync to cloud');
      return;
    }

    updateSyncState('saved');
    setLastSyncedHash(currentHash);
  } catch (error) {
    console.error('Error syncing to cloud:', error);
    updateSyncState('error', error instanceof Error ? error.message : 'Unknown error');
  }
};

/** Returns true when the current forecast state has not changed since the last successful sync. */
const isCurrentStateSynced = (lastSyncedHash: string | null, currentHash: string): boolean =>
  lastSyncedHash === currentHash;

/**
 * Hook for managing automatic sync of the current forecast to cloud
 * Only syncs if:
 * 1. User has a current cloud cycle set
 * 2. User has active premium (not expired)
 * 3. Forecast has changes since last sync
 */
export const useCloudSync = (
  cloud: Pick<UseCloudCyclesResult, 'currentCloud' | 'updateSyncState' | 'saveCycle'>
) => {
  const { premiumActive } = useEntitlement();
  const currentCloud = cloud.currentCloud;
  const saveCycle = cloud.saveCycle;
  const updateSyncState = cloud.updateSyncState;
  const forecastCycle = useSelector((state: RootState) => state.forecast.forecastCycle);
  const mapView = useSelector((state: RootState) => state.forecast.currentMapView);
  
  const syncTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSyncStateRef = useRef<string | null>(null);

  const canSync = Boolean(currentCloud) && premiumActive;
  const currentHash = buildCloudSyncHash(forecastCycle, mapView);

  const performSync = useCallback(async () => {
    await syncCurrentCloudCycle({
      canSync,
      currentCloud,
      saveCycle,
      updateSyncState,
      forecastCycle,
      mapView,
      setLastSyncedHash: (hash) => {
        lastSyncStateRef.current = hash;
      },
      currentHash,
    });
  }, [canSync, currentCloud, currentHash, forecastCycle, mapView, saveCycle, updateSyncState]);

  useEffect(() => {
    if (!canSync) {
      clearSyncTimeout(syncTimeoutRef);
      return;
    }

    if (isCurrentStateSynced(lastSyncStateRef.current, currentHash)) {
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
  }, [canSync, currentHash, performSync]);

  const syncNow = useCallback(async () => {
    clearSyncTimeout(syncTimeoutRef);
    await performSync();
  }, [performSync]);

  const markCurrentStateSynced = useCallback(() => {
    lastSyncStateRef.current = currentHash;
  }, [currentHash]);

  return {
    isSynced: isCurrentStateSynced(lastSyncStateRef.current, currentHash),
    currentCloud,
    syncNow,
    markCurrentStateSynced,
  };
};
