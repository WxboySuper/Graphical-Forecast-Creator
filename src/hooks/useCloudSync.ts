import { useEffect, useRef, useCallback } from 'react';
import { useSelector } from 'react-redux';
import { RootState } from '../store';
import { serializeForecast } from '../utils/fileUtils';
import { countForecastMetrics } from '../utils/forecastMetrics';
import { useEntitlement } from '../billing/EntitlementProvider';
import type { UseCloudCyclesResult } from './useCloudCycles';

const SYNC_DEBOUNCE_MS = 5000; // 5 second debounce

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

  // Determine if we can write to cloud
  const canSync = Boolean(currentCloud) && premiumActive;

  // Check if forecast has changed since last sync
  const getCurrentStateHash = useCallback(() => {
    return JSON.stringify({ forecastCycle, mapView });
  }, [forecastCycle, mapView]);

  // Perform the sync
  const performSync = useCallback(async () => {
    if (!canSync || !currentCloud) return;

    try {
      updateSyncState('saving');

      const payload = serializeForecast(forecastCycle, mapView);
      const stats = countForecastMetrics(forecastCycle);

      const success = await saveCycle(
        currentCloud.label,
        forecastCycle.cycleDate,
        stats,
        payload,
      );

      if (success) {
        updateSyncState('saved');
        lastSyncStateRef.current = getCurrentStateHash();
      } else {
        updateSyncState('error', 'Failed to sync to cloud');
      }
    } catch (error) {
      console.error('Error syncing to cloud:', error);
      updateSyncState('error', error instanceof Error ? error.message : 'Unknown error');
    }
  }, [
    canSync,
    currentCloud,
    saveCycle,
    updateSyncState,
    forecastCycle,
    mapView,
    getCurrentStateHash,
  ]);

  // Set up debounced sync trigger
  useEffect(() => {
    if (!canSync) {
      // Clear any pending sync
      if (syncTimeoutRef.current) {
        clearTimeout(syncTimeoutRef.current);
        syncTimeoutRef.current = null;
      }
      return;
    }

    const currentHash = getCurrentStateHash();
    
    // Only sync if state has changed since last sync
    if (currentHash === lastSyncStateRef.current) {
      return;
    }

    // Clear any pending sync timeout
    if (syncTimeoutRef.current) {
      clearTimeout(syncTimeoutRef.current);
    }

    // Debounce the sync
    syncTimeoutRef.current = setTimeout(() => {
      performSync();
      syncTimeoutRef.current = null;
    }, SYNC_DEBOUNCE_MS);

    // skipcq: JS-0045 React effects intentionally return cleanup callbacks.
    return function cleanupPendingCloudSync() {
      if (syncTimeoutRef.current) {
        clearTimeout(syncTimeoutRef.current);
        syncTimeoutRef.current = null;
      }
    };
  }, [canSync, forecastCycle, mapView, getCurrentStateHash, performSync]);

  // Manual sync trigger (immediate, not debounced)
  const syncNow = useCallback(async () => {
    if (syncTimeoutRef.current) {
      clearTimeout(syncTimeoutRef.current);
      syncTimeoutRef.current = null;
    }
    await performSync();
  }, [performSync]);

  const markCurrentStateSynced = useCallback(() => {
    lastSyncStateRef.current = getCurrentStateHash();
  }, [getCurrentStateHash]);

  return {
    isSynced: lastSyncStateRef.current === getCurrentStateHash(),
    currentCloud,
    syncNow,
    markCurrentStateSynced,
  };
};
