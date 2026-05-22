import { renderHook } from '@testing-library/react';
import { disableNetwork, enableNetwork } from 'firebase/firestore';
import { useFirestoreSleepRecovery } from './useFirestoreSleepRecovery';

jest.mock('firebase/firestore', () => ({
  disableNetwork: jest.fn(() => Promise.resolve()),
  enableNetwork: jest.fn(() => Promise.resolve()),
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
    mockDb = { name: 'mock-db' };
    Object.defineProperty(document, 'hidden', { configurable: true, value: false });
  });

  it('disables Firestore network when the tab is hidden', () => {
    renderHook(() => useFirestoreSleepRecovery());

    expect(enableNetwork).toHaveBeenCalledWith({ name: 'mock-db' });

    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    document.dispatchEvent(new Event('visibilitychange'));

    expect(disableNetwork).toHaveBeenCalledWith({ name: 'mock-db' });
  });

  it('re-enables Firestore network when the tab becomes visible', () => {
    renderHook(() => useFirestoreSleepRecovery());

    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    document.dispatchEvent(new Event('visibilitychange'));
    Object.defineProperty(document, 'hidden', { configurable: true, value: false });
    document.dispatchEvent(new Event('visibilitychange'));

    expect(disableNetwork).toHaveBeenCalledWith({ name: 'mock-db' });
    expect(enableNetwork).toHaveBeenCalledWith({ name: 'mock-db' });
  });

  it('disables Firestore network on mount when the tab is already hidden', () => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });

    renderHook(() => useFirestoreSleepRecovery());

    expect(disableNetwork).toHaveBeenCalledWith({ name: 'mock-db' });
    expect(enableNetwork).not.toHaveBeenCalled();
  });

  it('does nothing when Firestore is not configured', () => {
    mockDb = null;

    renderHook(() => useFirestoreSleepRecovery());

    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    document.dispatchEvent(new Event('visibilitychange'));

    expect(disableNetwork).not.toHaveBeenCalled();
    expect(enableNetwork).not.toHaveBeenCalled();
  });
});
