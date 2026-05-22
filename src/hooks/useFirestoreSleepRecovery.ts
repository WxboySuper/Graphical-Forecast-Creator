import { useEffect } from 'react';
import { disableNetwork, enableNetwork } from 'firebase/firestore';
import { db } from '../lib/firebase';

/**
 * Pauses Firestore network I/O while the tab is hidden (sleep/background).
 * Reduces wake-from-sleep failures when WebKit restarts the IndexedDB server.
 */
export function useFirestoreSleepRecovery(): void {
  useEffect(() => {
    if (!db) {
      return;
    }

    const firestore = db;

    /** Pauses or resumes Firestore sync to match current tab visibility. */
    const syncFirestoreNetworkToVisibility = (): void => {
      if (document.hidden) {
        disableNetwork(firestore).catch(() => undefined);
        return;
      }

      enableNetwork(firestore).catch(() => undefined);
    };

    syncFirestoreNetworkToVisibility();
    document.addEventListener('visibilitychange', syncFirestoreNetworkToVisibility);
    return () => {
      document.removeEventListener('visibilitychange', syncFirestoreNetworkToVisibility);
    };
  }, []);
}
