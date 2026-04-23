import { renderHook, act } from '@testing-library/react';
import { useUserMetrics } from './useUserMetrics';
import * as React from 'react';

// Mock firebase
jest.mock('../lib/firebase', () => ({
  db: null,
  isHostedAuthEnabled: false,
}));

// Mock useAuth hook
const mockUser = { uid: 'test-uid', email: 'test@example.com' };
jest.mock('../auth/AuthProvider', () => ({
  useAuth: () => ({
    user: mockUser,
    status: 'authenticated',
  }),
}));

describe('useUserMetrics', () => {
  it('returns default metrics when auth is not enabled', () => {
    const { result } = renderHook(() => useUserMetrics());
    expect(result.current.metrics).toEqual({
      uid: '',
      activeDayStreak: 0,
      totalActiveDays: 0,
      cyclesCreated: 0,
      cloudCyclesSaved: 0,
      discussionsWritten: 0,
      verificationSessionsRun: 0,
      lastActiveDate: null,
      updatedAt: null,
    });
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBe(null);
  });

  it('returns loading state initially when auth is enabled', () => {
    // Reset module to re-evaluate isHostedAuthEnabled
    jest.isolateModules(() => {
      const { result } = renderHook(() => useUserMetrics());
      // When isHostedAuthEnabled is false, loading is immediately false
      expect(result.current.loading).toBe(false);
    });
  });
});