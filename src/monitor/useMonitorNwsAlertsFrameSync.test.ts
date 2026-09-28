import { renderHook } from '@testing-library/react';
import { useMonitorNwsAlertsFrameSync } from './useMonitorNwsAlertsFrameSync';
import type { NwsAlertFeatureCollection } from './nwsAlerts';

const makeCollection = (id: string): NwsAlertFeatureCollection => ({
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature' as const,
      id,
      properties: { updated: `2026-08-13T00:00:00Z:${id}` },
      geometry: null,
    },
  ],
} as unknown as NwsAlertFeatureCollection);

describe('useMonitorNwsAlertsFrameSync', () => {
  test('jumps to latest when a distinct snapshot arrives after the window is full', () => {
    const setFrameIndex = jest.fn();
    const fullWindow = Array.from({ length: 12 }, (_, index) => makeCollection(`alert-${index}`));
    const { rerender } = renderHook(
      ({ frames }: { frames: readonly NwsAlertFeatureCollection[] }) =>
        useMonitorNwsAlertsFrameSync(true, true, frames, setFrameIndex),
      { initialProps: { frames: fullWindow } },
    );

    expect(setFrameIndex).toHaveBeenCalledWith(11);
    setFrameIndex.mockClear();

    // Same reference means no new snapshot: do not jump again.
    rerender({ frames: fullWindow });
    expect(setFrameIndex).not.toHaveBeenCalled();

    // New distinct snapshot with the same capped length must still jump to latest.
    const nextWindow = [...fullWindow.slice(1), makeCollection('alert-new')];
    expect(nextWindow).toHaveLength(12);
    rerender({ frames: nextWindow });
    expect(setFrameIndex).toHaveBeenCalledWith(11);
  });

  test('does nothing while disabled', () => {
    const setFrameIndex = jest.fn();
    renderHook(() =>
      useMonitorNwsAlertsFrameSync(false, true, [makeCollection('alert-1')], setFrameIndex),
    );

    expect(setFrameIndex).not.toHaveBeenCalled();
  });
});
