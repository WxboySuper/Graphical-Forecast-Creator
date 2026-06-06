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
    let pendingTransition: Promise<void> | null = null;

    /**
     * Pauses or resumes Firestore sync based on visibility.
     * Handles race conditions to ensure the network state matches the final document state.
     */
    const updateNetworkState = async (): Promise<void> => {
      // If we are hidden, wait for writes then disable.
      if (document.hidden) {
        try {
          await waitForPendingWrites(firestore);
          // Only disable if we are still hidden after the wait.
          if (document.hidden) {
            await disableNetwork(firestore);
          }
        } catch {
          // Ignore failures
        }
      } else {
        // If visible, just enable.
        try {
          await enableNetwork(firestore);
        } catch {
          // Ignore failures
        }
      }
    };

    /**
     * Serializes transitions to avoid race conditions where a 'disable'
     * call finishes after a user has already returned to the tab.
     */
    const handleVisibilityChange = (): void => {
      const runTransition = async (): Promise<void> => {
        // Wait for any existing transition to finish first.
        if (pendingTransition) {
          try {
            await pendingTransition;
          } catch {
            // Ignore previous errors
          }
        }
        pendingTransition = updateNetworkState();
        await pendingTransition;
      };

      runTransition().catch(() => {
        // Final fallback for the serialized chain
      });
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    // Initial sync
    handleVisibilityChange();

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);
}
