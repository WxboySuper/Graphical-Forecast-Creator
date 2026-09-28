import { useEffect, useRef } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { NwsAlertFeatureCollection } from './nwsAlerts';

export const useMonitorNwsAlertsFrameSync = (
  enabled: boolean,
  animationEnabled: boolean,
  rawFrames: readonly NwsAlertFeatureCollection[],
  setFrameIndex: Dispatch<SetStateAction<number>>,
) => {
  const previousRawFramesRef = useRef<readonly NwsAlertFeatureCollection[] | null>(null);

  useEffect(() => {
    if (!enabled || !animationEnabled) {
      return undefined;
    }

    if (rawFrames.length === 0) {
      previousRawFramesRef.current = rawFrames;
      return undefined;
    }

    if (previousRawFramesRef.current !== rawFrames) {
      setFrameIndex(rawFrames.length - 1);
    }
    previousRawFramesRef.current = rawFrames;
    return undefined;
  }, [animationEnabled, enabled, rawFrames, setFrameIndex]);
};
