import { useEffect, useRef } from 'react';
import type { Dispatch, SetStateAction } from 'react';

export const useMonitorNwsAlertsFrameSync = (
  enabled: boolean,
  animationEnabled: boolean,
  rawFrameCount: number,
  setFrameIndex: Dispatch<SetStateAction<number>>,
  latestSnapshotKey?: string | null,
) => {
  const previousRawFrameCountRef = useRef(0);
  const previousSnapshotKeyRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    if (!enabled || !animationEnabled) {
      return undefined;
    }

    const latestKey = latestSnapshotKey ?? null;
    const frameCountGrew = rawFrameCount > previousRawFrameCountRef.current;
    const snapshotChanged = latestKey !== null && latestKey !== previousSnapshotKeyRef.current;

    if (rawFrameCount > 0 && (frameCountGrew || snapshotChanged)) {
      setFrameIndex(rawFrameCount - 1);
    }
    previousRawFrameCountRef.current = rawFrameCount;
    previousSnapshotKeyRef.current = latestKey;
    return undefined;
  }, [animationEnabled, enabled, latestSnapshotKey, rawFrameCount, setFrameIndex]);
};
