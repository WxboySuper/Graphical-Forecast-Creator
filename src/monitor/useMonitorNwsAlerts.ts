import { useEffect, useMemo, useRef, useState } from 'react';
import type { AddToastFn } from '../components/Layout';
import {
  fetchActiveNwsAlerts,
  filterNwsAlertCollection,
  snapshotCollectionKey,
  type NwsAlertFeatureCollection,
} from './nwsAlerts';
import { MAX_ANIMATION_FRAMES } from './wms';

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
  const previousRawFrameCountRef = useRef(0);

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

  useEffect(() => {
    if (!enabled || !animationEnabled || filteredFrames.length < 2) {
      return;
    }

    const timeoutId = window.setInterval(() => {
      setFrameIndex((index) => (index + 1) % filteredFrames.length);
    }, animationSpeedMs);

    return () => window.clearInterval(timeoutId);
  }, [animationEnabled, animationSpeedMs, enabled, filteredFrames.length]);

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
  }, [animationEnabled, animationSpeedMs, enabled]);

  useEffect(() => {
    if (rawFrames.length > previousRawFrameCountRef.current) {
      setFrameIndex(rawFrames.length - 1);
    }
    previousRawFrameCountRef.current = rawFrames.length;
  }, [rawFrames.length]);

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
