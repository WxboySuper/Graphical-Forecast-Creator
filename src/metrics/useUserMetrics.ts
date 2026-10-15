import { useEffect, useRef, useState } from 'react';
import { doc, getDoc, type Timestamp } from 'firebase/firestore';
import { db, isHostedAuthEnabled } from '../lib/firebase';
import { useAuth } from '../auth/AuthProvider';
import { fetchBetaApi, isBetaClerkD1Mode } from '../lib/betaApi';

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

/** Reads a string field from a metrics snapshot value, falling back to an empty string. */
const readMetricsString = (value: unknown): string => (typeof value === 'string' ? value : '');

/** Reads an optional date-string field from a metrics snapshot value. */
const readMetricsDateString = (value: unknown): string | null =>
  typeof value === 'string' ? value : null;

/** Reads a numeric metrics counter, defaulting to zero. */
const readMetricsCount = (value: unknown): number => (typeof value === 'number' ? value : 0);

/** Reads an optional Firestore timestamp field into a native Date. */
const readMetricsTimestamp = (value: Timestamp | string | null | undefined): Date | null =>
  typeof value === 'string'
    ? Number.isNaN(new Date(value).getTime()) ? null : new Date(value)
    : value?.toDate?.() ?? null;

/** Normalizes one Firestore metrics document into the client-safe account metrics contract. */
const readUserMetricsDocument = (value: Partial<UserMetricsDocument & { updatedAt?: Timestamp | null }> | undefined): UserMetricsDocument => {
  if (!value) {
    return DEFAULT_USER_METRICS;
  }

  return {
    uid: readMetricsString(value.uid),
    activeDayStreak: readMetricsCount(value.activeDayStreak),
    totalActiveDays: readMetricsCount(value.totalActiveDays),
    cyclesCreated: readMetricsCount(value.cyclesCreated),
    cloudCyclesSaved: readMetricsCount(value.cloudCyclesSaved),
    discussionsWritten: readMetricsCount(value.discussionsWritten),
    verificationSessionsRun: readMetricsCount(value.verificationSessionsRun),
    lastActiveDate: readMetricsDateString(value.lastActiveDate),
    updatedAt: readMetricsTimestamp(value.updatedAt),
  };
};

/** Subscribes to the signed-in user's progress-only metrics document. */
export const useUserMetrics = (): UseUserMetricsResult => {
  const { user, status } = useAuth();
  const [metrics, setMetrics] = useState<UserMetricsDocument>(DEFAULT_USER_METRICS);
  const [loading, setLoading] = useState(Boolean(isHostedAuthEnabled || isBetaClerkD1Mode()));
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  useEffect(() => {
    if ((!isHostedAuthEnabled || !db) && !isBetaClerkD1Mode()) {
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
    requestIdRef.current += 1;
    const requestId = requestIdRef.current;
    const readMetrics = isBetaClerkD1Mode()
      ? fetchBetaApi('/api/user/metrics').then(async (response) => {
          const body = await response.json().catch(() => ({}));
          if (!response.ok) throw new Error(body?.error || 'Unable to load account metrics.');
          return body.metrics as Partial<UserMetricsDocument> | undefined;
        })
      : getDoc(doc(db!, 'userMetrics', user.uid)).then((snapshot) => snapshot.data() as Partial<UserMetricsDocument & { updatedAt?: Timestamp | null }> | undefined);
    readMetrics
      .then((value) => {
        if (requestId !== requestIdRef.current) {
          return;
        }

        setMetrics(
          readUserMetricsDocument(value as Partial<UserMetricsDocument & { updatedAt?: Timestamp | null }> | undefined)
        );
        setLoading(false);
        setError(null);
      })
      .catch((nextError: Error) => {
        if (requestId !== requestIdRef.current) {
          return;
        }

        setMetrics(DEFAULT_USER_METRICS);
        setLoading(false);
        setError(nextError.message);
      });
  }, [status, user]);

  return { metrics, loading, error };
};
