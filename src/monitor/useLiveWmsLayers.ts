import { useEffect, useState } from 'react';
import type { AddToastFn } from '../components/Layout';
import type { WmsLayerConfig } from './wms';
import {
  advancePlaybackFrame,
  emptyPlayback,
  resolveDisplayTime,
  snapToLatestFrame,
  useLoadWmsLayerFrames,
  type LayerPlaybackState,
} from './useWmsLayerPlayback';

interface UseLiveWmsLayersArgs {
  radarConfig: WmsLayerConfig | null;
  satelliteConfig: WmsLayerConfig | null;
  animationEnabled: boolean;
  animationSpeedMs: number;
  refreshToken: number;
  addToast: AddToastFn;
}

/** Loads WMS time dimensions and optionally loops the latest frames for radar/satellite. */
export const useLiveWmsLayers = ({
  radarConfig,
  satelliteConfig,
  animationEnabled,
  animationSpeedMs,
  refreshToken,
  addToast,
}: UseLiveWmsLayersArgs) => {
  const [radarPlayback, setRadarPlayback] = useState<LayerPlaybackState>(emptyPlayback);
  const [satellitePlayback, setSatellitePlayback] = useState<LayerPlaybackState>(emptyPlayback);

  useLoadWmsLayerFrames(
    radarConfig,
    setRadarPlayback,
    refreshToken,
    addToast,
    'Radar capabilities are unavailable right now.',
  );
  useLoadWmsLayerFrames(
    satelliteConfig,
    setSatellitePlayback,
    refreshToken,
    addToast,
    'Satellite capabilities are unavailable right now.',
  );

  const radarHasFrames = radarPlayback.frameTimes.length > 1;
  const satelliteHasFrames = satellitePlayback.frameTimes.length > 1;
  const shouldAnimate = animationEnabled && (radarHasFrames || satelliteHasFrames);
  const frameSignature = `${radarPlayback.frameTimes.join('|')}::${satellitePlayback.frameTimes.join('|')}`;

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
  }, [animationSpeedMs, frameSignature, shouldAnimate]);

  return {
    radarDisplayTime: resolveDisplayTime(radarPlayback),
    satelliteDisplayTime: resolveDisplayTime(satellitePlayback),
  };
};
