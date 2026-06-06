import { act, renderHook, waitFor } from '@testing-library/react';
import {
  disableNetwork,
  enableNetwork,
  waitForPendingWrites,
} from 'firebase/firestore';
import { useFirestoreSleepRecovery } from './useFirestoreSleepRecovery';

jest.mock('firebase/firestore', () => ({
  disableNetwork: jest.fn(() => Promise.resolve()),
  enableNetwork: jest.fn(() => Promise.resolve()),
  waitForPendingWrites: jest.fn(() => Promise.resolve()),
}));

let mockDb: { name: string } | null = { name: 'mock-db' };

jest.mock('../lib/firebase', () => ({
  get db() {
    return mockDb;
  },
}));

describe('useFirestoreSleepRecovery', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useRealTimers();
    mockDb = { name: 'mock-db' };
    Object.defineProperty(document, 'hidden', { configurable: true, value: false });
  });

  it('disables Firestore network when the tab is hidden', async () => {
    renderHook(() => useFirestoreSleepRecovery());

    await waitFor(() => {
      expect(enableNetwork).toHaveBeenCalledWith({ name: 'mock-db' });
    });

    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    document.dispatchEvent(new Event('visibilitychange'));

    await waitFor(() => {
      expect(disableNetwork).toHaveBeenCalledWith({ name: 'mock-db' });
    });
  });

  it('re-enables Firestore network when the tab becomes visible', async () => {
    renderHook(() => useFirestoreSleepRecovery());

    await waitFor(() => {
      expect(enableNetwork).toHaveBeenCalledWith({ name: 'mock-db' });
    });

    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    document.dispatchEvent(new Event('visibilitychange'));

    await waitFor(() => {
      expect(disableNetwork).toHaveBeenCalledWith({ name: 'mock-db' });
    });

    Object.defineProperty(document, 'hidden', { configurable: true, value: false });
    document.dispatchEvent(new Event('visibilitychange'));

    await waitFor(() => {
      expect(enableNetwork).toHaveBeenCalledWith({ name: 'mock-db' });
    });
  });

  it('disables Firestore network on mount when the tab is already hidden', async () => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });

    renderHook(() => useFirestoreSleepRecovery());

    await waitFor(() => {
      expect(disableNetwork).toHaveBeenCalledWith({ name: 'mock-db' });
      expect(enableNetwork).not.toHaveBeenCalled();
    });
  });

  it('does nothing when Firestore is not configured', async () => {
    mockDb = null;

    renderHook(() => useFirestoreSleepRecovery());

    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    document.dispatchEvent(new Event('visibilitychange'));

    await waitFor(() => {
      expect(disableNetwork).not.toHaveBeenCalled();
      expect(enableNetwork).not.toHaveBeenCalled();
    });
  });

  it('recovers if the tab becomes visible while pending writes are flushing', async () => {
    let resolvePendingWrites: (() => void) | undefined;
    (waitForPendingWrites as jest.Mock).mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolvePendingWrites = resolve;
        }),
    );

    renderHook(() => useFirestoreSleepRecovery());

    await waitFor(() => {
      expect(enableNetwork).toHaveBeenCalledWith({ name: 'mock-db' });
    });

    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    document.dispatchEvent(new Event('visibilitychange'));

    await waitFor(() => {
      expect(waitForPendingWrites).toHaveBeenCalledWith({ name: 'mock-db' });
    });

    Object.defineProperty(document, 'hidden', { configurable: true, value: false });
    document.dispatchEvent(new Event('visibilitychange'));

    resolvePendingWrites?.();

    await waitFor(() => {
      expect(enableNetwork).toHaveBeenCalledWith({ name: 'mock-db' });
    });

    expect(disableNetwork).not.toHaveBeenCalled();
  });

  it('times out pending writes and disables the network while hidden', async () => {
    jest.useFakeTimers();
    (waitForPendingWrites as jest.Mock).mockImplementation(
      () => new Promise<void>(() => {}),
    );

    renderHook(() => useFirestoreSleepRecovery());

    await waitFor(() => {
      expect(enableNetwork).toHaveBeenCalledWith({ name: 'mock-db' });
    });

    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    document.dispatchEvent(new Event('visibilitychange'));

    await act(async () => {
      await jest.advanceTimersByTimeAsync(5_000);
    });

    await waitFor(() => {
      expect(disableNetwork).toHaveBeenCalledWith({ name: 'mock-db' });
    });
  });

  it('stops pending transitions after unmount', async () => {
    jest.useFakeTimers();
    (waitForPendingWrites as jest.Mock).mockImplementation(
      () => new Promise<void>(() => {}),
    );

    const { unmount } = renderHook(() => useFirestoreSleepRecovery());

    await waitFor(() => {
      expect(enableNetwork).toHaveBeenCalledWith({ name: 'mock-db' });
    });

    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    document.dispatchEvent(new Event('visibilitychange'));
    unmount();

    await act(async () => {
      await jest.advanceTimersByTimeAsync(5_000);
    });

    expect(disableNetwork).not.toHaveBeenCalled();
    expect(enableNetwork).toHaveBeenCalledTimes(1);
  });
});
