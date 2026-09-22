import { serializeForecast } from './fileUtils';
import { serializeForecastWorkspace } from './forecastWorkspacePersistenceAdapter';
import { resolveNativeFileContent } from './forecastTransfer/nativeImportUtils';
import { parseAndValidateForecast } from '../components/VerificationMode/VerificationMode';
import { loadForecastFromFile, loadForecastFromCloud } from './verificationV2/sources';
import { parseForecastFile } from '../components/CycleManager/CopyFromPreviousModal';
import { loadCloudOutlookOption } from '../pages/useMonitorCloudOutlook';
import { parseLoadedForecast } from '../pages/forecastPageController';
import { loadCloudCycle } from '../lib/cloudCyclesService';
import type { ForecastCycle } from '../types/outlooks';
import type { CycleMetadata } from '../types/workflow';

jest.mock('../lib/cloudCyclesService', () => ({
  loadCloudCycle: jest.fn(),
}));

const mockedLoadCloudCycle = loadCloudCycle as jest.MockedFunction<typeof loadCloudCycle>;

const buildCycle = (cycleDate: string): ForecastCycle => ({
  cycleDate,
  currentDay: 1,
  days: {},
});

const buildMetadata = (cycleDate: string): CycleMetadata => ({
  id: `WF-severe-${cycleDate}`,
  workflowId: 'severe-day1',
  cycleDate,
  status: 'in-progress',
  outlookVersions: [{ version: 1, status: 'in-progress', createdAt: `${cycleDate}T00:00:00.000Z` }],
  createdAt: `${cycleDate}T00:00:00.000Z`,
  updatedAt: `${cycleDate}T00:00:00.000Z`,
} as unknown as CycleMetadata);

const textFile = (name: string, text: string): File => ({
  name,
  type: 'application/json',
  text: jest.fn().mockResolvedValue(text),
} as unknown as File);

describe('workspace envelope loads across file surfaces', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('VerificationMode parses a workspace envelope and preserves legacy bare files', async () => {
    const cycleDate = '2026-09-20';
    const envelope = serializeForecastWorkspace(
      'severe',
      buildCycle(cycleDate),
      { center: [11, 22], zoom: 5 },
      buildMetadata(cycleDate),
    );

    const loaded = await parseAndValidateForecast(textFile('gfc-forecast.json', JSON.stringify(envelope)));
    expect(loaded.cycleDate).toBe(cycleDate);

    const bare = serializeForecast(buildCycle(cycleDate), { center: [39.8, -98.5], zoom: 4 });
    const legacy = await parseAndValidateForecast(textFile('legacy.json', JSON.stringify(bare)));
    expect(legacy.cycleDate).toBe(cycleDate);
  });

  test('verificationV2 file and cloud loaders resolve envelopes', async () => {
    const cycleDate = '2026-09-21';
    const envelope = serializeForecastWorkspace('severe', buildCycle(cycleDate), { center: [1, 2], zoom: 3 });

    const fromFile = await loadForecastFromFile(textFile('gfc-forecast.json', JSON.stringify(envelope)));
    expect(fromFile.cycleDate).toBe(cycleDate);

    const bare = serializeForecast(buildCycle(cycleDate), { center: [0, 0], zoom: 4 });
    const legacyFile = await loadForecastFromFile(textFile('legacy.json', JSON.stringify(bare)));
    expect(legacyFile.cycleDate).toBe(cycleDate);

    mockedLoadCloudCycle.mockResolvedValue({
      success: true,
      data: { payload: envelope } as never,
    } as never);
    const fromCloud = await loadForecastFromCloud({ userId: 'user-1', cycleId: 'cycle-1' });
    expect(fromCloud.cycleDate).toBe(cycleDate);

    mockedLoadCloudCycle.mockResolvedValue({
      success: true,
      data: { payload: bare } as never,
    } as never);
    const legacyCloud = await loadForecastFromCloud({ userId: 'user-1', cycleId: 'cycle-1' });
    expect(legacyCloud.cycleDate).toBe(cycleDate);
  });

  test('CopyFromPreviousModal parses envelopes and legacy bare files', async () => {
    const cycleDate = '2026-09-22';
    const envelope = serializeForecastWorkspace('custom', buildCycle(cycleDate), { center: [5, 6], zoom: 4 });

    const fromEnvelope = await parseForecastFile(textFile('gfc-forecast.json', JSON.stringify(envelope)));
    expect(fromEnvelope.cycleDate).toBe(cycleDate);

    const bare = serializeForecast(buildCycle(cycleDate), { center: [0, 0], zoom: 4 });
    const fromLegacy = await parseForecastFile(textFile('legacy.json', JSON.stringify(bare)));
    expect(fromLegacy.cycleDate).toBe(cycleDate);
  });

  test('monitor cloud outlook resolves envelope payloads', async () => {
    const cycleDate = new Date().toISOString().slice(0, 10);
    const envelopeCycle = {
      ...buildCycle(cycleDate),
      days: { 1: { day: 1, data: { tornado: 'x' }, metadata: {} } },
    } as unknown as ForecastCycle;
    const envelope = serializeForecastWorkspace('severe', envelopeCycle, { center: [0, 0], zoom: 4 });
    const loadCycle = jest.fn().mockResolvedValue(envelope.forecast);

    const selected = { id: 'cycle-1', kind: 'cloud-cycle', label: 'Cloud' } as never;
    const option = await loadCloudOutlookOption(loadCycle, selected, cycleDate);
    expect(option.data).toBeDefined();

    const bare = serializeForecast(envelopeCycle, { center: [0, 0], zoom: 4 });
    loadCycle.mockResolvedValueOnce(bare);
    const legacyOption = await loadCloudOutlookOption(loadCycle, selected, cycleDate);
    expect(legacyOption.data).toBeDefined();
  });

  test('grade snapshot payloads resolve through the shared resolver', () => {
    const cycleDate = '2026-09-23';
    const envelope = serializeForecastWorkspace('severe', buildCycle(cycleDate), { center: [0, 0], zoom: 4 });
    expect(resolveNativeFileContent(envelope).forecastCycle.cycleDate).toBe(cycleDate);

    const bare = serializeForecast(buildCycle(cycleDate), { center: [0, 0], zoom: 4 });
    expect(resolveNativeFileContent(bare).forecastCycle.cycleDate).toBe(cycleDate);
  });

  test('parseLoadedForecast enforces the active workspace and keeps envelope identity', async () => {
    const cycleDate = '2026-09-24';
    const envelope = serializeForecastWorkspace(
      'custom',
      buildCycle(cycleDate),
      { center: [7, 8], zoom: 6 },
      buildMetadata(cycleDate),
    );
    const addToast = jest.fn();

    const loaded = await parseLoadedForecast(
      textFile('gfc-forecast.json', JSON.stringify(envelope)),
      addToast,
      'custom',
    );
    expect(loaded?.deserializedCycle.cycleDate).toBe(cycleDate);
    expect(loaded?.rawData.mapView).toEqual({ center: [7, 8], zoom: 6 });
    expect(loaded?.rawData.cycleMetadata).toMatchObject({ id: `WF-severe-${cycleDate}` });

    const rejected = await parseLoadedForecast(
      textFile('gfc-forecast.json', JSON.stringify(envelope)),
      addToast,
      'severe',
    );
    expect(rejected).toBeNull();
    expect(addToast).toHaveBeenCalledWith(expect.stringContaining('custom workspace'), 'error');

    const bare = serializeForecast(buildCycle(cycleDate), { center: [0, 0], zoom: 4 });
    const legacy = await parseLoadedForecast(textFile('legacy.json', JSON.stringify(bare)), addToast, 'severe');
    expect(legacy?.deserializedCycle.cycleDate).toBe(cycleDate);
  });
});
