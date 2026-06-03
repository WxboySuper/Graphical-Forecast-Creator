import { act, renderHook, waitFor } from '@testing-library/react';
import { useLiveWmsLayers } from './useLiveWmsLayers';
import * as wms from './wms';

const radarConfig = {
  url: 'https://opengeo.ncep.noaa.gov/geoserver/conus/conus_bref_qcd/ows',
  layer: 'conus_bref_qcd',
};

const satelliteConfig = {
  url: 'https://nowcoast.noaa.gov/geoserver/observations/satellite/ows',
  layer: 'goes_visible_imagery',
};

const addToast = jest.fn();

describe('useLiveWmsLayers', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.spyOn(wms, 'fetchLayerTimeValues').mockImplementation(async (config) => {
      if (config.layer === radarConfig.layer) {
        return ['2026-04-28T17:40:20Z', '2026-04-28T17:46:20Z'];
      }

      return ['2026-04-28T18:00:00Z', '2026-04-28T18:05:00Z'];
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  test('shows the latest frame when animation is disabled', async () => {
    const { result } = renderHook(() => useLiveWmsLayers({
      radarConfig,
      satelliteConfig,
      animationEnabled: false,
      animationSpeedMs: 500,
      refreshToken: 0,
      addToast,
    }));

    await waitFor(() => {
      expect(result.current.radarDisplayTime).toBe('2026-04-28T17:46:20Z');
      expect(result.current.satelliteDisplayTime).toBe('2026-04-28T18:05:00Z');
    });
  });

  test('advances frames on an interval when animation is enabled', async () => {
    const { result } = renderHook(() => useLiveWmsLayers({
      radarConfig,
      satelliteConfig,
      animationEnabled: true,
      animationSpeedMs: 500,
      refreshToken: 0,
      addToast,
    }));

    await waitFor(() => {
      expect(result.current.radarDisplayTime).toBe('2026-04-28T17:46:20Z');
    });

    act(() => {
      jest.advanceTimersByTime(500);
    });

    await waitFor(() => {
      expect(result.current.radarDisplayTime).toBe('2026-04-28T17:40:20Z');
    });
  });
});
