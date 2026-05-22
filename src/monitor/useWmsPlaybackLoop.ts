import { useEffect } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import {
  advancePlaybackFrame,
  snapToLatestFrame,
  type LayerPlaybackState,
} from './useWmsLayerPlayback';

export const useWmsPlaybackLoop = (
  shouldAnimate: boolean,
  frameSignature: string,
  animationSpeedMs: number,
  setRadarPlayback: Dispatch<SetStateAction<LayerPlaybackState>>,
  setSatellitePlayback: Dispatch<SetStateAction<LayerPlaybackState>>,
) => {
  useEffect(() => {
    if (!shouldAnimate) {
      setRadarPlayback(snapToLatestFrame);
      setSatellitePlayback(snapToLatestFrame);
      return;
    }

    const intervalId = window.setInterval(() => {
      setRadarPlayback(advancePlaybackFrame);
      setSatellitePlayback(advancePlaybackFrame);
    }, animationSpeedMs);

    return () => window.clearInterval(intervalId);
  }, [animationSpeedMs, frameSignature, setRadarPlayback, setSatellitePlayback, shouldAnimate]);
};
