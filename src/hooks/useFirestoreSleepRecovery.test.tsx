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

const firestoreDb = { name: 'mock-db' };

const renderRecoveryHook = () => renderHook(() => useFirestoreSleepRecovery());

const waitForInitialEnable = async () => {
  await waitFor(() => {
    expect(enableNetwork).toHaveBeenCalledWith(firestoreDb);
  });
};

const setHidden = (hidden: boolean) => {
  Object.defineProperty(document, 'hidden', { configurable: true, value: hidden });
  document.dispatchEvent(new Event('visibilitychange'));
};

describe('useFirestoreSleepRecovery', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useRealTimers();
    mockDb = firestoreDb;
    setHidden(false);
  });

  it('disables Firestore network when the tab is hidden', async () => {
    renderRecoveryHook();
    await waitForInitialEnable();

    setHidden(true);

    await waitFor(() => {
      expect(disableNetwork).toHaveBeenCalledWith(firestoreDb);
    });
  });

  it('re-enables Firestore network when the tab becomes visible', async () => {
    renderRecoveryHook();
    await waitForInitialEnable();

    setHidden(true);

    await waitFor(() => {
      expect(disableNetwork).toHaveBeenCalledWith(firestoreDb);
    });

    setHidden(false);

    await waitFor(() => {
      expect(enableNetwork).toHaveBeenCalledWith(firestoreDb);
    });
  });

  it('disables Firestore network on mount when the tab is already hidden', async () => {
    setHidden(true);

    renderRecoveryHook();

    await waitFor(() => {
      expect(disableNetwork).toHaveBeenCalledWith(firestoreDb);
      expect(enableNetwork).not.toHaveBeenCalled();
    });
  });

  it('does nothing when Firestore is not configured', async () => {
    mockDb = null;

    renderRecoveryHook();

    setHidden(true);

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

    renderRecoveryHook();
    await waitForInitialEnable();

    setHidden(true);

    await waitFor(() => {
      expect(waitForPendingWrites).toHaveBeenCalledWith(firestoreDb);
    });

    setHidden(false);
    resolvePendingWrites?.();

    await waitFor(() => {
      expect(enableNetwork).toHaveBeenCalledWith(firestoreDb);
    });

    expect(disableNetwork).not.toHaveBeenCalled();
  });

  it('times out pending writes and disables the network while hidden', async () => {
    jest.useFakeTimers();
    (waitForPendingWrites as jest.Mock).mockImplementation(
      () => new Promise<void>(() => {}),
    );

    renderRecoveryHook();
    await waitForInitialEnable();

    setHidden(true);

    await act(async () => {
      await jest.advanceTimersByTimeAsync(5_000);
    });

    await waitFor(() => {
      expect(disableNetwork).toHaveBeenCalledWith(firestoreDb);
    });
  });

  it('stops pending transitions after unmount', async () => {
    jest.useFakeTimers();
    (waitForPendingWrites as jest.Mock).mockImplementation(
      () => new Promise<void>(() => {}),
    );

    const { unmount } = renderRecoveryHook();
    await waitForInitialEnable();

    setHidden(true);
    unmount();

    await act(async () => {
      await jest.advanceTimersByTimeAsync(5_000);
    });

    expect(disableNetwork).not.toHaveBeenCalled();
    expect(enableNetwork).toHaveBeenCalledTimes(1);
  });
});
