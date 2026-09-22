import { createFileHandlers } from './useFileLoader';
import { downloadBlob } from '../utils/fileUtils';
import { serializeForecast } from '../utils/fileUtils';
import { serializeForecastWorkspace } from '../utils/forecastWorkspacePersistenceAdapter';
import type { ForecastCycle } from '../types/outlooks';
import type { CycleMetadata } from '../types/workflow';
import type { Feature, Polygon } from 'geojson';

jest.mock('../utils/fileUtils', () => {
  const actual = jest.requireActual('../utils/fileUtils');
  return {
    ...actual,
    downloadBlob: jest.fn(),
  };
});

const mockDownloadBlob = downloadBlob as jest.MockedFunction<typeof downloadBlob>;

const square = (): Feature<Polygon> => ({
  type: 'Feature',
  properties: { outlookType: 'tornado', probability: '15%' },
  geometry: {
    type: 'Polygon',
    coordinates: [[[-98, 34], [-96, 34], [-96, 36], [-98, 36], [-98, 34]]],
  },
});

const buildCycle = (cycleDate: string): ForecastCycle => ({
  cycleDate,
  currentDay: 1,
  days: {
    1: {
      day: 1,
      metadata: {
        issueDate: cycleDate,
        validDate: cycleDate,
        issuanceTime: '1200',
        createdAt: `${cycleDate}T12:00:00.000Z`,
        lastModified: `${cycleDate}T12:00:00.000Z`,
        lowProbabilityOutlooks: [],
      },
      data: {
        tornado: new Map([['15%', [square()]]]),
      },
    },
  },
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
  text: jest.fn().mockResolvedValue(text),
} as unknown as File);

const importActionTypes = (dispatch: jest.Mock): string[] =>
  dispatch.mock.calls.map((call) => (call[0] as { type?: string })?.type ?? '');

describe('createFileHandlers workspace envelope round-trip', () => {
  let addToast: jest.Mock;
  let dispatch: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    addToast = jest.fn();
    dispatch = jest.fn();
    mockDownloadBlob.mockImplementation(() => undefined);
  });

  it('round-trips a saved envelope without losing cycle date, workspace, metadata, or map view', async () => {
    const cycleDate = '2026-09-10';
    const mapView = { center: [11, 22] as [number, number], zoom: 5 };
    const metadata = buildMetadata(cycleDate);
    const payload = serializeForecastWorkspace('custom', buildCycle(cycleDate), mapView, metadata);

    const handlers = createFileHandlers({
      addToast,
      dispatch,
      forecastCycle: buildCycle('2026-01-01'),
      workspaceId: 'custom',
    });

    await handlers.handleLoad(textFile('gfc-forecast.json', JSON.stringify(payload)));

    expect(addToast).toHaveBeenCalledWith('Forecast loaded successfully!', 'success');
    const imported = dispatch.mock.calls.find((call) => (call[0] as { type?: string })?.type === 'forecast/importForecastCycle');
    expect(imported).toBeDefined();
    expect((imported?.[0] as { payload: ForecastCycle }).payload.cycleDate).toBe(cycleDate);
    expect((imported?.[0] as { payload: ForecastCycle }).payload.days[1]?.data.tornado?.get('15%')).toHaveLength(1);
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({
      type: 'forecast/setWorkflowMetadata',
      payload: expect.objectContaining({ id: `WF-severe-${cycleDate}` }),
    }));
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({
      type: 'forecast/setMapView',
      payload: mapView,
    }));
  });

  it('round-trips through handleSave without losing the active cycle date', async () => {
    const cycleDate = '2026-09-11';
    let capturedJson = '';
    const { Blob: OriginalBlob } = global;
    const seen: string[] = [];
    class CapturingBlob extends OriginalBlob {
      constructor(parts?: BlobPart[], options?: BlobPropertyBag) {
        super(parts, options);
        if (parts) seen.push(parts.map((part) => (typeof part === 'string' ? part : '')).join(''));
      }
    }
    global.Blob = CapturingBlob as typeof Blob;
    try {
      const saver = createFileHandlers({
        addToast,
        dispatch,
        forecastCycle: buildCycle(cycleDate),
        cycleMetadata: buildMetadata(cycleDate),
        workspaceId: 'severe',
      });
      saver.handleSave();
      capturedJson = seen.join('');
    } finally {
      global.Blob = OriginalBlob;
    }

    expect(capturedJson).toContain(cycleDate);
    expect(capturedJson).toContain('"severe"');

    const loaderDispatch = jest.fn();
    const loaderToast = jest.fn();
    const loader = createFileHandlers({
      addToast: loaderToast,
      dispatch: loaderDispatch,
      forecastCycle: buildCycle('2026-01-01'),
      workspaceId: 'severe',
    });
    await loader.handleLoad(textFile('gfc-forecast.json', capturedJson));

    expect(loaderToast).toHaveBeenCalledWith('Forecast loaded successfully!', 'success');
    const imported = loaderDispatch.mock.calls.find((call) => (call[0] as { type?: string })?.type === 'forecast/importForecastCycle');
    expect((imported?.[0] as { payload: ForecastCycle }).payload.cycleDate).toBe(cycleDate);
    expect(importActionTypes(loaderDispatch)).toContain('forecast/setWorkflowMetadata');
    expect(importActionTypes(loaderDispatch)).toContain('forecast/setMapView');
  });

  it('rejects a cross-workspace envelope before dispatching state', async () => {
    const payload = serializeForecastWorkspace('custom', buildCycle('2026-09-12'), { center: [0, 0], zoom: 4 });
    const handlers = createFileHandlers({
      addToast,
      dispatch,
      forecastCycle: buildCycle('2026-01-01'),
      workspaceId: 'severe',
    });

    await handlers.handleLoad(textFile('gfc-forecast.json', JSON.stringify(payload)));

    expect(dispatch).not.toHaveBeenCalled();
    expect(addToast).toHaveBeenCalledWith(expect.stringContaining('custom workspace'), 'error');
  });

  it('loads a legacy bare forecast into Severe for backward compatibility', async () => {
    const cycleDate = '2026-09-13';
    const bare = serializeForecast(buildCycle(cycleDate), { center: [39.8, -98.5], zoom: 4 });
    const handlers = createFileHandlers({
      addToast,
      dispatch,
      forecastCycle: buildCycle('2026-01-01'),
      workspaceId: 'severe',
    });

    await handlers.handleLoad(textFile('legacy.json', JSON.stringify(bare)));

    expect(addToast).toHaveBeenCalledWith('Forecast loaded successfully!', 'success');
    const imported = dispatch.mock.calls.find((call) => (call[0] as { type?: string })?.type === 'forecast/importForecastCycle');
    expect((imported?.[0] as { payload: ForecastCycle }).payload.cycleDate).toBe(cycleDate);
  });
});
