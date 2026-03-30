import { useEffect, useState, useCallback, useRef } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { useEntitlement } from '../billing/EntitlementProvider';
import { CloudCycleMetadata, CloudCycleContext, CloudSyncState } from '../types/cloudCycles';
import {
  saveCloudCycle,
  loadCloudCycle,
  deleteCloudCycle,
  renameCloudCycle,
  listCloudCycles,
  subscribeToCloudCycles,
} from '../lib/cloudCyclesService';
import { GFCForecastSaveData } from '../types/outlooks';
import { SavedCycleStats } from '../store/forecastSlice';

export interface UseCloudCyclesResult {
  cycles: CloudCycleMetadata[];
  currentCloud: CloudCycleContext | null;
  loading: boolean;
  error: string | null;

  // Operations
  saveCycle: (label: string, cycleDate: string, stats: SavedCycleStats, payload: GFCForecastSaveData) => Promise<boolean>;
  loadCycle: (cycleId: string) => Promise<GFCForecastSaveData | null>;
  deleteCycle: (cycleId: string) => Promise<boolean>;
  renameCycle: (cycleId: string, newLabel: string) => Promise<boolean>;
  markAsCurrent: (cycleId: string, label: string) => void;
  clearCurrent: () => void;
  refreshCycles: () => Promise<void>;
  updateSyncState: (state: CloudSyncState, error?: string) => void;
}

/**
 * Hook for managing cloud-backed cycles
 * Handles subscription, CRUD operations, and sync state
 */
export const useCloudCycles = (): UseCloudCyclesResult => {
  const { user } = useAuth();
  const { premiumActive } = useEntitlement();
  const [cycles, setCycles] = useState<CloudCycleMetadata[]>([]);
  const [currentCloud, setCurrentCloud] = useState<CloudCycleContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const unsubscribeRef = useRef<(() => void) | null>(null);
  const currentCloudRef = useRef<CloudCycleContext | null>(null);

  useEffect(() => {
    currentCloudRef.current = currentCloud;
  }, [currentCloud]);

  // Check if user can write.
  const canWrite = premiumActive;

  const updateSyncState = useCallback((state: CloudSyncState, syncError?: string) => {
    setCurrentCloud((prev) => {
      if (!prev) return null;
      if (prev.syncState === state && prev.lastSyncError === syncError) {
        return prev;
      }

      return {
        ...prev,
        syncState: state,
        lastSyncError: syncError,
      };
    });
  }, []);

  // Initialize subscription to cloud cycles
  useEffect(() => {
    if (!user?.uid) {
      setLoading(false);
      return;
    }

    setLoading(true);

    // Set up real-time subscription
    unsubscribeRef.current = subscribeToCloudCycles(
      user.uid,
      (cycles) => {
        setCycles(cycles);
        setLoading(false);
      },
      (err) => {
        console.error('Cloud cycles subscribe error:', err);
        setError(err.message);
        setLoading(false);
      }
    );

    // skipcq: JS-0045 React effects intentionally return cleanup callbacks.
    return function cleanupCloudCycleSubscription() {
      unsubscribeRef.current?.();
    };
  }, [user?.uid]);

  const saveCycle = useCallback(
    async (
      label: string,
      cycleDate: string,
      stats: SavedCycleStats,
      payload: GFCForecastSaveData
    ): Promise<boolean> => {
      if (!user?.uid || !premiumActive) {
        setError('Premium subscription required to save cloud cycles');
        return false;
      }

      setError(null);
      if (currentCloudRef.current) {
        updateSyncState('saving');
      }

      const result = await saveCloudCycle(user.uid, label, cycleDate, stats, payload, false, currentCloudRef.current?.id);

      if (result.success) {
        if (result.data) {
          setCurrentCloud({ id: result.data, label, syncState: 'saved' });
        }
        updateSyncState('saved');
        return true;
      } else {
        setError(result.error || 'Failed to save cloud cycle');
        updateSyncState('error', result.error);
        return false;
      }
    },
    [user?.uid, premiumActive, updateSyncState]
  );

  const loadCycle = useCallback(
    async (cycleId: string): Promise<GFCForecastSaveData | null> => {
      if (!user?.uid) {
        setError('Not signed in');
        return null;
      }

      setError(null);
      updateSyncState('loading');

      const result = await loadCloudCycle(user.uid, cycleId);

      if (result.success && result.data) {
        // Mark as current
        const cycle = cycles.find((c) => c.id === cycleId);
        if (cycle) {
          setCurrentCloud({ id: cycleId, label: cycle.label, syncState: 'saved' });
        }
        updateSyncState('saved');
        return result.data.payload;
      } else {
        setError(result.error || 'Failed to load cloud cycle');
        updateSyncState('error', result.error);
        return null;
      }
    },
    [user?.uid, cycles, updateSyncState]
  );

  const deleteCycle = useCallback(
    async (cycleId: string): Promise<boolean> => {
      if (!user?.uid || !canWrite) {
        setError('Action not allowed');
        return false;
      }

      setError(null);

      const result = await deleteCloudCycle(user.uid, cycleId);

      if (result.success) {
        // If the deleted cycle was current, clear current
        if (currentCloudRef.current?.id === cycleId) {
          setCurrentCloud(null);
        }
        return true;
      } else {
        setError(result.error || 'Failed to delete cloud cycle');
        return false;
      }
    },
    [user?.uid, canWrite]
  );

  const renameCycle = useCallback(
    async (cycleId: string, newLabel: string): Promise<boolean> => {
      if (!user?.uid || !canWrite) {
        setError('Action not allowed');
        return false;
      }

      setError(null);

      const result = await renameCloudCycle(user.uid, cycleId, newLabel);

      if (result.success) {
        // Update current if this is the current cycle
        if (currentCloudRef.current?.id === cycleId && currentCloudRef.current.label !== newLabel) {
          setCurrentCloud({ ...currentCloudRef.current, label: newLabel });
        }
        return true;
      } else {
        setError(result.error || 'Failed to rename cloud cycle');
        return false;
      }
    },
    [user?.uid, canWrite]
  );

  const refreshCycles = useCallback(async (): Promise<void> => {
    if (!user?.uid) {
      return;
    }

    setLoading(true);
    const result = await listCloudCycles(user.uid);

    if (result.success && result.data) {
      setCycles(result.data);
    } else {
      setError(result.error || 'Failed to refresh cloud cycles');
    }
    setLoading(false);
  }, [user?.uid]);

  const markAsCurrent = useCallback((cycleId: string, label: string) => {
    setCurrentCloud((prev) => {
      if (prev?.id === cycleId && prev.label === label && prev.syncState === 'idle' && !prev.lastSyncError) {
        return prev;
      }

      return { id: cycleId, label, syncState: 'idle' };
    });
  }, []);

  const clearCurrent = useCallback(() => {
    setCurrentCloud(null);
  }, []);

  return {
    cycles,
    currentCloud,
    loading,
    error,
    saveCycle,
    loadCycle,
    deleteCycle,
    renameCycle,
    markAsCurrent,
    clearCurrent,
    refreshCycles,
    updateSyncState,
  };
};
