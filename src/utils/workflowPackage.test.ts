import { buildWorkflowExportPackage, isWorkflowExportPackage, toSerializedWorkflowPackage } from './workflowPackage';

const cycle = {
  days: { 1: { day: 1, data: { categorical: new Map([['TSTM', []]]) }, metadata: { issueDate: '2026-07-15', validDate: '2026-07-15', issuanceTime: '0600', createdAt: '2026-07-15T00:00:00.000Z', lastModified: '2026-07-15T00:00:00.000Z' } } },
  currentDay: 1,
  cycleDate: '2026-07-15',
} as never;

const metadata = {
  id: 'WF-severe-2026-07-15', workflowId: 'severe-day1', cycleDate: '2026-07-15', status: 'in-progress',
  outlookVersions: [{ version: 1, status: 'in-progress', createdAt: '2026-07-15T00:00:00.000Z' }],
  createdAt: '2026-07-15T00:00:00.000Z', updatedAt: '2026-07-15T00:00:00.000Z',
} as never;

test.each(['workflow', 'cycle'] as const)('builds a discriminated %s package', (scope) => {
  const pkg = buildWorkflowExportPackage({ scope, forecast: { version: '1.0.0', type: 'forecast-cycle', timestamp: '2026-07-15T00:00:00.000Z', forecastCycle: cycle }, cycleMetadata: metadata, exportedAt: '2026-07-15T12:00:00.000Z' });
  expect(pkg.packageType).toBe(scope);
  expect(isWorkflowExportPackage(pkg)).toBe(true);
  expect(pkg.exportedAt).toBe('2026-07-15T12:00:00.000Z');
});

test('converts packages into the existing v2 serialized package contract', () => {
  const pkg = buildWorkflowExportPackage({ scope: 'cycle', forecast: { version: '1.0.0', type: 'forecast-cycle', timestamp: '2026-07-15T00:00:00.000Z', forecastCycle: cycle }, cycleMetadata: metadata });
  expect(toSerializedWorkflowPackage(pkg)?.cycles[0].id).toBe(metadata.id);
  expect(toSerializedWorkflowPackage(pkg)?.metadata.workflowId).toBe(metadata.workflowId);
});

test('rejects lookalike packages with missing export markers', () => {
  expect(isWorkflowExportPackage({ forecast: {} })).toBe(false);
});
