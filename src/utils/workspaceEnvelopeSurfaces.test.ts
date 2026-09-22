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

type WorkspaceId = Parameters<typeof serializeForecastWorkspace>[0];
type MapView = Parameters<typeof serializeForecastWorkspace>[2];

const DEFAULT_MAP_VIEW: MapView = { center: [0, 0], zoom: 4 };

const makeEnvelope = (
  workspaceId: WorkspaceId,
  cycleDate: string,
  overrides?: { cycle?: ForecastCycle; mapView?: MapView; metadata?: CycleMetadata },
) =>
  serializeForecastWorkspace(
    workspaceId,
    overrides?.cycle ?? buildCycle(cycleDate),
    overrides?.mapView ?? DEFAULT_MAP_VIEW,
    overrides?.metadata,
  );

const makeBarePayload = (
  cycleDate: string,
  overrides?: { cycle?: ForecastCycle; mapView?: MapView },
) =>
  serializeForecast(
    overrides?.cycle ?? buildCycle(cycleDate),
    overrides?.mapView ?? DEFAULT_MAP_VIEW,
  );

const payloadFile = (payload: unknown, name = 'gfc-forecast.json'): File =>
  textFile(name, JSON.stringify(payload));

const legacyPayloadFile = (payload: unknown): File => payloadFile(payload, 'legacy.json');

describe('workspace envelope loads across file surfaces', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('VerificationMode parses a workspace envelope and preserves legacy bare files', async () => {
    const cycleDate = '2026-09-20';
    const envelope = makeEnvelope('severe', cycleDate, {
      mapView: { center: [11, 22], zoom: 5 },
      metadata: buildMetadata(cycleDate),
    });

    const loaded = await parseAndValidateForecast(payloadFile(envelope));
    expect(loaded.cycleDate).toBe(cycleDate);

    const bare = makeBarePayload(cycleDate, { mapView: { center: [39.8, -98.5], zoom: 4 } });
    const legacy = await parseAndValidateForecast(legacyPayloadFile(bare));
    expect(legacy.cycleDate).toBe(cycleDate);
  });

  test('verificationV2 file and cloud loaders resolve envelopes', async () => {
    const cycleDate = '2026-09-21';
    const envelope = makeEnvelope('severe', cycleDate, { mapView: { center: [1, 2], zoom: 3 } });

    const fromFile = await loadForecastFromFile(payloadFile(envelope));
    expect(fromFile.cycleDate).toBe(cycleDate);

    const bare = makeBarePayload(cycleDate);
    const legacyFile = await loadForecastFromFile(legacyPayloadFile(bare));
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
    const envelope = makeEnvelope('custom', cycleDate, { mapView: { center: [5, 6], zoom: 4 } });

    const fromEnvelope = await parseForecastFile(payloadFile(envelope));
    expect(fromEnvelope.cycleDate).toBe(cycleDate);

    const bare = makeBarePayload(cycleDate);
    const fromLegacy = await parseForecastFile(legacyPayloadFile(bare));
    expect(fromLegacy.cycleDate).toBe(cycleDate);
  });

  test('monitor cloud outlook resolves envelope payloads', async () => {
    const cycleDate = new Date().toISOString().slice(0, 10);
    const envelopeCycle = {
      ...buildCycle(cycleDate),
      days: { 1: { day: 1, data: { tornado: 'x' }, metadata: {} } },
    } as unknown as ForecastCycle;
    const envelope = makeEnvelope('severe', cycleDate, { cycle: envelopeCycle });
    const loadCycle = jest.fn().mockResolvedValue(envelope.forecast);

    const selected = { id: 'cycle-1', kind: 'cloud-cycle', label: 'Cloud' } as never;
    const option = await loadCloudOutlookOption(loadCycle, selected, cycleDate);
    expect(option.data).toBeDefined();

    const bare = makeBarePayload(cycleDate, { cycle: envelopeCycle });
    loadCycle.mockResolvedValueOnce(bare);
    const legacyOption = await loadCloudOutlookOption(loadCycle, selected, cycleDate);
    expect(legacyOption.data).toBeDefined();
  });

  test('grade snapshot payloads resolve through the shared resolver', () => {
    const cycleDate = '2026-09-23';
    const envelope = makeEnvelope('severe', cycleDate);
    expect(resolveNativeFileContent(envelope).forecastCycle.cycleDate).toBe(cycleDate);

    const bare = makeBarePayload(cycleDate);
    expect(resolveNativeFileContent(bare).forecastCycle.cycleDate).toBe(cycleDate);
  });

  test('parseLoadedForecast enforces the active workspace and keeps envelope identity', async () => {
    const cycleDate = '2026-09-24';
    const envelope = makeEnvelope('custom', cycleDate, {
      mapView: { center: [7, 8], zoom: 6 },
      metadata: buildMetadata(cycleDate),
    });
    const addToast = jest.fn();

    const loaded = await parseLoadedForecast(
      payloadFile(envelope),
      addToast,
      'custom',
    );
    expect(loaded?.deserializedCycle.cycleDate).toBe(cycleDate);
    expect(loaded?.rawData.mapView).toEqual({ center: [7, 8], zoom: 6 });
    expect(loaded?.rawData.cycleMetadata).toMatchObject({ id: `WF-severe-${cycleDate}` });

    const rejected = await parseLoadedForecast(
      payloadFile(envelope),
      addToast,
      'severe',
    );
    expect(rejected).toBeNull();
    expect(addToast).toHaveBeenCalledWith(expect.stringContaining('custom workspace'), 'error');

    const bare = makeBarePayload(cycleDate);
    const legacy = await parseLoadedForecast(legacyPayloadFile(bare), addToast, 'severe');
    expect(legacy?.deserializedCycle.cycleDate).toBe(cycleDate);
  });
});
