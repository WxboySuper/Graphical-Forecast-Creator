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
  });
  useMonitorNwsAlertsFrameSync(enabled, animationEnabled, rawFrameCount, setFrameIndex);
};
