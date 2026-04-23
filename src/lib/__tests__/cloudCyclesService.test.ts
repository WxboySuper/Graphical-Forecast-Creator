import type { GFCForecastSaveData } from '../../types/outlooks';

const mockCollection = jest.fn();
const mockDoc = jest.fn();
const mockWhere = jest.fn();
const mockQuery = jest.fn();
const mockGetDoc = jest.fn();
const mockGetDocs = jest.fn();
const mockSetDoc = jest.fn();
const mockDeleteDoc = jest.fn();
const mockDeleteField = jest.fn(() => '__DELETE_FIELD__');
const mockOnSnapshot = jest.fn();

jest.mock('../firebase', () => ({
  db: {},
}));

jest.mock('uuid', () => ({
  v4: () => 'test-uuid-1234',
}));

jest.mock('../../utils/fileUtils', () => ({
  validateForecastData: jest.fn(() => true),
}));

jest.mock('firebase/firestore', () => ({
  collection: (...args: unknown[]) => mockCollection(...args),
  doc: (...args: unknown[]) => mockDoc(...args),
  where: (...args: unknown[]) => mockWhere(...args),
  query: (...args: unknown[]) => mockQuery(...args),
  getDoc: (...args: unknown[]) => mockGetDoc(...args),
  getDocs: (...args: unknown[]) => mockGetDocs(...args),
  setDoc: (...args: unknown[]) => mockSetDoc(...args),
  deleteDoc: (...args: unknown[]) => mockDeleteDoc(...args),
  deleteField: () => mockDeleteField(),
  onSnapshot: (...args: unknown[]) => mockOnSnapshot(...args),
}));

import {
  deleteCloudCycle,
  hasRemoteChanges,
  listCloudCycles,
  loadCloudCycle,
  renameCloudCycle,
  saveCloudCycle,
  subscribeToCloudCycles,
} from '../cloudCyclesService';

const basePayload: GFCForecastSaveData = {
  version: '1.0.0',
  type: 'single-day',
  timestamp: '2026-04-22T00:00:00.000Z',
  outlooks: {},
};

const computePayloadHash = (payload: GFCForecastSaveData): string => {
  const jsonStr = JSON.stringify(payload);
  let hash = 0;
  for (let i = 0; i < jsonStr.length; i += 1) {
    const char = jsonStr.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return Math.abs(hash).toString(36).substring(0, 12);
};

const baseStats = {
  forecastDays: 1,
  totalOutlooks: 2,
  totalFeatures: 3,
};

const makeDocSnapshot = ({
  id,
  exists = true,
  data,
}: {
  id: string;
  exists?: boolean;
  data?: Record<string, unknown>;
}) => ({
  id,
  exists: () => exists,
  data: () => data,
});

describe('cloudCyclesService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCollection.mockReturnValue('cloudCyclesCollectionRef');
    mockWhere.mockReturnValue('whereClause');
    mockQuery.mockReturnValue('queryRef');
    mockDoc.mockImplementation((...args: unknown[]) => ({
      _type: 'docRef',
      args,
      id: String(args[args.length - 1]),
    }));
    mockSetDoc.mockResolvedValue(undefined);
    mockDeleteDoc.mockResolvedValue(undefined);
    mockOnSnapshot.mockImplementation((_queryRef, onNext, _onError) => {
      onNext({ docs: [] });
      return jest.fn();
    });
  });

  it('saves a new cloud cycle with generated id and payload metadata', async () => {
    const result = await saveCloudCycle({
      userId: 'user-1',
      label: 'Cycle A',
      cycleDate: '2026-04-22',
      stats: baseStats,
      payload: basePayload,
    });

    expect(result.success).toBe(true);
    expect(result.data).toBe('user-1-2026-04-22-test-uuid-1234');
    expect(mockSetDoc).toHaveBeenCalledTimes(1);
    const [, payload] = mockSetDoc.mock.calls[0];
    expect(payload).toMatchObject({
      id: 'user-1-2026-04-22-test-uuid-1234',
      userId: 'user-1',
      label: 'Cycle A',
      cycleDate: '2026-04-22',
      forecastDays: 1,
      totalOutlooks: 2,
      totalFeatures: 3,
      isReadOnly: false,
    });
    expect(payload).toHaveProperty('payloadJson');
    expect(payload).toHaveProperty('payloadBytes');
    expect(payload).toHaveProperty('payloadHash');
  });

  it('returns not found when trying to update an unowned/non-existent cycle', async () => {
    mockGetDoc.mockResolvedValueOnce(makeDocSnapshot({ id: 'existing', exists: false }));

    const result = await saveCloudCycle({
      userId: 'user-1',
      label: 'Cycle A',
      cycleDate: '2026-04-22',
      stats: baseStats,
      payload: basePayload,
      existingId: 'existing',
    });

    expect(result).toEqual({
      success: false,
      error: 'Cloud cycle not found',
    });
    expect(mockSetDoc).not.toHaveBeenCalled();
  });

  it('loads a cycle from firestore when owned by user', async () => {
    mockGetDoc.mockResolvedValueOnce(
      makeDocSnapshot({
        id: 'cycle-1',
        data: {
          id: 'cycle-1',
          userId: 'user-1',
          label: 'Cycle 1',
          cycleDate: '2026-04-22',
          createdAt: '2026-04-22T00:00:00.000Z',
          updatedAt: '2026-04-22T00:00:00.000Z',
          forecastDays: 1,
          totalOutlooks: 1,
          totalFeatures: 1,
          isReadOnly: false,
          payloadJson: JSON.stringify(basePayload),
        },
      })
    );

    const result = await loadCloudCycle({ userId: 'user-1', cycleId: 'cycle-1' });
    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({
      id: 'cycle-1',
      userId: 'user-1',
      label: 'Cycle 1',
    });
  });

  it('loads from legacy document and migrates when firestore document is missing', async () => {
    mockGetDoc
      .mockResolvedValueOnce(makeDocSnapshot({ id: 'cycle-legacy', exists: false }))
      .mockResolvedValueOnce(
        makeDocSnapshot({
          id: 'user-1',
          data: {
            cloudCycles: JSON.stringify({
              'cycle-legacy': {
                id: 'cycle-legacy',
                userId: 'user-1',
                label: 'Legacy Cycle',
                cycleDate: '2026-04-22',
                createdAt: '2026-04-22T00:00:00.000Z',
                updatedAt: '2026-04-22T00:00:00.000Z',
                forecastDays: 1,
                totalOutlooks: 1,
                totalFeatures: 1,
                isReadOnly: false,
                payload: basePayload,
              },
            }),
          },
        })
      );

    const result = await loadCloudCycle({ userId: 'user-1', cycleId: 'cycle-legacy' });

    expect(result.success).toBe(true);
    expect(result.data?.id).toBe('cycle-legacy');
    expect(mockSetDoc).toHaveBeenCalledTimes(2);
    expect(mockDeleteField).toHaveBeenCalledTimes(1);
  });

  it('lists firestore metadata sorted by updatedAt desc', async () => {
    mockGetDocs.mockResolvedValueOnce({
      docs: [
        {
          id: 'older',
          data: () => ({
            id: 'older',
            userId: 'user-1',
            label: 'Older',
            cycleDate: '2026-04-21',
            createdAt: '2026-04-21T00:00:00.000Z',
            updatedAt: '2026-04-21T00:00:00.000Z',
            forecastDays: 1,
            totalOutlooks: 1,
            totalFeatures: 1,
            isReadOnly: false,
          }),
        },
        {
          id: 'newer',
          data: () => ({
            id: 'newer',
            userId: 'user-1',
            label: 'Newer',
            cycleDate: '2026-04-22',
            createdAt: '2026-04-22T00:00:00.000Z',
            updatedAt: '2026-04-22T01:00:00.000Z',
            forecastDays: 1,
            totalOutlooks: 1,
            totalFeatures: 1,
            isReadOnly: false,
          }),
        },
      ],
    });

    const result = await listCloudCycles({ userId: 'user-1' });
    expect(result.success).toBe(true);
    expect(result.data?.map((c) => c.id)).toEqual(['newer', 'older']);
  });

  it('lists legacy cycles when cloud collection is empty and migrates them', async () => {
    mockGetDocs
      .mockResolvedValueOnce({ docs: [] })
      .mockResolvedValueOnce({ docs: [] });
    mockGetDoc.mockResolvedValueOnce(
      makeDocSnapshot({
        id: 'user-1',
        data: {
          cloudCycles: {
            'legacy-1': {
              id: 'legacy-1',
              userId: 'user-1',
              label: 'Legacy',
              cycleDate: '2026-04-22',
              createdAt: '2026-04-22T00:00:00.000Z',
              updatedAt: '2026-04-22T01:00:00.000Z',
              forecastDays: 1,
              totalOutlooks: 1,
              totalFeatures: 1,
              isReadOnly: false,
              payload: basePayload,
            },
          },
        },
      })
    );

    const result = await listCloudCycles({ userId: 'user-1' });
    expect(result.success).toBe(true);
    expect(result.data?.[0].id).toBe('legacy-1');
    expect(mockSetDoc).toHaveBeenCalled();
  });

  it('renames and deletes owned cycles', async () => {
    mockGetDoc
      .mockResolvedValueOnce(
        makeDocSnapshot({
          id: 'cycle-1',
          data: {
            id: 'cycle-1',
            userId: 'user-1',
            label: 'Before',
            cycleDate: '2026-04-22',
            createdAt: '2026-04-22T00:00:00.000Z',
            updatedAt: '2026-04-22T00:00:00.000Z',
            forecastDays: 1,
            totalOutlooks: 1,
            totalFeatures: 1,
            isReadOnly: false,
            payloadJson: JSON.stringify(basePayload),
          },
        })
      )
      .mockResolvedValueOnce(
        makeDocSnapshot({
          id: 'cycle-1',
          data: {
            id: 'cycle-1',
            userId: 'user-1',
            label: 'Before',
            cycleDate: '2026-04-22',
            createdAt: '2026-04-22T00:00:00.000Z',
            updatedAt: '2026-04-22T00:00:00.000Z',
            forecastDays: 1,
            totalOutlooks: 1,
            totalFeatures: 1,
            isReadOnly: false,
            payloadJson: JSON.stringify(basePayload),
          },
        })
      );

    const renameResult = await renameCloudCycle({
      userId: 'user-1',
      cycleId: 'cycle-1',
      newLabel: 'After',
    });
    expect(renameResult.success).toBe(true);

    const deleteResult = await deleteCloudCycle({
      userId: 'user-1',
      cycleId: 'cycle-1',
    });
    expect(deleteResult.success).toBe(true);
    expect(mockDeleteDoc).toHaveBeenCalledTimes(1);
  });

  it('returns errors when write operations throw', async () => {
    mockSetDoc.mockRejectedValueOnce(new Error('save failed'));
    const saveResult = await saveCloudCycle({
      userId: 'user-1',
      label: 'Cycle A',
      cycleDate: '2026-04-22',
      stats: baseStats,
      payload: basePayload,
    });
    expect(saveResult.success).toBe(false);
    expect(saveResult.error).toContain('save failed');

    mockGetDoc.mockResolvedValueOnce(
      makeDocSnapshot({
        id: 'cycle-1',
        data: {
          id: 'cycle-1',
          userId: 'user-1',
          label: 'Before',
          cycleDate: '2026-04-22',
          createdAt: '2026-04-22T00:00:00.000Z',
          updatedAt: '2026-04-22T00:00:00.000Z',
          forecastDays: 1,
          totalOutlooks: 1,
          totalFeatures: 1,
          isReadOnly: false,
          payloadJson: JSON.stringify(basePayload),
        },
      })
    );
    mockSetDoc.mockRejectedValueOnce(new Error('rename failed'));
    const renameResult = await renameCloudCycle({
      userId: 'user-1',
      cycleId: 'cycle-1',
      newLabel: 'After',
    });
    expect(renameResult.success).toBe(false);

    mockGetDoc.mockResolvedValueOnce(
      makeDocSnapshot({
        id: 'cycle-1',
        data: {
          id: 'cycle-1',
          userId: 'user-1',
          label: 'Before',
          cycleDate: '2026-04-22',
          createdAt: '2026-04-22T00:00:00.000Z',
          updatedAt: '2026-04-22T00:00:00.000Z',
          forecastDays: 1,
          totalOutlooks: 1,
          totalFeatures: 1,
          isReadOnly: false,
          payloadJson: JSON.stringify(basePayload),
        },
      })
    );
    mockDeleteDoc.mockRejectedValueOnce(new Error('delete failed'));
    const deleteResult = await deleteCloudCycle({
      userId: 'user-1',
      cycleId: 'cycle-1',
    });
    expect(deleteResult.success).toBe(false);
  });

  it('subscribes to metadata updates and forwards snapshot errors', () => {
    const onUpdate = jest.fn();
    const onError = jest.fn();
    const unsubscribe = jest.fn();

    mockOnSnapshot.mockImplementationOnce((_q, onNext, onErr) => {
      onNext({
        docs: [
          {
            id: 'cycle-1',
            data: () => ({
              id: 'cycle-1',
              userId: 'user-1',
              label: 'Cycle 1',
              cycleDate: '2026-04-22',
              createdAt: '2026-04-22T00:00:00.000Z',
              updatedAt: '2026-04-22T00:00:00.000Z',
              forecastDays: 1,
              totalOutlooks: 1,
              totalFeatures: 1,
              isReadOnly: false,
            }),
          },
        ],
      });
      onErr(new Error('stream failed'));
      return unsubscribe;
    });
    mockGetDocs.mockResolvedValueOnce({ docs: [] });
    mockGetDocs.mockResolvedValueOnce({ docs: [] });
    mockGetDoc.mockResolvedValueOnce(makeDocSnapshot({ id: 'user-1', data: {} }));

    const stop = subscribeToCloudCycles({
      userId: 'user-1',
      onUpdate,
      onError,
    });

    expect(onUpdate).toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith(expect.any(Error));
    stop();
    expect(unsubscribe).toHaveBeenCalled();
  });

  it('detects local/remote payload hash mismatches', () => {
    const remoteSame = {
      id: 'cycle-1',
      userId: 'user-1',
      label: 'Cycle 1',
      cycleDate: '2026-04-22',
      createdAt: '2026-04-22T00:00:00.000Z',
      updatedAt: '2026-04-22T00:00:00.000Z',
      forecastDays: 1,
      totalOutlooks: 0,
      totalFeatures: 0,
      isReadOnly: false,
      payloadHash: computePayloadHash(basePayload),
    };

    expect(hasRemoteChanges(basePayload, remoteSame)).toBe(false);
    expect(hasRemoteChanges(basePayload, { ...remoteSame, payloadHash: 'different' })).toBe(true);
  });
});
