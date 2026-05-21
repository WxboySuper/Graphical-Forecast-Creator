import { useEffect, useState } from 'react';
import type { AddToastFn } from '../components/Layout';
import * as wms from './wms';
import type { WmsLayerConfig } from './wms';

interface UseLiveWmsLayersArgs {
  radarConfig: WmsLayerConfig | null;
  satelliteConfig: WmsLayerConfig | null;
  animationEnabled: boolean;
  animationSpeedMs: number;
  refreshToken: number;
  addToast: AddToastFn;
}

interface LayerPlaybackState {
  frameTimes: string[];
  frameIndex: number;
}

const emptyPlayback = (): LayerPlaybackState => ({
  frameTimes: [],
  frameIndex: 0,
});

const resolveDisplayTime = (playback: LayerPlaybackState): string | undefined => {
  if (playback.frameTimes.length === 0) {
    return undefined;
  }

  return playback.frameTimes[playback.frameIndex];
};

const snapToLatestFrame = (current: LayerPlaybackState): LayerPlaybackState => {
  if (current.frameTimes.length === 0) {
    return current;
  }

  const frameIndex = current.frameTimes.length - 1;
  return current.frameIndex === frameIndex ? current : { ...current, frameIndex };
};

const configKey = (config: WmsLayerConfig | null): string =>
  config ? `${config.url}::${config.layer}` : 'off';

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
  const radarConfigKey = configKey(radarConfig);
  const satelliteConfigKey = configKey(satelliteConfig);

  useEffect(() => {
    let active = true;
    setRadarPlayback(emptyPlayback());

    if (!radarConfig) {
      return;
    }

    wms.fetchLayerTimeValues(radarConfig)
      .then((timeValues) => {
        if (!active) {
          return;
        }

        const frameTimes = wms.selectAnimationFrameTimes(timeValues);
        setRadarPlayback({
          frameTimes,
          frameIndex: Math.max(0, frameTimes.length - 1),
        });
      })
      .catch(() => {
        if (active) {
          addToast('Radar capabilities are unavailable right now.', 'warning');
        }
      });

    return () => {
      active = false;
    };
  }, [addToast, radarConfig, radarConfigKey, refreshToken]);

  useEffect(() => {
    let active = true;
    setSatellitePlayback(emptyPlayback());

    if (!satelliteConfig) {
      return;
    }

    wms.fetchLayerTimeValues(satelliteConfig)
      .then((timeValues) => {
        if (!active) {
          return;
        }

        const frameTimes = wms.selectAnimationFrameTimes(timeValues);
        setSatellitePlayback({
          frameTimes,
          frameIndex: Math.max(0, frameTimes.length - 1),
        });
      })
      .catch(() => {
        if (active) {
          addToast('Satellite capabilities are unavailable right now.', 'warning');
        }
      });

    return () => {
      active = false;
    };
  }, [addToast, refreshToken, satelliteConfig, satelliteConfigKey]);

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
      setRadarPlayback((current) => {
        if (current.frameTimes.length < 2) {
          return current;
        }

        return {
          ...current,
          frameIndex: (current.frameIndex + 1) % current.frameTimes.length,
        };
      });

      setSatellitePlayback((current) => {
        if (current.frameTimes.length < 2) {
          return current;
        }

        return {
          ...current,
          frameIndex: (current.frameIndex + 1) % current.frameTimes.length,
        };
      });
    }, animationSpeedMs);

    return () => window.clearInterval(intervalId);
  }, [animationSpeedMs, frameSignature, shouldAnimate]);

  return {
    radarDisplayTime: resolveDisplayTime(radarPlayback),
    satelliteDisplayTime: resolveDisplayTime(satellitePlayback),
  };
};
