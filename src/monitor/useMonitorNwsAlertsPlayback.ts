import { useEffect, useRef, type Dispatch, type SetStateAction } from 'react';
import {
  fetchActiveNwsAlerts,
  snapshotCollectionKey,
  type NwsAlertFeatureCollection,
} from './nwsAlerts';
import { MAX_ANIMATION_FRAMES } from './wms';

const appendSnapshotFrame = (
  current: NwsAlertFeatureCollection[],
  collection: NwsAlertFeatureCollection,
): NwsAlertFeatureCollection[] => {
  const snapshotKey = snapshotCollectionKey(collection);
  const last = current[current.length - 1];
  if (last && snapshotCollectionKey(last) === snapshotKey) {
    return current;
  }

  return [...current, collection].slice(-MAX_ANIMATION_FRAMES);
};

interface UseMonitorNwsAlertsPlaybackArgs {
  enabled: boolean;
  animationEnabled: boolean;
  animationSpeedMs: number;
  filteredFrameCount: number;
  rawFrameCount: number;
  setRawFrames: Dispatch<SetStateAction<NwsAlertFeatureCollection[]>>;
  setFrameIndex: Dispatch<SetStateAction<number>>;
  setFetchedAt: Dispatch<SetStateAction<string | null>>;
}

export const useMonitorNwsAlertsPlayback = ({
  enabled,
  animationEnabled,
  animationSpeedMs,
  filteredFrameCount,
  rawFrameCount,
  setRawFrames,
  setFrameIndex,
  setFetchedAt,
}: UseMonitorNwsAlertsPlaybackArgs) => {
  const previousRawFrameCountRef = useRef(0);

  useEffect(() => {
    if (!enabled || !animationEnabled || filteredFrameCount < 2) {
      return;
    }

    const timeoutId = window.setInterval(() => {
      setFrameIndex((index) => (index + 1) % filteredFrameCount);
    }, animationSpeedMs);

    return () => window.clearInterval(timeoutId);
  }, [animationEnabled, animationSpeedMs, enabled, filteredFrameCount, setFrameIndex]);

  useEffect(() => {
    if (!enabled || !animationEnabled) {
      return;
    }

    const intervalId = window.setInterval(() => {
      fetchActiveNwsAlerts()
        .then((collection) => {
          setRawFrames((current) => appendSnapshotFrame(current, collection));
          setFetchedAt(new Date().toISOString());
        })
        .catch(() => {
          // Keep the last good frame during playback hiccups.
        });
    }, Math.max(animationSpeedMs * 4, 15_000));

    return () => window.clearInterval(intervalId);
  }, [animationEnabled, animationSpeedMs, enabled, setFetchedAt, setRawFrames]);

  useEffect(() => {
    if (rawFrameCount > previousRawFrameCountRef.current) {
      setFrameIndex(rawFrameCount - 1);
    }
    previousRawFrameCountRef.current = rawFrameCount;
  }, [rawFrameCount, setFrameIndex]);
};
