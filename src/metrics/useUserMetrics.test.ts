import { act, renderHook, waitFor } from '@testing-library/react';
import { doc, getDoc } from 'firebase/firestore';
import { useAuth } from '../auth/AuthProvider';
import { useUserMetrics } from './useUserMetrics';

jest.mock('firebase/firestore', () => ({
  doc: jest.fn(() => ({ path: 'userMetrics/user-1' })),
  getDoc: jest.fn(),
}));

jest.mock('../lib/firebase', () => ({
  db: { app: 'mock-db' },
  isHostedAuthEnabled: true,
}));

jest.mock('../auth/AuthProvider', () => ({
  useAuth: jest.fn(),
}));

const mockDoc = doc as jest.MockedFunction<typeof doc>;
const mockGetDoc = getDoc as jest.MockedFunction<typeof getDoc>;
const mockUseAuth = useAuth as jest.MockedFunction<typeof useAuth>;

describe('useUserMetrics', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseAuth.mockReturnValue({ user: { uid: 'user-1' }, status: 'authenticated' } as ReturnType<typeof useAuth>);
  });

  it('loads and normalizes metrics for the signed-in user', async () => {
    const updatedAt = new Date('2026-04-24T12:00:00.000Z');
    mockGetDoc.mockResolvedValue({
      data: () => ({
        uid: 'user-1',
        activeDayStreak: 3,
        totalActiveDays: 10,
        cyclesCreated: 4,
        cloudCyclesSaved: 2,
        discussionsWritten: 5,
        verificationSessionsRun: 6,
        lastActiveDate: '2026-04-24',
        updatedAt: { toDate: () => updatedAt },
      }),
    } as never);

    const { result } = renderHook(() => useUserMetrics());

    expect(result.current.loading).toBe(true);

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(mockDoc).toHaveBeenCalledWith({ app: 'mock-db' }, 'userMetrics', 'user-1');
    expect(result.current.metrics).toEqual({
      uid: 'user-1',
      activeDayStreak: 3,
      totalActiveDays: 10,
      cyclesCreated: 4,
      cloudCyclesSaved: 2,
      discussionsWritten: 5,
      verificationSessionsRun: 6,
      lastActiveDate: '2026-04-24',
      updatedAt,
    });
    expect(result.current.error).toBeNull();
  });

  it('defaults malformed or missing metric fields', async () => {
    mockGetDoc.mockResolvedValue({
      data: () => ({
        uid: 123,
        activeDayStreak: 'bad',
        lastActiveDate: null,
        updatedAt: null,
      }),
    } as never);

    const { result } = renderHook(() => useUserMetrics());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.metrics).toMatchObject({
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
  });

  it('returns defaults while auth is loading or signed out', () => {
    mockUseAuth.mockReturnValue({ user: null, status: 'loading' } as ReturnType<typeof useAuth>);
    const { result, rerender } = renderHook(() => useUserMetrics());

    expect(result.current.loading).toBe(true);
    expect(mockGetDoc).not.toHaveBeenCalled();

    mockUseAuth.mockReturnValue({ user: null, status: 'unauthenticated' } as ReturnType<typeof useAuth>);
    rerender();

    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.metrics.uid).toBe('');
  });

  it('reports fetch errors and ignores stale requests', async () => {
    let resolveFirst: (value: unknown) => void = () => undefined;
    mockGetDoc
      .mockReturnValueOnce(new Promise((resolve) => {
        resolveFirst = resolve;
      }) as never)
      .mockRejectedValueOnce(new Error('permission denied'));

    const { result, rerender } = renderHook(() => useUserMetrics());

    mockUseAuth.mockReturnValue({ user: { uid: 'user-2' }, status: 'authenticated' } as ReturnType<typeof useAuth>);
    rerender();

    await waitFor(() => expect(result.current.error).toBe('permission denied'));

    await act(async () => {
      resolveFirst({ data: () => ({ uid: 'user-1', activeDayStreak: 99 }) });
      await Promise.resolve();
    });

    expect(result.current.error).toBe('permission denied');
    expect(result.current.metrics.uid).toBe('');
  });
});
