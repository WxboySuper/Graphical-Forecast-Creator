import { useEffect } from 'react';
import type { Dispatch, SetStateAction } from 'react';

export const useMonitorNwsAlertsFrameAdvance = (
  enabled: boolean,
  animationEnabled: boolean,
  filteredFrameCount: number,
  animationSpeedMs: number,
  setFrameIndex: Dispatch<SetStateAction<number>>,
) => {
  useEffect(() => {
    if (!enabled || !animationEnabled || filteredFrameCount < 2) {
      return;
    }

    const timeoutId = window.setInterval(() => {
      setFrameIndex((index) => (index + 1) % filteredFrameCount);
    }, animationSpeedMs);

    return () => window.clearInterval(timeoutId);
  }, [animationEnabled, animationSpeedMs, enabled, filteredFrameCount, setFrameIndex]);
};
