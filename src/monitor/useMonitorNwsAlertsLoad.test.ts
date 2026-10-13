import { act, renderHook } from '@testing-library/react';
import type { Dispatch, RefObject, SetStateAction } from 'react';
import * as nwsAlerts from './nwsAlerts';
import type { NwsAlertFeatureCollection } from './nwsAlerts';
import { useMonitorNwsAlerts } from './useMonitorNwsAlerts';
import { useMonitorNwsAlertsLoad } from './useMonitorNwsAlertsLoad';

describe('useMonitorNwsAlertsLoad', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test.each([
    {
      hasExistingFrames: true,
      error: 'NWS alert refresh failed. Previous alert data is retained, may be outdated, and still follows current filters.',
      toast: 'NWS alert refresh failed. Previous alert data is retained, may be outdated, and still follows current filters.',
    },
    {
      hasExistingFrames: false,
      error: 'Official alerts are unavailable right now.',
      toast: 'NWS watch/warning polygons could not be loaded.',
    },
  ])('preserves frames and gives the correct error when a load fails ($hasExistingFrames)', async ({
    hasExistingFrames,
    error,
    toast,
  }) => {
    jest.spyOn(nwsAlerts, 'fetchActiveNwsAlerts').mockRejectedValue(new Error('offline'));

    const existingFrames = hasExistingFrames
      ? [{ type: 'FeatureCollection', features: [] }] as NwsAlertFeatureCollection[]
      : [];
    let currentFrames = existingFrames;
    const setRawFrames: Dispatch<SetStateAction<NwsAlertFeatureCollection[]>> = (action) => {
      currentFrames = typeof action === 'function' ? action(currentFrames) : action;
    };
    const setters = {
      addToast: jest.fn(),
      hasExistingFrames: { current: hasExistingFrames } as RefObject<boolean>,
      setRawFrames: jest.fn(setRawFrames),
      setFrameIndex: jest.fn(),
      setLoading: jest.fn(),
      setError: jest.fn(),
      setFetchedAt: jest.fn(),
    };

    renderHook(() => useMonitorNwsAlertsLoad({
      enabled: true,
      refreshToken: 1,
      ...setters,
    }));
    await act(async () => undefined);

    expect(currentFrames).toBe(existingFrames);
    expect(setters.setRawFrames).not.toHaveBeenCalled();
    expect(setters.setError).toHaveBeenCalledWith(error);
    expect(setters.addToast).toHaveBeenCalledWith(toast, 'warning');
  });

  test('uses committed frames to classify a failed manual refresh', async () => {
    const fetch = jest.spyOn(nwsAlerts, 'fetchActiveNwsAlerts');
    fetch.mockResolvedValueOnce({ type: 'FeatureCollection', features: [] });
    fetch.mockRejectedValueOnce(new Error('offline'));
    const addToast = jest.fn();
    const { result, rerender } = renderHook(
      ({ refreshToken }) => useMonitorNwsAlerts({
        enabled: true,
        showWatches: true,
        showWarnings: true,
        showAdvisories: true,
        animationEnabled: false,
        animationSpeedMs: 1000,
        refreshToken,
        addToast,
      }),
      { initialProps: { refreshToken: 0 } },
    );

    await act(async () => undefined);
    rerender({ refreshToken: 1 });
    await act(async () => undefined);

    expect(result.current.error).toBe(
      'NWS alert refresh failed. Previous alert data is retained, may be outdated, and still follows current filters.',
    );
  });
});
