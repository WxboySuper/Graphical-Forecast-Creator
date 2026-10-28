import type { Dispatch, SetStateAction } from 'react';
import type { NwsAlertFeatureCollection } from './nwsAlerts';
import { useMonitorNwsAlertsFrameAdvance } from './useMonitorNwsAlertsFrameAdvance';
import { useMonitorNwsAlertsFrameSync } from './useMonitorNwsAlertsFrameSync';
import { useMonitorNwsAlertsRefresh } from './useMonitorNwsAlertsRefresh';

interface UseMonitorNwsAlertsPlaybackArgs {
  enabled: boolean;
  animationEnabled: boolean;
  animationSpeedMs: number;
  filteredFrameCount: number;
  rawFrameCount: number;
  latestFrame: NwsAlertFeatureCollection | null;
  setRawFrames: Dispatch<SetStateAction<NwsAlertFeatureCollection[]>>;
  setFrameIndex: Dispatch<SetStateAction<number>>;
  setFetchedAt: Dispatch<SetStateAction<string | null>>;
  onRefreshError?: (message: string | null) => void;
}

export const useMonitorNwsAlertsPlayback = ({
  enabled,
  animationEnabled,
  animationSpeedMs,
  filteredFrameCount,
  rawFrameCount,
  latestFrame,
  setRawFrames,
  setFrameIndex,
  setFetchedAt,
  onRefreshError,
}: UseMonitorNwsAlertsPlaybackArgs) => {
  useMonitorNwsAlertsFrameAdvance({
    enabled,
    animationEnabled,
    filteredFrameCount,
    animationSpeedMs,
    setFrameIndex,
  });
  useMonitorNwsAlertsRefresh({
    enabled,
    animationEnabled,
    animationSpeedMs,
    setRawFrames,
    setFetchedAt,
    onError: onRefreshError,
  });
  useMonitorNwsAlertsFrameSync({
    enabled,
    animationEnabled,
    rawFrameCount,
    latestFrame,
    setFrameIndex,
  });
};
