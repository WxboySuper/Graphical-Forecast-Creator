import { useCallback, useEffect, useRef, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import type { User } from 'firebase/auth';
import { db, isHostedAuthEnabled, requireDb } from '../lib/firebase';
import { readProfileBetaAccess, type UserProfileDocument } from './authSettings';

type HostedAuthStatus = 'disabled' | 'loading' | 'signed_out' | 'signed_in' | 'error';

interface FirebaseBetaAccessState {
  betaAccess: boolean;
  betaAccessLoading: boolean;
  refreshBetaAccess: () => Promise<void>;
}

/** Reads Firebase beta access from the signed-in user's profile document. */
export const useFirebaseBetaAccess = (
  status: HostedAuthStatus,
  user: User | null,
): FirebaseBetaAccessState => {
  const [betaAccess, setBetaAccess] = useState(false);
  const [betaAccessLoading, setBetaAccessLoading] = useState(false);
  const requestIdRef = useRef(0);

  const refreshBetaAccess = useCallback(async (): Promise<void> => {
    if (!isHostedAuthEnabled || !db || !user) {
      setBetaAccess(false);
      setBetaAccessLoading(false);
      return;
    }

    const requestId = ++requestIdRef.current;
    setBetaAccessLoading(true);
    try {
      const profile = await getDoc(doc(requireDb(), 'userProfiles', user.uid));
      if (requestId === requestIdRef.current) {
        setBetaAccess(readProfileBetaAccess(profile.data() as Partial<UserProfileDocument> | undefined));
      }
    } catch {
      if (requestId === requestIdRef.current) setBetaAccess(false);
    } finally {
      if (requestId === requestIdRef.current) setBetaAccessLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (status === 'loading') {
      setBetaAccessLoading(true);
      return;
    }
    if (status !== 'signed_in' || !user) {
      setBetaAccess(false);
      setBetaAccessLoading(false);
      return;
    }
    refreshBetaAccess().catch(() => undefined);
  }, [refreshBetaAccess, status, user]);

  return { betaAccess, betaAccessLoading, refreshBetaAccess };
};
