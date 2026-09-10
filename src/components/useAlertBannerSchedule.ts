import { useEffect, useState } from 'react';
import type { AlertBannerConfig } from './alertBannerConfig';

const MAX_TIMEOUT_MS = 2_147_483_647;

function getNextBoundaryMs(config: Pick<AlertBannerConfig, 'startsAt' | 'expiresAt'>, nowMs: number): number {
  const boundaryTimes = [config.startsAt, config.expiresAt]
    .map((value) => (value ? Date.parse(value) : Number.NaN))
    .filter((value) => Number.isFinite(value) && value > nowMs);
  return Math.min(...boundaryTimes);
}

/** Keeps the current time fresh when an alert schedule boundary is reached. */
export function useAlertBannerSchedule(config: Pick<AlertBannerConfig, 'startsAt' | 'expiresAt'>): number {
  const [nowMs, setNowMs] = useState(() => Date.now());
  const nextBoundaryMs = getNextBoundaryMs(config, nowMs);

  useEffect(() => {
    if (!Number.isFinite(nextBoundaryMs)) {
      return undefined;
    }

    const delayMs = Math.min(MAX_TIMEOUT_MS, Math.max(0, nextBoundaryMs - Date.now()));
    const timeout = window.setTimeout(() => setNowMs(Date.now()), delayMs);
    return () => window.clearTimeout(timeout);
  }, [nextBoundaryMs]);

  return nowMs;
}
