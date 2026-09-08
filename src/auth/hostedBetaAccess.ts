/**
 * Hosted beta-access loader. Reads the hosted profile entitlement and ignores
 * responses from superseded requests before updating beta state.
 */
import type { User } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { db, isHostedAuthEnabled, requireDb } from '../lib/firebase';
import {
  readProfileBetaAccess,
  type UserProfileDocument,
} from './authSettings';

interface HostedBetaAccessRequestId {
  current: number;
}

interface RefreshHostedBetaAccessArgs {
  user: User | null;
  requestIdRef: HostedBetaAccessRequestId;
  setBetaAccess: (enabled: boolean) => void;
  setBetaAccessLoading: (loading: boolean) => void;
}

export const refreshHostedBetaAccess = async ({
  user,
  requestIdRef,
  setBetaAccess,
  setBetaAccessLoading,
}: RefreshHostedBetaAccessArgs): Promise<void> => {
  const hostedProfileUnavailable = !isHostedAuthEnabled || !db || !user;
  if (hostedProfileUnavailable) {
    setBetaAccess(false);
    setBetaAccessLoading(false);
    return;
  }

  requestIdRef.current += 1;
  const requestId = requestIdRef.current;
  setBetaAccessLoading(true);

  try {
    const profileSnapshot = await getDoc(doc(requireDb(), 'userProfiles', user.uid));
    if (requestId !== requestIdRef.current) {
      return;
    }

    setBetaAccess(
      readProfileBetaAccess(profileSnapshot.data() as Partial<UserProfileDocument> | undefined),
    );
  } catch {
    if (requestId !== requestIdRef.current) {
      return;
    }

    setBetaAccess(false);
  } finally {
    if (requestId === requestIdRef.current) {
      setBetaAccessLoading(false);
    }
  }
};
/**
 * Hosted beta-access resolution helpers.
 *
 * This module determines beta access from hosted authentication and entitlement data. UI guards consume the result; identity and billing services own the underlying records.
 */