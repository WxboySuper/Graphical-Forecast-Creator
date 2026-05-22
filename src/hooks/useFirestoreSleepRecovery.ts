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

    /** Pauses or resumes Firestore sync when the document visibility changes. */
    const handleVisibilityChange = (): void => {
      if (document.hidden) {
        disableNetwork(firestore).catch(() => undefined);
        return;
      }

      enableNetwork(firestore).catch(() => undefined);
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);
}
