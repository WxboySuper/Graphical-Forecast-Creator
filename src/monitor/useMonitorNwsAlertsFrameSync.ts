import { useEffect, useRef } from 'react';
import type { Dispatch, SetStateAction } from 'react';

export const useMonitorNwsAlertsFrameSync = (
  enabled: boolean,
  animationEnabled: boolean,
  rawFrameCount: number,
  setFrameIndex: Dispatch<SetStateAction<number>>,
) => {
  const previousRawFrameCountRef = useRef(0);

  useEffect(() => {
    if (!enabled || !animationEnabled) {
      return undefined;
    }

    if (rawFrameCount > previousRawFrameCountRef.current) {
      setFrameIndex(rawFrameCount - 1);
    }
    previousRawFrameCountRef.current = rawFrameCount;
  }, [animationEnabled, enabled, rawFrameCount, setFrameIndex]);
};
