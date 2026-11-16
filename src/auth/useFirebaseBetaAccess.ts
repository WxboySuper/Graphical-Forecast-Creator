import { useCallback, useEffect, useRef, useState, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
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

interface FirebaseBetaAccessRequest {
  user: User | null;
  requestIdRef: MutableRefObject<number>;
  setBetaAccess: Dispatch<SetStateAction<boolean>>;
  setBetaAccessLoading: Dispatch<SetStateAction<boolean>>;
}

const isCurrentRequest = (requestId: number, latestRequestId: MutableRefObject<number>): boolean =>
  requestId === latestRequestId.current;

const readFirebaseBetaAccess = async (user: User): Promise<boolean> => {
  const profile = await getDoc(doc(requireDb(), 'userProfiles', user.uid));
  return readProfileBetaAccess(profile.data() as Partial<UserProfileDocument> | undefined);
};

const refreshFirebaseBetaAccess = async ({
  user,
  requestIdRef,
  setBetaAccess,
  setBetaAccessLoading,
}: FirebaseBetaAccessRequest): Promise<void> => {
  if (!isHostedAuthEnabled || !db || !user) {
    setBetaAccess(false);
    setBetaAccessLoading(false);
    return;
  }

  const requestId = ++requestIdRef.current;
  setBetaAccessLoading(true);
  try {
    const hasBetaAccess = await readFirebaseBetaAccess(user);
    if (isCurrentRequest(requestId, requestIdRef)) setBetaAccess(hasBetaAccess);
  } catch {
    if (isCurrentRequest(requestId, requestIdRef)) setBetaAccess(false);
  } finally {
    if (isCurrentRequest(requestId, requestIdRef)) setBetaAccessLoading(false);
  }
};

interface FirebaseBetaAccessStatus {
  status: HostedAuthStatus;
  user: User | null;
  refreshBetaAccess: () => Promise<void>;
  setBetaAccess: Dispatch<SetStateAction<boolean>>;
  setBetaAccessLoading: Dispatch<SetStateAction<boolean>>;
}

const syncFirebaseBetaAccessStatus = ({
  status,
  user,
  refreshBetaAccess,
  setBetaAccess,
  setBetaAccessLoading,
}: FirebaseBetaAccessStatus): void => {
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
};

/** Reads Firebase beta access from the signed-in user's profile document. */
export const useFirebaseBetaAccess = (
  status: HostedAuthStatus,
  user: User | null,
): FirebaseBetaAccessState => {
  const [betaAccess, setBetaAccess] = useState(false);
  const [betaAccessLoading, setBetaAccessLoading] = useState(false);
  const requestIdRef = useRef(0);

  const refreshBetaAccess = useCallback(async (): Promise<void> => {
    await refreshFirebaseBetaAccess({ user, requestIdRef, setBetaAccess, setBetaAccessLoading });
  }, [user]);

  useEffect(() => {
    syncFirebaseBetaAccessStatus({ status, user, refreshBetaAccess, setBetaAccess, setBetaAccessLoading });
  }, [refreshBetaAccess, status, user]);

  return { betaAccess, betaAccessLoading, refreshBetaAccess };
};
