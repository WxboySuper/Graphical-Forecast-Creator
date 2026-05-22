import { useEffect } from 'react';
import type { Dispatch, SetStateAction } from 'react';

interface MonitorNwsAlertsFrameAdvanceOptions {
  enabled: boolean;
  animationEnabled: boolean;
  filteredFrameCount: number;
  animationSpeedMs: number;
  setFrameIndex: Dispatch<SetStateAction<number>>;
}

export const useMonitorNwsAlertsFrameAdvance = ({
  enabled,
  animationEnabled,
  filteredFrameCount,
  animationSpeedMs,
  setFrameIndex,
}: MonitorNwsAlertsFrameAdvanceOptions) => {
  useEffect(() => {
    const shouldAdvance = enabled && animationEnabled && filteredFrameCount >= 2;
    if (!shouldAdvance) {
      return;
    }

    const timeoutId = window.setInterval(() => {
      setFrameIndex((index) => (index + 1) % filteredFrameCount);
    }, animationSpeedMs);

    return () => window.clearInterval(timeoutId);
  }, [animationEnabled, animationSpeedMs, enabled, filteredFrameCount, setFrameIndex]);
};
