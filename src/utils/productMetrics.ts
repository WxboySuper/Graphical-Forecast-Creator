import type { User } from 'firebase/auth';
import { isHostedAuthEnabled } from '../lib/firebase';

export type ProductMetricEvent =
  | 'account_signup'
  | 'account_signin'
  | 'cycle_saved'
  | 'discussion_saved'
  | 'verification_run'
  | 'cloud_cycle_saved'
  | 'cloud_cycle_loaded';

interface RecordProductMetricOptions {
  event: ProductMetricEvent;
  user?: User | null;
}

const INSTALLATION_ID_STORAGE_KEY = 'gfcInstallationId';

/** Returns the browser-scoped anonymous installation id used for daily active-device dedupe. */
const getInstallationId = (): string | null => {
  if (!isHostedAuthEnabled || typeof window === 'undefined') {
    return null;
  }

  const existingValue = window.localStorage.getItem(INSTALLATION_ID_STORAGE_KEY);
  if (existingValue) {
    return existingValue;
  }

  const nextValue =
    typeof window.crypto?.randomUUID === 'function'
      ? window.crypto.randomUUID()
      : `gfc-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  window.localStorage.setItem(INSTALLATION_ID_STORAGE_KEY, nextValue);
  return nextValue;
};

/** Sends one privacy-safe product event to the hosted metrics endpoint and never throws. */
export const recordProductMetric = async ({
  event,
  user,
}: RecordProductMetricOptions): Promise<void> => {
  try {
    const installationId = getInstallationId();
    if (!installationId) {
      return;
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (user) {
      headers.Authorization = `Bearer ${await user.getIdToken()}`;
    }

    await fetch('/api/metrics/event', {
      method: 'POST',
      headers,
      keepalive: true,
      body: JSON.stringify({
        event,
        installationId,
      }),
    });
  } catch {
    // Metrics must never break core user flows.
  }
};

/** Queues one product metric in the background without making the caller handle Promises. */
export const queueProductMetric = (options: RecordProductMetricOptions): void => {
  recordProductMetric(options).catch(() => undefined);
};
