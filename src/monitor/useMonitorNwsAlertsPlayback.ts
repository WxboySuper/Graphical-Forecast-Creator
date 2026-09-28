import { useMemo } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { snapshotCollectionKey, type NwsAlertFeatureCollection } from './nwsAlerts';
import { useMonitorNwsAlertsFrameAdvance } from './useMonitorNwsAlertsFrameAdvance';
import { useMonitorNwsAlertsFrameSync } from './useMonitorNwsAlertsFrameSync';
import { useMonitorNwsAlertsRefresh } from './useMonitorNwsAlertsRefresh';

interface UseMonitorNwsAlertsPlaybackArgs {
  enabled: boolean;
  animationEnabled: boolean;
  animationSpeedMs: number;
  filteredFrameCount: number;
  rawFrames: NwsAlertFeatureCollection[];
  setRawFrames: Dispatch<SetStateAction<NwsAlertFeatureCollection[]>>;
  setFrameIndex: Dispatch<SetStateAction<number>>;
  setFetchedAt: Dispatch<SetStateAction<string | null>>;
}

export const useMonitorNwsAlertsPlayback = ({
  enabled,
  animationEnabled,
  animationSpeedMs,
  filteredFrameCount,
  rawFrames,
  setRawFrames,
  setFrameIndex,
  setFetchedAt,
}: UseMonitorNwsAlertsPlaybackArgs) => {
  const latestSnapshotKey = useMemo(() => {
    const latest = rawFrames[rawFrames.length - 1];
    return latest ? snapshotCollectionKey(latest) : null;
  }, [rawFrames]);
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
  useMonitorNwsAlertsFrameSync(enabled, animationEnabled, rawFrames.length, setFrameIndex, latestSnapshotKey);
};
