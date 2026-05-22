import { useEffect, useMemo, useState } from 'react';
import type { AddToastFn } from '../components/Layout';
import {
  fetchActiveNwsAlerts,
  filterNwsAlertCollection,
  snapshotCollectionKey,
  type NwsAlertFeatureCollection,
} from './nwsAlerts';
import { MAX_ANIMATION_FRAMES } from './wms';
import { useMonitorNwsAlertsPlayback } from './useMonitorNwsAlertsPlayback';

interface UseMonitorNwsAlertsArgs {
  enabled: boolean;
  showWatches: boolean;
  showWarnings: boolean;
  showAdvisories: boolean;
  animationEnabled: boolean;
  animationSpeedMs: number;
  refreshToken: number;
  addToast: AddToastFn;
}

const emptyCollection = (): NwsAlertFeatureCollection => ({
  type: 'FeatureCollection',
  features: [],
});

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

export const useMonitorNwsAlerts = ({
  enabled,
  showWatches,
  showWarnings,
  showAdvisories,
  animationEnabled,
  animationSpeedMs,
  refreshToken,
  addToast,
}: UseMonitorNwsAlertsArgs) => {
  const [rawFrames, setRawFrames] = useState<NwsAlertFeatureCollection[]>([]);
  const [frameIndex, setFrameIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fetchedAt, setFetchedAt] = useState<string | null>(null);

  const filterOptions = useMemo(
    () => ({ showWatches, showWarnings, showAdvisories }),
    [showAdvisories, showWarnings, showWatches],
  );

  const filteredFrames = useMemo(
    () => rawFrames.map((frame) => filterNwsAlertCollection(frame, filterOptions)),
    [filterOptions, rawFrames],
  );

  useEffect(() => {
    if (!enabled) {
      setRawFrames([]);
      setFrameIndex(0);
      setError(null);
      setLoading(false);
      return;
    }

    let active = true;
    setLoading(true);
    setError(null);

    fetchActiveNwsAlerts()
      .then((collection) => {
        if (!active) {
          return;
        }

        const nextFrames = appendSnapshotFrame([], collection);
        setRawFrames(nextFrames);
        setFrameIndex(Math.max(0, nextFrames.length - 1));
        setFetchedAt(new Date().toISOString());
      })
      .catch(() => {
        if (!active) {
          return;
        }

        setRawFrames([]);
        setError('Official alerts are unavailable right now.');
        addToast('NWS watch/warning polygons could not be loaded.', 'warning');
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [addToast, enabled, refreshToken]);

  useMonitorNwsAlertsPlayback({
    enabled,
    animationEnabled,
    animationSpeedMs,
    filteredFrameCount: filteredFrames.length,
    rawFrameCount: rawFrames.length,
    setRawFrames,
    setFrameIndex,
    setFetchedAt,
  });

  const activeCollection = useMemo(() => {
    if (!enabled || filteredFrames.length === 0) {
      return emptyCollection();
    }

    if (animationEnabled && filteredFrames.length > 1) {
      return filteredFrames[frameIndex] ?? filteredFrames[filteredFrames.length - 1] ?? emptyCollection();
    }

    return filteredFrames[filteredFrames.length - 1] ?? emptyCollection();
  }, [animationEnabled, enabled, filteredFrames, frameIndex]);

  return {
    alertCollection: activeCollection,
    frameCount: filteredFrames.length,
    frameIndex: animationEnabled ? frameIndex : Math.max(0, filteredFrames.length - 1),
    loading,
    error,
    fetchedAt,
    polygonCount: activeCollection.features.length,
  };
};
