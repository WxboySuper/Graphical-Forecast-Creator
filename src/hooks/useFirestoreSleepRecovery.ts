import { useEffect } from 'react';
import {
  disableNetwork,
  enableNetwork,
  waitForPendingWrites,
} from 'firebase/firestore';
import { db } from '../lib/firebase';

/**
 * Pauses Firestore network I/O while the tab is hidden (sleep/background).
 * Reduces wake-from-sleep failures when WebKit restarts the IndexedDB server.
 */
export function useFirestoreSleepRecovery(): void {
  useEffect(() => {
    if (!db) {
      return undefined;
    }

    const firestore = db;
    let transitionQueue = Promise.resolve();
    let destroyed = false;
    const PENDING_WRITES_TIMEOUT_MS = 5_000;

    /**
     * Waits for Firestore to flush writes, but gives up after a short delay so
     * a hidden tab can still disconnect instead of hanging forever.
     */
    const waitForPendingWritesWithTimeout = async (): Promise<void> => {
      await Promise.race([
        waitForPendingWrites(firestore),
        new Promise<void>((resolve) => {
          setTimeout(resolve, PENDING_WRITES_TIMEOUT_MS);
        }),
      ]);
    };

    /**
     * Pauses or resumes Firestore sync based on visibility.
     * Handles race conditions to ensure the network state matches the final document state.
     */
    const updateNetworkState = async (): Promise<void> => {
      if (destroyed) {
        return;
      }

      if (!document.hidden) {
        try {
          await enableNetwork(firestore);
        } catch {
          // Ignore failures
        }
        return;
      }

      try {
        await waitForPendingWritesWithTimeout();
        if (destroyed || !document.hidden) {
          return;
        }

        await disableNetwork(firestore);
      } catch {
        // Ignore failures
      }
    };

    /**
     * Runs one visibility transition at a time so late tab events cannot
     * overwrite the queue state that a newer event is waiting on.
     */
    const runTransition = async (): Promise<void> => {
      if (destroyed) {
        return;
      }

      const nextTransition = transitionQueue.then(async () => {
        if (destroyed) {
          return;
        }

        await updateNetworkState();
      });

      transitionQueue = nextTransition.catch(() => undefined);
      await nextTransition;
    };

    /**
     * Serializes transitions to avoid race conditions where a 'disable'
     * call finishes after a user has already returned to the tab.
     */
    const handleVisibilityChange = (): void => {
      runTransition().catch(() => {
        // Final fallback for the serialized chain
      });
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Initial sync
    handleVisibilityChange();

    return () => {
      destroyed = true;
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);
}
