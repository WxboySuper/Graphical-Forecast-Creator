import { useEffect } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { fetchActiveNwsAlerts, snapshotCollectionKey, type NwsAlertFeatureCollection } from './nwsAlerts';
import { MAX_ANIMATION_FRAMES } from './wms';

const appendSnapshotFrame = (
  current: NwsAlertFeatureCollection[],
  collection: NwsAlertFeatureCollection,
): NwsAlertFeatureCollection[] => {
  const last = current[current.length - 1];
  if (last && snapshotCollectionKey(last) === snapshotCollectionKey(collection)) {
    return current;
  }

  return [...current, collection].slice(-MAX_ANIMATION_FRAMES);
};

export const useMonitorNwsAlertsRefresh = (
  enabled: boolean,
  animationEnabled: boolean,
  animationSpeedMs: number,
  setRawFrames: Dispatch<SetStateAction<NwsAlertFeatureCollection[]>>,
  setFetchedAt: Dispatch<SetStateAction<string | null>>,
) => {
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
        .catch(() => undefined);
    }, Math.max(animationSpeedMs * 4, 15_000));

    return () => window.clearInterval(intervalId);
  }, [animationEnabled, animationSpeedMs, enabled, setFetchedAt, setRawFrames]);
};
