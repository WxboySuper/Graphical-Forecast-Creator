import { renderHook } from '@testing-library/react';
import { useMonitorNwsAlertsFrameSync } from './useMonitorNwsAlertsFrameSync';

interface SyncProps {
  enabled: boolean;
  animationEnabled: boolean;
  rawFrameCount: number;
  latestSnapshotKey?: string | null;
}

const renderSyncHook = (initialProps: SyncProps) => {
  const setFrameIndex = jest.fn();
  const utils = renderHook(
    (props: SyncProps) => useMonitorNwsAlertsFrameSync(
      props.enabled,
      props.animationEnabled,
      props.rawFrameCount,
      setFrameIndex,
      props.latestSnapshotKey,
    ),
    { initialProps },
  );
  return { ...utils, setFrameIndex };
};

describe('useMonitorNwsAlertsFrameSync', () => {
  test('jumps to the latest frame when the frame count grows', () => {
    const { setFrameIndex } = renderSyncHook({
      enabled: true,
      animationEnabled: true,
      rawFrameCount: 3,
      latestSnapshotKey: '3:key-a',
    });

    expect(setFrameIndex).toHaveBeenCalledWith(2);
  });

  test('jumps to the latest frame when a new snapshot arrives after the window is full', () => {
    const { rerender, setFrameIndex } = renderSyncHook({
      enabled: true,
      animationEnabled: true,
      rawFrameCount: 12,
      latestSnapshotKey: '12:key-a',
    });

    expect(setFrameIndex).toHaveBeenCalledWith(11);
    setFrameIndex.mockClear();

    rerender({
      enabled: true,
      animationEnabled: true,
      rawFrameCount: 12,
      latestSnapshotKey: '12:key-b',
    });

    expect(setFrameIndex).toHaveBeenCalledWith(11);
  });

  test('does not move the frame index when the latest snapshot is unchanged', () => {
    const { rerender, setFrameIndex } = renderSyncHook({
      enabled: true,
      animationEnabled: true,
      rawFrameCount: 12,
      latestSnapshotKey: '12:key-a',
    });

    expect(setFrameIndex).toHaveBeenCalledTimes(1);
    setFrameIndex.mockClear();

    rerender({
      enabled: true,
      animationEnabled: true,
      rawFrameCount: 12,
      latestSnapshotKey: '12:key-a',
    });

    expect(setFrameIndex).not.toHaveBeenCalled();
  });

  test('does nothing while disabled', () => {
    const { setFrameIndex } = renderSyncHook({
      enabled: false,
      animationEnabled: true,
      rawFrameCount: 12,
      latestSnapshotKey: '12:key-a',
    });

    expect(setFrameIndex).not.toHaveBeenCalled();
  });
});
