import { useEffect, useState } from 'react';
import { doc, onSnapshot, type Timestamp } from 'firebase/firestore';
import { db, isHostedAuthEnabled } from '../lib/firebase';
import { useAuth } from '../auth/AuthProvider';

export interface UserMetricsDocument {
  uid: string;
  activeDayStreak: number;
  totalActiveDays: number;
  cyclesCreated: number;
  cloudCyclesSaved: number;
  discussionsWritten: number;
  verificationSessionsRun: number;
  lastActiveDate: string | null;
  updatedAt: Date | null;
}

interface UseUserMetricsResult {
  metrics: UserMetricsDocument;
  loading: boolean;
  error: string | null;
}

const DEFAULT_USER_METRICS: UserMetricsDocument = {
  uid: '',
  activeDayStreak: 0,
  totalActiveDays: 0,
  cyclesCreated: 0,
  cloudCyclesSaved: 0,
  discussionsWritten: 0,
  verificationSessionsRun: 0,
  lastActiveDate: null,
  updatedAt: null,
};

/** Normalizes one Firestore metrics document into the client-safe account metrics contract. */
const readUserMetricsDocument = (value: Partial<UserMetricsDocument & { updatedAt?: Timestamp | null }> | undefined): UserMetricsDocument => {
  if (!value) {
    return DEFAULT_USER_METRICS;
  }

  return {
    uid: typeof value.uid === 'string' ? value.uid : '',
    activeDayStreak: typeof value.activeDayStreak === 'number' ? value.activeDayStreak : 0,
    totalActiveDays: typeof value.totalActiveDays === 'number' ? value.totalActiveDays : 0,
    cyclesCreated: typeof value.cyclesCreated === 'number' ? value.cyclesCreated : 0,
    cloudCyclesSaved: typeof value.cloudCyclesSaved === 'number' ? value.cloudCyclesSaved : 0,
    discussionsWritten: typeof value.discussionsWritten === 'number' ? value.discussionsWritten : 0,
    verificationSessionsRun:
      typeof value.verificationSessionsRun === 'number' ? value.verificationSessionsRun : 0,
    lastActiveDate: typeof value.lastActiveDate === 'string' ? value.lastActiveDate : null,
    updatedAt: value.updatedAt?.toDate?.() ?? null,
  };
};

/** Subscribes to the signed-in user's progress-only metrics document. */
export const useUserMetrics = (): UseUserMetricsResult => {
  const { user, status } = useAuth();
  const [metrics, setMetrics] = useState<UserMetricsDocument>(DEFAULT_USER_METRICS);
  const [loading, setLoading] = useState(Boolean(isHostedAuthEnabled));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isHostedAuthEnabled || !db) {
      setMetrics(DEFAULT_USER_METRICS);
      setLoading(false);
      setError(null);
      return;
    }

    if (status === 'loading') {
      setLoading(true);
      return;
    }

    if (!user) {
      setMetrics(DEFAULT_USER_METRICS);
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    const metricsRef = doc(db, 'userMetrics', user.uid);
    const unsubscribe = onSnapshot(
      metricsRef,
      (snapshot) => {
        setMetrics(
          readUserMetricsDocument(
            snapshot.data() as Partial<UserMetricsDocument & { updatedAt?: Timestamp | null }> | undefined
          )
        );
        setLoading(false);
        setError(null);
      },
      (nextError) => {
        setMetrics(DEFAULT_USER_METRICS);
        setLoading(false);
        setError(nextError.message);
      }
    );

    return () => {
      unsubscribe();
    };
  }, [status, user]);

  return { metrics, loading, error };
};
