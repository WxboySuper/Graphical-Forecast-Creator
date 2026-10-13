import { useEffect } from 'react';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import type { AddToastFn } from '../components/Layout';
import { appendAlertSnapshotFrame, fetchActiveNwsAlerts, type NwsAlertFeatureCollection } from './nwsAlerts';
import { MAX_ANIMATION_FRAMES } from './wms';

interface UseMonitorNwsAlertsLoadOptions {
  enabled: boolean;
  refreshToken: number;
  addToast: AddToastFn;
  hasRetainedFrames: MutableRefObject<boolean>;
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
  hasRetainedFrames,
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

        // Keep prior frames visible, but tell users clearly when those alerts may be outdated.
        if (hasRetainedFrames.current) {
          setError('NWS alert refresh failed. Showing the last successful alerts, which may be outdated.');
          addToast('NWS alert refresh failed. Existing alerts remain visible and may be outdated.', 'warning');
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
  }, [addToast, enabled, hasRetainedFrames, refreshToken, setError, setFetchedAt, setFrameIndex, setLoading, setRawFrames]);
};
