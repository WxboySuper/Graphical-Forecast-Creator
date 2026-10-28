import { useEffect, useRef, type Dispatch, type SetStateAction } from 'react';
import type { NwsAlertFeatureCollection } from './nwsAlerts';

interface MonitorNwsAlertsFrameSyncOptions {
  enabled: boolean;
  animationEnabled: boolean;
  rawFrameCount: number;
  latestFrame: NwsAlertFeatureCollection | null;
  setFrameIndex: Dispatch<SetStateAction<number>>;
}

/**
 * Keeps the animation on the newest alert frame.
 *
 * The frame window is bounded (see MAX_ANIMATION_FRAMES), so once it fills the
 * frame count stops growing. Watching the newest frame identity as well keeps
 * playback following new snapshots after that point: `appendAlertSnapshotFrame`
 * returns the previous array when nothing changed and appends a new collection
 * when it did.
 */
export const useMonitorNwsAlertsFrameSync = ({
  enabled,
  animationEnabled,
  rawFrameCount,
  latestFrame,
  setFrameIndex,
}: MonitorNwsAlertsFrameSyncOptions) => {
  const previousRawFrameCountRef = useRef(0);
  const previousLatestFrameRef = useRef<NwsAlertFeatureCollection | null>(null);

  useEffect(() => {
    if (!enabled || !animationEnabled) {
      return undefined;
    }

    const frameCountGrew = rawFrameCount > previousRawFrameCountRef.current;
    const latestFrameChanged = rawFrameCount > 0
      && latestFrame !== null
      && latestFrame !== previousLatestFrameRef.current;
    if (frameCountGrew || latestFrameChanged) {
      setFrameIndex(rawFrameCount - 1);
    }
    previousRawFrameCountRef.current = rawFrameCount;
    previousLatestFrameRef.current = latestFrame;
    return undefined;
  }, [animationEnabled, enabled, latestFrame, rawFrameCount, setFrameIndex]);
};
