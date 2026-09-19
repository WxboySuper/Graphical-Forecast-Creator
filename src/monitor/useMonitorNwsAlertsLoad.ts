/**
 * Monitor NWS alert loading hook.
 *
 * This hook fetches and normalizes National Weather Service alerts for monitor layers, exposing loading and error state to the monitor UI. Layer rendering stays in monitor components.
 */
import { useEffect, type Dispatch, type SetStateAction } from 'react';
import type { AddToastFn } from '../components/Layout';
import { appendAlertSnapshotFrame, fetchActiveNwsAlerts, type NwsAlertFeatureCollection } from './nwsAlerts';
import { MAX_ANIMATION_FRAMES } from './wms';

interface UseMonitorNwsAlertsLoadOptions {
  enabled: boolean;
  refreshToken: number;
  addToast: AddToastFn;
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

        setRawFrames([]);
        setError('Official alerts are unavailable right now.');
        addToast('NWS watch/warning polygons could not be loaded.', 'warning');
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
  }, [addToast, enabled, refreshToken, setError, setFetchedAt, setFrameIndex, setLoading, setRawFrames]);
};
