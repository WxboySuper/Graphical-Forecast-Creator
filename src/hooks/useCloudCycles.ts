import { useEffect, useState, useCallback, useRef, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
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
  saveCycle: (label: string, cycleDate: string, stats: SavedCycleStats, payload: GFCForecastSaveData) => Promise<boolean>;
  loadCycle: (cycleId: string) => Promise<GFCForecastSaveData | null>;
  deleteCycle: (cycleId: string) => Promise<boolean>;
  renameCycle: (cycleId: string, newLabel: string) => Promise<boolean>;
  markAsCurrent: (cycleId: string, label: string) => void;
  clearCurrent: () => void;
  refreshCycles: () => Promise<void>;
  updateSyncState: (state: CloudSyncState, error?: string) => void;
}

interface CloudOperationContext {
  userId: string;
  canWrite: boolean;
  cycles: CloudCycleMetadata[];
  currentCloudRef: MutableRefObject<CloudCycleContext | null>;
  setCurrentCloud: Dispatch<SetStateAction<CloudCycleContext | null>>;
  setCycles: Dispatch<SetStateAction<CloudCycleMetadata[]>>;
  setError: Dispatch<SetStateAction<string | null>>;
  setLoading: Dispatch<SetStateAction<boolean>>;
  updateSyncState: (state: CloudSyncState, error?: string) => void;
}

/** Returns the shared error message for cloud write actions when the user cannot save. */
function getCloudWriteBlockedMessage(userId: string, canWrite: boolean): string {
  if (!userId) {
    return 'Not signed in';
  }

  return canWrite ? 'Action not allowed' : 'Premium subscription required to save cloud cycles';
}

/** Updates the current cloud context when a sync state change actually changed something. */
function applySyncStateUpdate(
  setCurrentCloud: Dispatch<SetStateAction<CloudCycleContext | null>>,
  state: CloudSyncState,
  syncError?: string
): void {
  setCurrentCloud((prev) => {
    if (!prev || (prev.syncState === state && prev.lastSyncError === syncError)) {
      return prev ?? null;
    }

    return {
      ...prev,
      syncState: state,
      lastSyncError: syncError,
    };
  });
}

/** Creates the current-cloud context stored for the active forecast session. */
function createCurrentCloudContext(id: string, label: string, syncState: CloudSyncState): CloudCycleContext {
  return { id, label, syncState };
}

/** Updates the current cloud context when one cloud cycle is loaded. */
function syncLoadedCloudSelection(
  cycles: CloudCycleMetadata[],
  cycleId: string,
  setCurrentCloud: Dispatch<SetStateAction<CloudCycleContext | null>>
): void {
  const cycle = cycles.find((item) => item.id === cycleId);
  if (!cycle) {
    return;
  }

  setCurrentCloud(createCurrentCloudContext(cycleId, cycle.label, 'saved'));
}

/** Updates the current cloud label after a successful rename when the renamed cycle is active. */
function syncRenamedCloudSelection(
  currentCloudRef: MutableRefObject<CloudCycleContext | null>,
  setCurrentCloud: Dispatch<SetStateAction<CloudCycleContext | null>>,
  cycleId: string,
  newLabel: string
): void {
  if (currentCloudRef.current?.id !== cycleId || currentCloudRef.current.label === newLabel) {
    return;
  }

  setCurrentCloud({ ...currentCloudRef.current, label: newLabel });
}

/** Clears the current cloud selection after a delete when the deleted cycle was active. */
function clearDeletedCloudSelection(
  currentCloudRef: MutableRefObject<CloudCycleContext | null>,
  setCurrentCloud: Dispatch<SetStateAction<CloudCycleContext | null>>,
  cycleId: string
): void {
  if (currentCloudRef.current?.id === cycleId) {
    setCurrentCloud(null);
  }
}

/** Starts the realtime hosted-cycle subscription for the signed-in user. */
function useCloudCycleSubscription(
  userId: string | undefined,
  setCycles: Dispatch<SetStateAction<CloudCycleMetadata[]>>,
  setLoading: Dispatch<SetStateAction<boolean>>,
  setError: Dispatch<SetStateAction<string | null>>,
  unsubscribeRef: MutableRefObject<(() => void) | null>
): void {
  useEffect(() => {
    if (!userId) {
      setCycles([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    unsubscribeRef.current = subscribeToCloudCycles(
      userId,
      (nextCycles) => {
        setCycles(nextCycles);
        setLoading(false);
      },
      (nextError) => {
        console.error('Cloud cycles subscribe error:', nextError);
        setError(nextError.message);
        setLoading(false);
      }
    );

    // skipcq: JS-0045 React effects intentionally return cleanup callbacks.
    return function cleanupCloudCycleSubscription() {
      unsubscribeRef.current?.();
    };
  }, [userId, setCycles, setError, setLoading, unsubscribeRef]);
}

/** Creates the hosted cloud-cycle CRUD callbacks used by the forecast and library pages. */
function useCloudCycleOperations({
  userId,
  canWrite,
  cycles,
  currentCloudRef,
  setCurrentCloud,
  setCycles,
  setError,
  setLoading,
  updateSyncState,
}: CloudOperationContext) {
  const saveCycle = useCallback(
    async (
      label: string,
      cycleDate: string,
      stats: SavedCycleStats,
      payload: GFCForecastSaveData
    ): Promise<boolean> => {
      if (!userId || !canWrite) {
        setError(getCloudWriteBlockedMessage(userId, canWrite));
        return false;
      }

      setError(null);
      if (currentCloudRef.current) {
        updateSyncState('saving');
      }

      const result = await saveCloudCycle({
        userId,
        label,
        cycleDate,
        stats,
        payload,
        existingId: currentCloudRef.current?.id,
      });

      if (!result.success) {
        setError(result.error || 'Failed to save cloud cycle');
        updateSyncState('error', result.error);
        return false;
      }

      if (result.data) {
        setCurrentCloud(createCurrentCloudContext(result.data, label, 'saved'));
      }
      updateSyncState('saved');
      return true;
    },
    [canWrite, currentCloudRef, setCurrentCloud, setError, updateSyncState, userId]
  );

  const loadCycle = useCallback(
    async (cycleId: string): Promise<GFCForecastSaveData | null> => {
      if (!userId) {
        setError('Not signed in');
        return null;
      }

      setError(null);
      updateSyncState('loading');

      const result = await loadCloudCycle(userId, cycleId);
      if (!result.success || !result.data) {
        setError(result.error || 'Failed to load cloud cycle');
        updateSyncState('error', result.error);
        return null;
      }

      syncLoadedCloudSelection(cycles, cycleId, setCurrentCloud);
      updateSyncState('saved');
      return result.data.payload;
    },
    [cycles, setCurrentCloud, setError, updateSyncState, userId]
  );

  const deleteCycleAction = useCallback(
    async (cycleId: string): Promise<boolean> => {
      if (!userId || !canWrite) {
        setError('Action not allowed');
        return false;
      }

      setError(null);
      const result = await deleteCloudCycle(userId, cycleId);
      if (!result.success) {
        setError(result.error || 'Failed to delete cloud cycle');
        return false;
      }

      clearDeletedCloudSelection(currentCloudRef, setCurrentCloud, cycleId);
      return true;
    },
    [canWrite, currentCloudRef, setCurrentCloud, setError, userId]
  );

  const renameCycleAction = useCallback(
    async (cycleId: string, newLabel: string): Promise<boolean> => {
      if (!userId || !canWrite) {
        setError('Action not allowed');
        return false;
      }

      setError(null);
      const result = await renameCloudCycle(userId, cycleId, newLabel);
      if (!result.success) {
        setError(result.error || 'Failed to rename cloud cycle');
        return false;
      }

      syncRenamedCloudSelection(currentCloudRef, setCurrentCloud, cycleId, newLabel);
      return true;
    },
    [canWrite, currentCloudRef, setCurrentCloud, setError, userId]
  );

  const refreshCycles = useCallback(async (): Promise<void> => {
    if (!userId) {
      return;
    }

    setLoading(true);
    const result = await listCloudCycles(userId);
    if (result.success && result.data) {
      setCycles(result.data);
    } else {
      setError(result.error || 'Failed to refresh cloud cycles');
    }
    setLoading(false);
  }, [setCycles, setError, setLoading, userId]);

  return {
    saveCycle,
    loadCycle,
    deleteCycle: deleteCycleAction,
    renameCycle: renameCycleAction,
    refreshCycles,
  };
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
  const canWrite = premiumActive;

  useEffect(() => {
    currentCloudRef.current = currentCloud;
  }, [currentCloud]);

  const updateSyncState = useCallback((state: CloudSyncState, syncError?: string) => {
    applySyncStateUpdate(setCurrentCloud, state, syncError);
  }, []);

  useCloudCycleSubscription(user?.uid, setCycles, setLoading, setError, unsubscribeRef);

  const operations = useCloudCycleOperations({
    userId: user?.uid ?? '',
    canWrite,
    cycles,
    currentCloudRef,
    setCurrentCloud,
    setCycles,
    setError,
    setLoading,
    updateSyncState,
  });

  const markAsCurrent = useCallback((cycleId: string, label: string) => {
    setCurrentCloud((prev) => {
      const nextValue = createCurrentCloudContext(cycleId, label, 'idle');
      if (prev?.id === cycleId && prev.label === label && prev.syncState === 'idle' && !prev.lastSyncError) {
        return prev;
      }

      return nextValue;
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
    saveCycle: operations.saveCycle,
    loadCycle: operations.loadCycle,
    deleteCycle: operations.deleteCycle,
    renameCycle: operations.renameCycle,
    markAsCurrent,
    clearCurrent,
    refreshCycles: operations.refreshCycles,
    updateSyncState,
  };
};
