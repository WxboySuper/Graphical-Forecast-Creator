import { useEffect } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { appendAlertSnapshotFrame, fetchActiveNwsAlerts, type NwsAlertFeatureCollection } from './nwsAlerts';
import { MAX_ANIMATION_FRAMES } from './wms';

interface MonitorNwsAlertsRefreshOptions {
  enabled: boolean;
  animationEnabled: boolean;
  animationSpeedMs: number;
  setRawFrames: Dispatch<SetStateAction<NwsAlertFeatureCollection[]>>;
  setFetchedAt: Dispatch<SetStateAction<string | null>>;
}

/** Polls animated NWS alerts without overlapping or stale requests. */
export const useMonitorNwsAlertsRefresh = ({
  enabled,
  animationEnabled,
  animationSpeedMs,
  setRawFrames,
  setFetchedAt,
}: MonitorNwsAlertsRefreshOptions) => {
  useEffect(() => {
    if (!enabled || !animationEnabled) {
      return undefined;
    }

    let active = true;
    let requestInFlight = false;
    const intervalId = window.setInterval(() => {
      if (!active || requestInFlight) return;
      requestInFlight = true;
      fetchActiveNwsAlerts()
        .then((collection) => {
          if (!active) return;
          setRawFrames((current) => appendAlertSnapshotFrame(current, collection, MAX_ANIMATION_FRAMES));
          setFetchedAt(new Date().toISOString());
        })
        .catch(() => undefined)
        .finally(() => {
          requestInFlight = false;
        });
    }, Math.max(animationSpeedMs * 4, 15_000));

    return () => {
      active = false;
      window.clearInterval(intervalId);
    };
  }, [animationEnabled, animationSpeedMs, enabled, setFetchedAt, setRawFrames]);
};
