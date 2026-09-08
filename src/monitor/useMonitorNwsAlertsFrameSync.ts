/**
 * NWS alert frame synchronization hook. Keeps selected alert frames aligned with monitor playback state.
 */
import { useEffect, useRef, type Dispatch, type SetStateAction } from 'react';

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
    return undefined;
  }, [animationEnabled, enabled, rawFrameCount, setFrameIndex]);
};