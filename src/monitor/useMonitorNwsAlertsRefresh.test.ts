import { act, renderHook } from '@testing-library/react';
import * as nwsAlerts from './nwsAlerts';
import { useMonitorNwsAlertsRefresh } from './useMonitorNwsAlertsRefresh';

const collection = {
  type: 'FeatureCollection' as const,
  features: [],
};

describe('useMonitorNwsAlertsRefresh', () => {
  beforeEach(() => jest.useFakeTimers());

  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  test('does not overlap a slow refresh request', async () => {
    let resolveRequest: ((value: typeof collection) => void) | undefined;
    const fetchSpy = jest.spyOn(nwsAlerts, 'fetchActiveNwsAlerts').mockImplementation(
      () => new Promise((resolve) => { resolveRequest = resolve; }),
    );
    const setRawFrames = jest.fn();
    const setFetchedAt = jest.fn();

    renderHook(() => useMonitorNwsAlertsRefresh({
      enabled: true,
      animationEnabled: true,
      animationSpeedMs: 1_000,
      setRawFrames,
      setFetchedAt,
    }));

    act(() => jest.advanceTimersByTime(15_000));
    act(() => jest.advanceTimersByTime(15_000));
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveRequest?.(collection);
    });
    expect(setRawFrames).toHaveBeenCalledTimes(1);

    act(() => jest.advanceTimersByTime(15_000));
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  test('ignores a refresh that resolves after the hook is disabled', async () => {
    let resolveRequest: ((value: typeof collection) => void) | undefined;
    jest.spyOn(nwsAlerts, 'fetchActiveNwsAlerts').mockImplementation(
      () => new Promise((resolve) => { resolveRequest = resolve; }),
    );
    const setRawFrames = jest.fn();
    const setFetchedAt = jest.fn();
    const { rerender } = renderHook(
      (enabled: boolean) => useMonitorNwsAlertsRefresh({
        enabled,
        animationEnabled: true,
        animationSpeedMs: 1_000,
        setRawFrames,
        setFetchedAt,
      }),
      { initialProps: true },
    );

    act(() => jest.advanceTimersByTime(15_000));
    rerender(false);
    await act(async () => {
      resolveRequest?.(collection);
    });

    expect(setRawFrames).not.toHaveBeenCalled();
    expect(setFetchedAt).not.toHaveBeenCalled();
  });
  test('surfaces a polling failure instead of swallowing it', async () => {
    jest.spyOn(nwsAlerts, 'fetchActiveNwsAlerts').mockRejectedValue(new Error('offline'));
    const setRawFrames = jest.fn();
    const setFetchedAt = jest.fn();
    const onError = jest.fn();

    renderHook(() => useMonitorNwsAlertsRefresh({
      enabled: true,
      animationEnabled: true,
      animationSpeedMs: 1_000,
      setRawFrames,
      setFetchedAt,
      onError,
    }));

    await act(async () => {
      jest.advanceTimersByTime(15_000);
    });

    expect(setRawFrames).not.toHaveBeenCalled();
    expect(setFetchedAt).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith('NWS alert refresh failed; showing last available data.');
  });

  test('clears a previous polling failure once a refresh succeeds', async () => {
    let rejectRequest: ((reason: unknown) => void) | undefined;
    let resolveRequest: ((value: typeof collection) => void) | undefined;
    const fetchSpy = jest.spyOn(nwsAlerts, 'fetchActiveNwsAlerts')
      .mockImplementationOnce(() => new Promise((_, reject) => { rejectRequest = reject; }))
      .mockImplementation(() => new Promise((resolve) => { resolveRequest = resolve; }));
    const onError = jest.fn();

    renderHook(() => useMonitorNwsAlertsRefresh({
      enabled: true,
      animationEnabled: true,
      animationSpeedMs: 1_000,
      setRawFrames: jest.fn(),
      setFetchedAt: jest.fn(),
      onError,
    }));

    await act(async () => {
      jest.advanceTimersByTime(15_000);
      rejectRequest?.(new Error('offline'));
    });
    expect(onError).toHaveBeenCalledWith('NWS alert refresh failed; showing last available data.');

    await act(async () => {
      jest.advanceTimersByTime(15_000);
      resolveRequest?.(collection);
    });
    expect(onError).toHaveBeenLastCalledWith(null);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });
});
