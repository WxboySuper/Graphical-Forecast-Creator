import { renderHook } from '@testing-library/react';
import type { NwsAlertFeatureCollection } from './nwsAlerts';
import { useMonitorNwsAlertsFrameSync } from './useMonitorNwsAlertsFrameSync';

const snapshot = (): NwsAlertFeatureCollection => ({
  type: 'FeatureCollection',
  features: [],
});

interface FrameSyncProps {
  enabled: boolean;
  animationEnabled: boolean;
  rawFrameCount: number;
  latestFrame: NwsAlertFeatureCollection | null;
  setFrameIndex: jest.Mock;
}

const renderFrameSync = (initialProps: FrameSyncProps) => renderHook(
  (props: FrameSyncProps) => useMonitorNwsAlertsFrameSync({
    enabled: props.enabled,
    animationEnabled: props.animationEnabled,
    rawFrameCount: props.rawFrameCount,
    latestFrame: props.latestFrame,
    setFrameIndex: props.setFrameIndex,
  }),
  { initialProps },
);

describe('useMonitorNwsAlertsFrameSync', () => {
  test('jumps to the newest frame while the frame window is still growing', () => {
    const setFrameIndex = jest.fn();
    const firstFrame = snapshot();
    const secondFrame = snapshot();
    const { rerender } = renderFrameSync({
      enabled: true,
      animationEnabled: true,
      rawFrameCount: 1,
      latestFrame: firstFrame,
      setFrameIndex,
    });

    expect(setFrameIndex).toHaveBeenLastCalledWith(0);

    rerender({
      enabled: true,
      animationEnabled: true,
      rawFrameCount: 2,
      latestFrame: secondFrame,
      setFrameIndex,
    });

    expect(setFrameIndex).toHaveBeenLastCalledWith(1);
  });

  test('keeps following new snapshots once the frame window is full', () => {
    const setFrameIndex = jest.fn();
    const fullWindow = Array.from({ length: 12 }, snapshot);
    const { rerender } = renderFrameSync({
      enabled: true,
      animationEnabled: true,
      rawFrameCount: fullWindow.length,
      latestFrame: fullWindow[fullWindow.length - 1],
      setFrameIndex,
    });

    expect(setFrameIndex).toHaveBeenLastCalledWith(11);

    // Appending past the cap trims the oldest frame, so the count stays at 12
    // while the newest snapshot changes.
    rerender({
      enabled: true,
      animationEnabled: true,
      rawFrameCount: fullWindow.length,
      latestFrame: snapshot(),
      setFrameIndex,
    });

    expect(setFrameIndex).toHaveBeenCalledTimes(2);
    expect(setFrameIndex).toHaveBeenLastCalledWith(11);
  });

  test('does not move the frame when the newest snapshot is unchanged', () => {
    const setFrameIndex = jest.fn();
    const latestFrame = snapshot();
    const { rerender } = renderFrameSync({
      enabled: true,
      animationEnabled: true,
      rawFrameCount: 3,
      latestFrame,
      setFrameIndex,
    });
    setFrameIndex.mockClear();

    rerender({
      enabled: true,
      animationEnabled: true,
      rawFrameCount: 3,
      latestFrame,
      setFrameIndex,
    });

    expect(setFrameIndex).not.toHaveBeenCalled();
  });

  test('leaves the frame alone while alert animation is off', () => {
    const setFrameIndex = jest.fn();
    const { rerender } = renderFrameSync({
      enabled: true,
      animationEnabled: false,
      rawFrameCount: 1,
      latestFrame: snapshot(),
      setFrameIndex,
    });

    rerender({
      enabled: true,
      animationEnabled: false,
      rawFrameCount: 2,
      latestFrame: snapshot(),
      setFrameIndex,
    });

    expect(setFrameIndex).not.toHaveBeenCalled();
  });
});
