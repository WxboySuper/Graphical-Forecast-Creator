import { act, renderHook } from '@testing-library/react';
import type { Dispatch, SetStateAction } from 'react';
import * as nwsAlerts from './nwsAlerts';
import type { NwsAlertFeatureCollection } from './nwsAlerts';
import { useMonitorNwsAlertsLoad } from './useMonitorNwsAlertsLoad';

describe('useMonitorNwsAlertsLoad', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('keeps existing animation frames when a manual refresh fails', async () => {
    jest.spyOn(nwsAlerts, 'fetchActiveNwsAlerts').mockRejectedValue(new Error('offline'));

    const existingFrames = [{ type: 'FeatureCollection', features: [] }] as NwsAlertFeatureCollection[];
    let currentFrames = existingFrames;
    const setRawFrames: Dispatch<SetStateAction<NwsAlertFeatureCollection[]>> = (action) => {
      currentFrames = typeof action === 'function' ? action(currentFrames) : action;
    };
    const setters = {
      addToast: jest.fn(),
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
    expect(setters.setError).toHaveBeenCalledWith('Official alerts are unavailable right now.');
    expect(setters.addToast).toHaveBeenCalledWith('NWS watch/warning polygons could not be loaded.', 'warning');
  });
});
