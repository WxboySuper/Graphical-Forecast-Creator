jest.mock('./betaApi', () => ({
  fetchBetaApi: jest.fn(),
  isBetaClerkD1Mode: () => true,
}));
jest.mock('./firebase', () => ({ db: null }));
jest.mock('firebase/firestore', () => ({}));

import { fetchBetaApi } from './betaApi';
import { listCloudCycles } from './cloudCyclesService';

const fetchBetaApiMock = fetchBetaApi as jest.MockedFunction<typeof fetchBetaApi>;

const cycle = (id: string) => ({
  id, userId: 'clerk-user', label: id, cycleDate: '2026-10-16',
  createdAt: '2026-10-16T00:00:00.000Z', updatedAt: '2026-10-16T00:00:00.000Z',
  metadata: { id, userId: 'clerk-user', label: id, cycleDate: '2026-10-16', createdAt: '2026-10-16T00:00:00.000Z', updatedAt: '2026-10-16T00:00:00.000Z' },
});

const response = (body: unknown) => ({ ok: true, json: async () => body }) as Response;

test('lists every beta cloud-cycle page before sorting the result', async () => {
  fetchBetaApiMock
    .mockResolvedValueOnce(response({ cycles: [cycle('cycle-2')], nextPage: 1 }))
    .mockResolvedValueOnce(response({ cycles: [cycle('cycle-1')], nextPage: null }));

  const result = await listCloudCycles({ userId: 'clerk-user' });

  expect(result.success).toBe(true);
  expect(result.data?.map(({ id }) => id)).toEqual(['cycle-2', 'cycle-1']);
  expect(fetchBetaApiMock.mock.calls.map(([path]) => path)).toEqual([
    '/api/cloud-cycles?page=0',
    '/api/cloud-cycles?page=1',
  ]);
});
