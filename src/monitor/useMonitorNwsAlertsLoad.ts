import { useEffect } from 'react';
import type { Dispatch, RefObject, SetStateAction } from 'react';
import type { AddToastFn } from '../components/Layout';
import { appendAlertSnapshotFrame, fetchActiveNwsAlerts, type NwsAlertFeatureCollection } from './nwsAlerts';
import { MAX_ANIMATION_FRAMES } from './wms';

interface UseMonitorNwsAlertsLoadOptions {
  enabled: boolean;
  refreshToken: number;
  addToast: AddToastFn;
  hasExistingFrames: RefObject<boolean>;
  setRawFrames: Dispatch<SetStateAction<NwsAlertFeatureCollection[]>>;
  setFrameIndex: Dispatch<SetStateAction<number>>;
  setLoading: Dispatch<SetStateAction<boolean>>;
  setError: Dispatch<SetStateAction<string | null>>;
  setFetchedAt: Dispatch<SetStateAction<string | null>>;
}

/** Loads the initial or manually refreshed NWS alert snapshot. */
export const useMonitorNwsAlertsLoad = ({
  enabled,
  refreshToken,
  addToast,
  hasExistingFrames,
  setRawFrames,
  setFrameIndex,
  setLoading,
  setError,
  setFetchedAt,
}: UseMonitorNwsAlertsLoadOptions) => {
  useEffect(() => {
    if (!enabled) {
      setRawFrames([]);
      setFrameIndex(0);
      setError(null);
      setLoading(false);
      return undefined;
    }

    let active = true;
    // This stable ref is sampled once for this request; changing its value does not restart the load.
    const hadExistingFramesAtStart = hasExistingFrames.current;
    setLoading(true);
    setError(null);

    fetchActiveNwsAlerts()
      .then((collection) => {
        if (!active) {
          return undefined;
        }

        const nextFrames = appendAlertSnapshotFrame([], collection, MAX_ANIMATION_FRAMES);
        setRawFrames(nextFrames);
        setFrameIndex(Math.max(0, nextFrames.length - 1));
        setFetchedAt(new Date().toISOString());
        return undefined;
      })
      .catch(() => {
        if (!active) {
          return undefined;
        }

        // Keep prior frames; current filters still determine which alerts appear.
        if (hadExistingFramesAtStart) {
          const message = 'NWS alert refresh failed. Previous alert data is retained, may be outdated, and still follows current filters.';
          setError(message);
          addToast(message, 'warning');
        } else {
          setError('Official alerts are unavailable right now.');
          addToast('NWS watch/warning polygons could not be loaded.', 'warning');
        }
        return undefined;
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [addToast, enabled, hasExistingFrames, refreshToken, setError, setFetchedAt, setFrameIndex, setLoading, setRawFrames]);
};
