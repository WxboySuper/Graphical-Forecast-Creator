import { renderHook } from '@testing-library/react';
import { disableNetwork, enableNetwork } from 'firebase/firestore';

jest.mock('firebase/firestore', () => ({
  disableNetwork: jest.fn(() => Promise.resolve()),
  enableNetwork: jest.fn(() => Promise.resolve()),
}));

jest.mock('../lib/firebase', () => ({
  db: { name: 'mock-db' },
}));

describe('useFirestoreSleepRecovery', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Object.defineProperty(document, 'hidden', { configurable: true, value: false });
  });

  it('disables Firestore network when the tab is hidden', () => {
    const { useFirestoreSleepRecovery } = require('./useFirestoreSleepRecovery');
    renderHook(() => useFirestoreSleepRecovery());

    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    document.dispatchEvent(new Event('visibilitychange'));

    expect(disableNetwork).toHaveBeenCalledWith({ name: 'mock-db' });
    expect(enableNetwork).not.toHaveBeenCalled();
  });

  it('re-enables Firestore network when the tab becomes visible', () => {
    const { useFirestoreSleepRecovery } = require('./useFirestoreSleepRecovery');
    renderHook(() => useFirestoreSleepRecovery());

    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    document.dispatchEvent(new Event('visibilitychange'));
    Object.defineProperty(document, 'hidden', { configurable: true, value: false });
    document.dispatchEvent(new Event('visibilitychange'));

    expect(enableNetwork).toHaveBeenCalledWith({ name: 'mock-db' });
  });
});
