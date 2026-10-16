import { useEffect, useRef, useState } from 'react';
import { doc, getDoc, type Timestamp } from 'firebase/firestore';
import { db, isHostedAuthEnabled } from '../lib/firebase';
import { useAuth } from '../auth/AuthProvider';
import { fetchBetaApi, isBetaClerkD1Mode, isBetaSessionInitializing } from '../lib/betaApi';

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

type UserMetricsSnapshot = Partial<Omit<UserMetricsDocument, 'updatedAt'>> & {
  updatedAt?: Timestamp | string | null;
};

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
const readMetricsTimestamp = (value: Timestamp | string | null | undefined): Date | null => {
  if (typeof value === 'string') {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return value?.toDate?.() ?? null;
};

/** Normalizes one Firestore metrics document into the client-safe account metrics contract. */
const readUserMetricsDocument = (value: UserMetricsSnapshot | undefined): UserMetricsDocument => {
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

const fetchUserMetricsSnapshot = async (userId: string): Promise<UserMetricsSnapshot | undefined> => {
  if (!isBetaClerkD1Mode()) {
    const snapshot = await getDoc(doc(db!, 'userMetrics', userId));
    return snapshot.data() as UserMetricsSnapshot | undefined;
  }

  const response = await fetchBetaApi('/api/user/metrics');
  const body = (await response.json().catch(() => ({}))) ?? {};
  if (!response.ok) throw new Error(body?.error || 'Unable to load account metrics.');
  return body?.metrics as UserMetricsSnapshot | undefined;
};

type MetricsStateHandlers = {
  setMetrics: React.Dispatch<React.SetStateAction<UserMetricsDocument>>;
  setLoading: React.Dispatch<React.SetStateAction<boolean>>;
  setError: React.Dispatch<React.SetStateAction<string | null>>;
};

const resetUserMetrics = ({ setMetrics, setLoading, setError }: MetricsStateHandlers): void => {
  setMetrics(DEFAULT_USER_METRICS);
  setLoading(false);
  setError(null);
};

const isCurrentMetricsRequest = (active: boolean, requestId: number, currentRequestId: number): boolean =>
  active && requestId === currentRequestId;

const retryMetricsLoad = (message: string, attempts: number, schedule: () => void): boolean => {
  if (!isBetaClerkD1Mode()) return false;
  if (!isBetaSessionInitializing(message)) return false;
  if (attempts >= 20) return false;
  schedule();
  return true;
};

const canLoadUserMetrics = (): boolean => {
  if (isBetaClerkD1Mode()) return true;
  return isHostedAuthEnabled && Boolean(db);
};

const startUserMetricsRequest = (userId: string, handlers: MetricsStateHandlers, requestIdRef: React.MutableRefObject<number>) => {
  handlers.setLoading(true);
  requestIdRef.current += 1;
  const requestId = requestIdRef.current;
  let active = true;
  let attempts = 0;
  let retryTimer: number | undefined;
  const isCurrent = () => isCurrentMetricsRequest(active, requestId, requestIdRef.current);
  const scheduleRetry = () => {
    attempts += 1;
    retryTimer = window.setTimeout(() => { void loadMetrics(); }, 250);
  };
  const loadMetrics = async (): Promise<void> => {
    try {
      const value = await fetchUserMetricsSnapshot(userId);
      if (!isCurrent()) return;
      handlers.setMetrics(readUserMetricsDocument(value));
      handlers.setLoading(false);
      handlers.setError(null);
    } catch (nextError) {
      if (!isCurrent()) return;
      const message = nextError instanceof Error ? nextError.message : 'Unable to load account metrics.';
      if (retryMetricsLoad(message, attempts, scheduleRetry)) return;
      handlers.setMetrics(DEFAULT_USER_METRICS);
      handlers.setLoading(false);
      handlers.setError(message);
    }
  };
  void loadMetrics();
  return () => {
    active = false;
    requestIdRef.current += 1;
    if (retryTimer !== undefined) window.clearTimeout(retryTimer);
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
    if (!canLoadUserMetrics()) return resetUserMetrics({ setMetrics, setLoading, setError });
    if (status === 'loading') {
      setLoading(true);
      return;
    }
    if (!user) return resetUserMetrics({ setMetrics, setLoading, setError });
    return startUserMetricsRequest(user.uid, { setMetrics, setLoading, setError }, requestIdRef);
  }, [status, user]);

  return { metrics, loading, error };
};
