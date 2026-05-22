import { useEffect, useMemo, useState } from 'react';
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
  const [frames, setFrames] = useState<NwsAlertFeatureCollection[]>([]);
  const [frameIndex, setFrameIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fetchedAt, setFetchedAt] = useState<string | null>(null);

  const filterOptions = useMemo(
    () => ({ showWatches, showWarnings, showAdvisories }),
    [showAdvisories, showWarnings, showWatches],
  );

  useEffect(() => {
    if (!enabled) {
      setFrames([]);
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

        const filtered = filterNwsAlertCollection(collection, filterOptions);
        const snapshotKey = snapshotCollectionKey(filtered);

        setFrames((current) => {
          const last = current[current.length - 1];
          if (last && snapshotCollectionKey(last) === snapshotKey) {
            return current;
          }

          const nextFrames = [...current, filtered].slice(-MAX_ANIMATION_FRAMES);
          setFrameIndex(nextFrames.length - 1);
          return nextFrames;
        });
        setFetchedAt(new Date().toISOString());
      })
      .catch(() => {
        if (!active) {
          return;
        }

        setFrames([]);
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
  }, [addToast, enabled, filterOptions, refreshToken]);

  useEffect(() => {
    if (!enabled || !animationEnabled || frames.length < 2) {
      return;
    }

    const timeoutId = window.setInterval(() => {
      setFrameIndex((index) => (index + 1) % frames.length);
    }, animationSpeedMs);

    return () => window.clearInterval(timeoutId);
  }, [animationEnabled, animationSpeedMs, enabled, frames.length]);

  useEffect(() => {
    if (!enabled || !animationEnabled) {
      return;
    }

    const intervalId = window.setInterval(() => {
      fetchActiveNwsAlerts()
        .then((collection) => {
          const filtered = filterNwsAlertCollection(collection, filterOptions);
          const snapshotKey = snapshotCollectionKey(filtered);
          setFrames((current) => {
            const last = current[current.length - 1];
            if (last && snapshotCollectionKey(last) === snapshotKey) {
              return current;
            }

            return [...current, filtered].slice(-MAX_ANIMATION_FRAMES);
          });
          setFetchedAt(new Date().toISOString());
        })
        .catch(() => {
          // Keep the last good frame during playback hiccups.
        });
    }, Math.max(animationSpeedMs * 4, 15_000));

    return () => window.clearInterval(intervalId);
  }, [animationEnabled, animationSpeedMs, enabled, filterOptions]);

  const activeCollection = useMemo(() => {
    if (!enabled || frames.length === 0) {
      return emptyCollection();
    }

    if (animationEnabled && frames.length > 1) {
      return frames[frameIndex] ?? frames[frames.length - 1] ?? emptyCollection();
    }

    return frames[frames.length - 1] ?? emptyCollection();
  }, [animationEnabled, enabled, frameIndex, frames]);

  return {
    alertCollection: activeCollection,
    frameCount: frames.length,
    frameIndex: animationEnabled ? frameIndex : Math.max(0, frames.length - 1),
    loading,
    error,
    fetchedAt,
    polygonCount: activeCollection.features.length,
  };
};
