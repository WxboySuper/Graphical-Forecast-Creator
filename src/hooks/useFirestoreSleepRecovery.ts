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

    const handleVisibilityChange = () => {
      if (document.hidden) {
        void disableNetwork(firestore).catch(() => {
          // Best-effort: tab may already be tearing down storage.
        });
        return;
      }

      void enableNetwork(firestore).catch(() => {
        // Best-effort: network may recover on the next user action.
      });
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);
}
