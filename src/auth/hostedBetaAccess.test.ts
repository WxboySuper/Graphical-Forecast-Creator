import type { User } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { requireDb } from '../lib/firebase';
import { refreshHostedBetaAccess } from './hostedBetaAccess';

const mockDb = {};
const mockFirebaseState = {
  db: mockDb as object | null,
  isHostedAuthEnabled: true,
};

jest.mock('../lib/firebase', () => ({
  get db() {
    return mockFirebaseState.db;
  },
  get isHostedAuthEnabled() {
    return mockFirebaseState.isHostedAuthEnabled;
  },
  requireDb: jest.fn(() => mockFirebaseState.db),
}));

jest.mock('firebase/firestore', () => ({
  doc: jest.fn((...path) => ({ path })),
  getDoc: jest.fn(),
}));

const mockDoc = jest.mocked(doc);
const mockGetDoc = jest.mocked(getDoc);
const mockRequireDb = jest.mocked(requireDb);
const mockUser = { uid: 'user-1' } as User;

type ProfileSnapshot = {
  data: () => { betaAccess: boolean };
};

const createDeferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
};

const createRefreshArgs = (user: User | null = mockUser) => ({
  user,
  requestIdRef: { current: 0 },
  setBetaAccess: jest.fn(),
  setBetaAccessLoading: jest.fn(),
});

describe('refreshHostedBetaAccess', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFirebaseState.db = mockDb;
    mockFirebaseState.isHostedAuthEnabled = true;
  });

  test('clears beta access when hosted auth is unavailable', async () => {
    const args = createRefreshArgs();
    mockFirebaseState.isHostedAuthEnabled = false;

    await refreshHostedBetaAccess(args);

    expect(args.setBetaAccess).toHaveBeenCalledWith(false);
    expect(args.setBetaAccessLoading).toHaveBeenCalledWith(false);
    expect(mockGetDoc).not.toHaveBeenCalled();
  });

  test('clears beta access when Firestore is unavailable', async () => {
    const args = createRefreshArgs();
    mockFirebaseState.db = null;

    await refreshHostedBetaAccess(args);

    expect(args.setBetaAccess).toHaveBeenCalledWith(false);
    expect(args.setBetaAccessLoading).toHaveBeenCalledWith(false);
    expect(mockGetDoc).not.toHaveBeenCalled();
  });

  test('clears beta access when there is no hosted user', async () => {
    const args = createRefreshArgs(null);

    await refreshHostedBetaAccess(args);

    expect(args.setBetaAccess).toHaveBeenCalledWith(false);
    expect(args.setBetaAccessLoading).toHaveBeenCalledWith(false);
    expect(mockGetDoc).not.toHaveBeenCalled();
  });

  test.each([true, false])('applies betaAccess %s from the hosted profile', async (betaAccess) => {
    const args = createRefreshArgs();
    mockGetDoc.mockResolvedValueOnce({ data: () => ({ betaAccess }) } as never);

    await refreshHostedBetaAccess(args);

    expect(mockRequireDb).toHaveBeenCalledTimes(1);
    expect(mockDoc).toHaveBeenCalledWith(mockDb, 'userProfiles', mockUser.uid);
    expect(mockGetDoc).toHaveBeenCalledWith({ path: [mockDb, 'userProfiles', mockUser.uid] });
    expect(args.setBetaAccess).toHaveBeenCalledWith(betaAccess);
    expect(args.setBetaAccessLoading).toHaveBeenNthCalledWith(1, true);
    expect(args.setBetaAccessLoading).toHaveBeenNthCalledWith(2, false);
  });

  test('ignores responses from stale requests', async () => {
    const firstSnapshot = createDeferred<ProfileSnapshot>();
    const secondSnapshot = createDeferred<ProfileSnapshot>();
    const args = createRefreshArgs();
    mockGetDoc
      .mockReturnValueOnce(firstSnapshot.promise as never)
      .mockReturnValueOnce(secondSnapshot.promise as never);

    const firstRequest = refreshHostedBetaAccess(args);
    const secondRequest = refreshHostedBetaAccess(args);

    secondSnapshot.resolve({ data: () => ({ betaAccess: true }) });
    await secondRequest;
    firstSnapshot.resolve({ data: () => ({ betaAccess: false }) });
    await firstRequest;

    expect(args.requestIdRef.current).toBe(2);
    expect(args.setBetaAccess).toHaveBeenCalledTimes(1);
    expect(args.setBetaAccess).toHaveBeenCalledWith(true);
    expect(args.setBetaAccessLoading).toHaveBeenNthCalledWith(1, true);
    expect(args.setBetaAccessLoading).toHaveBeenNthCalledWith(2, true);
    expect(args.setBetaAccessLoading).toHaveBeenNthCalledWith(3, false);
  });

  test('clears beta access and loading after a getDoc failure', async () => {
    const args = createRefreshArgs();
    mockGetDoc.mockRejectedValueOnce(new Error('offline'));

    await refreshHostedBetaAccess(args);

    expect(args.setBetaAccess).toHaveBeenCalledWith(false);
    expect(args.setBetaAccessLoading).toHaveBeenNthCalledWith(1, true);
    expect(args.setBetaAccessLoading).toHaveBeenNthCalledWith(2, false);
  });
});
