const setDoc = jest.fn(() => Promise.resolve());
const getDocs = jest.fn();
const deleteDoc = jest.fn(() => Promise.resolve());
const collection = jest.fn((...parts: string[]) => ({ parts }));
const doc = jest.fn((...parts: unknown[]) => ({ parts }));
const query = jest.fn((value) => value);

jest.mock('firebase/firestore', () => ({ collection, deleteDoc, doc, getDocs, query, setDoc }));
jest.mock('./firebase', () => ({ db: { name: 'db' } }));

import {
  createWorkflowAwarenessWriteQueue,
  getWorkflowAwarenessAllowlist,
  isValidWorkflowAwarenessRecord,
  listWorkflowAwareness,
  saveWorkflowAwareness,
} from './workflowAwarenessService';
import { WORKFLOW_AWARENESS_CONSENT_VERSION } from '../types/workflowAwareness';

const metadata = {
  cycleId: 'WF-severe-day1-2026-07-13',
  workflowId: 'severe-day1',
  cycleDate: '2026-07-13',
  status: 'in-progress' as const,
  outlookVersions: [{ version: 1, status: 'in-progress' as const, createdAt: '2026-07-13T00:00:00.000Z' }],
  createdAt: '2026-07-13T00:00:00.000Z',
  updatedAt: '2026-07-13T00:00:00.000Z',
};

beforeEach(() => {
  jest.clearAllMocks();
});

test('writes only the nested user awareness path and allowlisted metadata', async () => {
  await saveWorkflowAwareness({
    userId: 'user-a',
    metadata,
    consent: { enabled: true, version: WORKFLOW_AWARENESS_CONSENT_VERSION },
  });

  expect(collection).toHaveBeenCalledWith({ name: 'db' }, 'users', 'user-a', 'workflowAwareness');
  expect(setDoc).toHaveBeenCalledWith(
    expect.objectContaining({ parts: [expect.objectContaining({ parts: [{ name: 'db' }, 'users', 'user-a', 'workflowAwareness'] }), metadata.cycleId] }),
    expect.objectContaining({
      consentVersion: WORKFLOW_AWARENESS_CONSENT_VERSION,
      schemaVersion: 1,
      metadata,
    }),
  );
  expect(getWorkflowAwarenessAllowlist()).toEqual(expect.arrayContaining(['metadata', 'consentVersion']));
});

test('rejects stale consent and malformed nested metadata', async () => {
  await saveWorkflowAwareness({ userId: 'user-a', metadata, consent: { enabled: true, version: 0 } });
  expect(setDoc).not.toHaveBeenCalled();

  const malformed = {
    ...metadata,
    consentVersion: WORKFLOW_AWARENESS_CONSENT_VERSION,
    schemaVersion: 1,
    outlookVersions: [{ version: 1, status: 'in-progress', createdAt: 'now', geometry: 'forbidden' }],
  };
  expect(isValidWorkflowAwarenessRecord(malformed)).toBe(false);
});

test('deletes malformed records while returning only valid records', async () => {
  getDocs.mockResolvedValue({
    docs: [
      { id: 'valid', data: () => ({ consentVersion: 1, schemaVersion: 1, metadata }) },
      { id: 'bad', data: () => ({ cycleId: metadata.cycleId }) },
    ],
  });

  const records = await listWorkflowAwareness({
    userId: 'user-a',
    consent: { enabled: true, version: WORKFLOW_AWARENESS_CONSENT_VERSION },
  });

  expect(records).toHaveLength(1);
  expect(deleteDoc).toHaveBeenCalledTimes(1);
  expect(deleteDoc).toHaveBeenCalledWith(expect.objectContaining({ parts: expect.arrayContaining(['bad']) }));
});

test('serializes disable/delete behind an in-flight save', async () => {
  const queue = createWorkflowAwarenessWriteQueue();
  const order: string[] = [];
  let releaseSave: () => void = () => undefined;
  const save = queue.enqueue(async () => {
    order.push('save-start');
    await new Promise<void>((resolve) => { releaseSave = resolve; });
    order.push('save-end');
  });
  const remove = queue.enqueue(async () => { order.push('delete'); });

  await Promise.resolve();
  expect(order).toEqual(['save-start']);
  releaseSave();
  await Promise.all([save, remove]);
  expect(order).toEqual(['save-start', 'save-end', 'delete']);
});
