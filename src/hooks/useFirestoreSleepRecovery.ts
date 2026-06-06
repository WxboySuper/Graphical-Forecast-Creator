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
    let isTransitioning = false;

    /** Pauses or resumes Firestore sync to match current tab visibility. */
    const syncFirestoreNetworkToVisibility = async (): Promise<void> => {
      if (isTransitioning) return;

      if (document.hidden) {
        isTransitioning = true;
        try {
          // Wait for pending writes before disabling network to prevent data loss or 
          // aggressive disconnection during active sync (GFC-WEB-A).
          await waitForPendingWrites(firestore);
          await disableNetwork(firestore);
        } catch {
          // Ignore failures (e.g. if already disabled or network lost)
        } finally {
          isTransitioning = false;
        }
        return;
      }

      try {
        await enableNetwork(firestore);
      } catch {
        // Ignore failures
      }
    };

    syncFirestoreNetworkToVisibility().catch(() => undefined);
    document.addEventListener('visibilitychange', syncFirestoreNetworkToVisibility as any);
    return () => {
      document.removeEventListener('visibilitychange', syncFirestoreNetworkToVisibility as any);
    };
  }, []);
}
