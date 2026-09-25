import JSZip from 'jszip';
import type { Feature, Polygon } from 'geojson';
import type { ForecastCycle } from '../../types/outlooks';
import { buildStructuredKmlDocument } from '../kmzExport/buildKml';
import { detectForecastTransferFormat } from './detectFormat';
import { exportForecastTransfer, importForecastTransfer } from './index';
import { forecastCycleFromKmlPlacemarks, parseKmlDocument } from './parseKml';
import { serializeForecast } from '../fileUtils';
import { serializeForecastWorkspace } from '../forecastWorkspacePersistenceAdapter';
import { buildWorkflowExportPackage } from '../workflowPackage';

const square = (): Feature<Polygon> => ({
  type: 'Feature',
  properties: { outlookType: 'tornado', probability: '15%' },
  geometry: {
    type: 'Polygon',
    coordinates: [[[-98, 34], [-96, 34], [-96, 36], [-98, 36], [-98, 34]]],
  },
});

const buildForecast = (): ForecastCycle => ({
  cycleDate: '2026-08-18',
  currentDay: 1,
  days: {
    1: {
      day: 1,
      metadata: {
        issueDate: '2026-08-18',
        validDate: '2026-08-19',
        issuanceTime: '1200',
        createdAt: '2026-08-18T12:00:00.000Z',
        lastModified: '2026-08-18T12:00:00.000Z',
        lowProbabilityOutlooks: [],
        outlookOpacities: { tornado: 0.5 },
      },
      data: {
        tornado: new Map([['15%', [square()]]]),
      },
    },
  },
});

const mapView = (): { center: [number, number]; zoom: number } => ({ center: [39.8, -98.5], zoom: 4 });

const EXPORTED_AT = '2026-08-18T12:00:00.000Z';

/** Wraps a manifest in a ZIP file shaped like an uploaded GFC package. */
const packageFile = async (manifest: unknown, name: string): Promise<File> => {
  const zip = new JSZip();
  zip.file('workflow_package.json', JSON.stringify(manifest));
  const bytes = await zip.generateAsync({ type: 'uint8array' });
  const buffer = Uint8Array.from(bytes).buffer;
  const file = new File([buffer], name, { type: 'application/zip' });
  file.arrayBuffer = async () => buffer;
  return file;
};

/**
 * Builds a package that carries the standard export markers but keeps a bare
 * inner forecast, which is the shape written before inner envelopes existed.
 */
const bareInnerPackage = (forecast: ReturnType<typeof serializeForecast>, workspaceId?: string): Record<string, unknown> => {
  const pkg = buildWorkflowExportPackage({ scope: 'cycle', forecast, workspaceId: 'severe', exportedAt: EXPORTED_AT });
  return {
    packageType: pkg.packageType,
    schemaVersion: pkg.schemaVersion,
    exportedAt: pkg.exportedAt,
    ...(workspaceId ? { workspaceId } : {}),
    forecast,
  };
};

/** jsdom Blobs ship without Blob.arrayBuffer, so exports are read through FileReader. */
const readBlobBytes = (blob: Blob): Promise<ArrayBuffer> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error ?? new Error('Could not read the exported package.'));
    reader.readAsArrayBuffer(blob);
  });

describe('forecastTransfer', () => {
  test('detects supported transfer formats from file metadata', () => {
    expect(detectForecastTransferFormat(new File(['{}'], 'forecast.json', { type: 'application/json' }))).toBe('json');
    expect(detectForecastTransferFormat(new File([''], 'forecast.zip', { type: 'application/zip' }))).toBe('package');
    expect(detectForecastTransferFormat(new File(['<kml'], 'outlook.kml', { type: 'application/vnd.google-earth.kml+xml' }))).toBe('kml');
    expect(detectForecastTransferFormat(new File([''], 'outlook.kmz', { type: 'application/vnd.google-earth.kmz' }))).toBe('kmz');
    expect(detectForecastTransferFormat(new File([''], 'notes.txt', { type: 'text/plain' }))).toBeNull();
  });

  test('round-trips KML export into the GFC forecast schema', () => {
    const forecastCycle = buildForecast();
    const kml = buildStructuredKmlDocument({
      forecastCycle,
      options: { scope: 'current-day', day: 1, strategy: 'structured-kml' },
    });

    expect(kml).toContain('<Placemark>');
    expect(kml).toContain('<Polygon>');

    const { placemarks, warnings } = parseKmlDocument(kml, 1);
    expect(warnings).toEqual([]);
    expect(placemarks).toHaveLength(1);
    expect(placemarks[0]).toMatchObject({
      day: 1,
      outlookType: 'tornado',
      probabilityKey: '15%',
    });

    const importedCycle = forecastCycleFromKmlPlacemarks(placemarks);
    const importedFeatures = importedCycle.days[1]?.data.tornado?.get('15%');
    expect(importedFeatures).toHaveLength(1);
    expect(importedFeatures?.[0].geometry.type).toBe('Polygon');
  });

  test('imports untagged KML files as Severe-owned transfers guarded in other workspaces', async () => {
    const forecastCycle = buildForecast();
    const kml = buildStructuredKmlDocument({
      forecastCycle,
      options: { scope: 'cycle', strategy: 'structured-kml' },
    });
    const file = new File([kml], 'day-1.kml', { type: 'application/vnd.google-earth.kml+xml' });
    file.arrayBuffer = async () => new TextEncoder().encode(kml).buffer;

    const result = await importForecastTransfer(file, {
      baseCycle: forecastCycle,
      defaultDay: 1,
    });

    expect(result.format).toBe('kml');
    expect(result.warnings).toEqual([]);
    expect(result.forecastCycle.days[1]?.data.tornado?.get('15%')).toHaveLength(2);
    expect(result.workspaceId).toBe('severe');
  });

  test('preserves explicit workspace identity for native imports', async () => {
    const forecast = serializeForecast(buildForecast(), { center: [39.8, -98.5], zoom: 4 });
    const payload = serializeForecastWorkspace('custom', buildForecast(), { center: [39.8, -98.5], zoom: 4 });
    const file = new File([JSON.stringify(payload)], 'custom-forecast.json', { type: 'application/json' });
    file.arrayBuffer = async () => new TextEncoder().encode(JSON.stringify(payload)).buffer;

    const result = await importForecastTransfer(file);

    expect(result.workspaceId).toBe('custom');
    expect(result.mapView).toEqual(forecast.mapView);
    expect(result.forecastCycle.cycleDate).toBe(buildForecast().cycleDate);
  });

  test('preserves workflow package metadata through the workspace classifier', async () => {
    const forecast = serializeForecast(buildForecast(), { center: [39.8, -98.5], zoom: 4 });
    const cycleMetadata = {
      id: 'WF-severe-2026-08-18',
      workflowId: 'severe-day1',
      cycleDate: '2026-08-18',
      status: 'in-progress',
      outlookVersions: [{ version: 1, status: 'in-progress', createdAt: '2026-08-18T00:00:00.000Z' }],
      createdAt: '2026-08-18T00:00:00.000Z',
      updatedAt: '2026-08-18T00:00:00.000Z',
    } as never;
    const pkg = buildWorkflowExportPackage({ scope: 'cycle', forecast, cycleMetadata, workspaceId: 'severe', exportedAt: '2026-08-18T12:00:00.000Z' });
    const zip = new JSZip();
    zip.file('workflow_package.json', JSON.stringify(pkg));
    const bytes = await zip.generateAsync({ type: 'uint8array' });
    const buffer = Uint8Array.from(bytes).buffer;
    const file = new File([buffer], 'cycle-package.zip', { type: 'application/zip' });
    file.arrayBuffer = async () => buffer;

    const result = await importForecastTransfer(file);

    expect(result.format).toBe('package');
    expect(result.workspaceId).toBe('severe');
    expect(result.cycleMetadata).toEqual(cycleMetadata);
    expect(result.mapView).toEqual({ center: [39.8, -98.5], zoom: 4 });
  });

  test('round-trips native JSON exports without losing custom workspace identity', async () => {
    const forecastCycle = buildForecast();
    const mapView = { center: [39.8, -98.5] as [number, number], zoom: 4 };
    const seen: string[] = [];
    const OriginalBlob = global.Blob;
    class CapturingBlob extends OriginalBlob {
      constructor(parts?: BlobPart[], options?: BlobPropertyBag) {
        super(parts, options);
        if (parts) seen.push(parts.map((part) => (typeof part === 'string' ? part : '')).join(''));
      }
    }
    global.Blob = CapturingBlob as typeof Blob;
    const createObjectURL = jest.fn(() => 'blob:test');
    const revokeObjectURL = jest.fn();
    global.URL.createObjectURL = createObjectURL;
    global.URL.revokeObjectURL = revokeObjectURL;

    let capturedJson = '';
    try {
      await exportForecastTransfer({
        format: 'json',
        scope: 'cycle',
        forecastCycle,
        mapView,
        workspaceId: 'custom',
      });
      capturedJson = seen.join('');
    } finally {
      global.Blob = OriginalBlob;
      jest.restoreAllMocks();
    }

    expect(capturedJson).toContain('"custom"');
    const file = new File([capturedJson], 'custom-forecast.json', { type: 'application/json' });
    file.arrayBuffer = async () => new TextEncoder().encode(capturedJson).buffer;
    const result = await importForecastTransfer(file);
    expect(result.workspaceId).toBe('custom');
    expect(result.mapView).toEqual(mapView);
  });

  test('preserves explicit package workspace identity and rejects mismatched envelopes', async () => {
    const customEnvelope = serializeForecastWorkspace('custom', buildForecast(), { center: [39.8, -98.5], zoom: 4 });
    const cycleMetadata = {
      id: 'WF-custom-2026-08-18',
      workflowId: 'custom-day1',
      cycleDate: '2026-08-18',
      status: 'in-progress',
      outlookVersions: [{ version: 1, status: 'in-progress', createdAt: '2026-08-18T00:00:00.000Z' }],
      createdAt: '2026-08-18T00:00:00.000Z',
      updatedAt: '2026-08-18T00:00:00.000Z',
    } as never;
    const pkg = buildWorkflowExportPackage({
      scope: 'cycle',
      forecast: customEnvelope as unknown as Parameters<typeof buildWorkflowExportPackage>[0]['forecast'],
      cycleMetadata,
      workspaceId: 'custom',
      exportedAt: '2026-08-18T12:00:00.000Z',
    });
    const zip = new JSZip();
    zip.file('workflow_package.json', JSON.stringify(pkg));
    const bytes = await zip.generateAsync({ type: 'uint8array' });
    const buffer = Uint8Array.from(bytes).buffer;
    const file = new File([buffer], 'custom-package.zip', { type: 'application/zip' });
    file.arrayBuffer = async () => buffer;

    const result = await importForecastTransfer(file);
    expect(result.format).toBe('package');
    expect(result.workspaceId).toBe('custom');

    const mismatched = { ...pkg, workspaceId: 'severe' };
    const badZip = new JSZip();
    badZip.file('workflow_package.json', JSON.stringify(mismatched));
    const badBytes = await badZip.generateAsync({ type: 'uint8array' });
    const badBuffer = Uint8Array.from(badBytes).buffer;
    const badFile = new File([badBuffer], 'mismatched-package.zip', { type: 'application/zip' });
    badFile.arrayBuffer = async () => badBuffer;
    await expect(importForecastTransfer(badFile)).rejects.toThrow('does not match');
  });

  test('rejects an outer label that would move an untagged legacy forecast into Custom', async () => {
    const bare = serializeForecast(buildForecast(), mapView());

    const file = await packageFile(bareInnerPackage(bare, 'custom'), 'relabel-legacy.zip');

    await expect(importForecastTransfer(file)).rejects.toThrow('cannot be verified');
  });

  test('accepts an outer Severe label over an untagged legacy forecast with a warning', async () => {
    const bare = serializeForecast(buildForecast(), mapView());

    const file = await packageFile(bareInnerPackage(bare, 'severe'), 'labeled-legacy.zip');

    const result = await importForecastTransfer(file);
    expect(result.workspaceId).toBe('severe');
    expect(result.warnings.join(' ')).toMatch('untagged legacy');
  });

  test('round-trips a new Custom package because inner and outer identities agree', async () => {
    const forecastCycle = buildForecast();
    const view = mapView();
    const pkg = buildWorkflowExportPackage({
      scope: 'cycle',
      forecast: serializeForecast(forecastCycle, view),
      workspaceId: 'custom',
      exportedAt: EXPORTED_AT,
    });

    const file = await packageFile(pkg, 'custom-round-trip.zip');

    expect(pkg.workspaceId).toBe('custom');
    expect(pkg.forecast).toMatchObject({ schemaVersion: 1, workspaceId: 'custom' });

    const result = await importForecastTransfer(file);
    expect(result.format).toBe('package');
    expect(result.workspaceId).toBe('custom');
    expect(result.warnings).toEqual([]);
    expect(result.mapView).toEqual(view);
    expect(result.forecastCycle.cycleDate).toBe(forecastCycle.cycleDate);
  });

  test('round-trips a Custom package exported through the transfer pipeline', async () => {
    const forecastCycle = buildForecast();
    const view = mapView();
    const originalCreateObjectUrl = URL.createObjectURL;
    const originalRevokeObjectUrl = URL.revokeObjectURL;
    const blobs: Blob[] = [];
    URL.createObjectURL = jest.fn((blob: Blob) => {
      blobs.push(blob);
      return 'blob:test';
    });
    URL.revokeObjectURL = jest.fn();

    try {
      await exportForecastTransfer({
        format: 'package',
        scope: 'cycle',
        forecastCycle,
        mapView: view,
        workspaceId: 'custom',
      });
    } finally {
      URL.createObjectURL = originalCreateObjectUrl;
      URL.revokeObjectURL = originalRevokeObjectUrl;
      jest.restoreAllMocks();
    }

    expect(blobs).toHaveLength(1);
    const buffer = await readBlobBytes(blobs[0]);
    const file = new File([buffer], 'custom-package.zip', { type: 'application/zip' });
    file.arrayBuffer = async () => buffer;

    const result = await importForecastTransfer(file);
    expect(result.workspaceId).toBe('custom');
    expect(result.warnings).toEqual([]);
    expect(result.mapView).toEqual(view);
  });

  test('warns when a package has no outer label but carries an inner workspace envelope', async () => {
    const envelope = serializeForecastWorkspace('custom', buildForecast(), mapView());
    const pkg = buildWorkflowExportPackage({
      scope: 'cycle',
      forecast: envelope,
      workspaceId: 'custom',
      exportedAt: EXPORTED_AT,
    });
    const unlabeled = {
      packageType: pkg.packageType,
      schemaVersion: pkg.schemaVersion,
      exportedAt: pkg.exportedAt,
      forecast: pkg.forecast,
    };

    const file = await packageFile(unlabeled, 'unlabeled-enveloped.zip');

    const result = await importForecastTransfer(file);
    expect(result.workspaceId).toBe('custom');
    expect(result.warnings.join(' ')).toMatch('no workspace label');
    expect(result.warnings.join(' ')).toMatch('ownership inferred');
  });

  test('warns when a package has no outer workspace instead of silently assuming Severe', async () => {
    const bare = serializeForecast(buildForecast(), mapView());

    const file = await packageFile(bareInnerPackage(bare), 'legacy-package.zip');

    const result = await importForecastTransfer(file);
    expect(result.workspaceId).toBe('severe');
    expect(result.warnings.join(' ')).toMatch('no workspace label');
  });

  test('keeps a bare legacy JSON file Severe-owned without a package warning', async () => {
    const bare = serializeForecast(buildForecast(), { center: [39.8, -98.5], zoom: 4 });
    const file = new File([JSON.stringify(bare)], 'legacy.json', { type: 'application/json' });
    file.arrayBuffer = async () => new TextEncoder().encode(JSON.stringify(bare)).buffer;

    const result = await importForecastTransfer(file);
    expect(result.workspaceId).toBe('severe');
    expect(result.warnings).toEqual([]);
  });

  test('rejects a ZIP whose forecast entry disagrees with its manifest', async () => {
    const bare = serializeForecast(buildForecast(), { center: [39.8, -98.5], zoom: 4 });
    const pkg = buildWorkflowExportPackage({ scope: 'cycle', forecast: bare, workspaceId: 'severe', exportedAt: '2026-08-18T12:00:00.000Z' });
    const zip = new JSZip();
    zip.file('workflow_package.json', JSON.stringify(pkg));
    zip.file('forecast_cycle.json', JSON.stringify({ tampered: true }));
    const bytes = await zip.generateAsync({ type: 'uint8array' });
    const buffer = Uint8Array.from(bytes).buffer;
    const file = new File([buffer], 'conflict-package.zip', { type: 'application/zip' });
    file.arrayBuffer = async () => buffer;

    await expect(importForecastTransfer(file)).rejects.toThrow('does not match');
  });

  test('rejects a ZIP missing its workflow manifest instead of using the legacy entry', async () => {
    const bare = serializeForecast(buildForecast(), { center: [39.8, -98.5], zoom: 4 });
    const zip = new JSZip();
    zip.file('forecast_cycle.json', JSON.stringify(bare));
    const bytes = await zip.generateAsync({ type: 'uint8array' });
    const buffer = Uint8Array.from(bytes).buffer;
    const file = new File([buffer], 'no-manifest.zip', { type: 'application/zip' });
    file.arrayBuffer = async () => buffer;

    await expect(importForecastTransfer(file)).rejects.toThrow('missing workflow_package.json');
  });

  test('rejects KMZ files whose expanded KML exceeds the import limit', async () => {
    const zip = new JSZip();
    zip.file('doc.kml', `<kml>${'x'.repeat(10 * 1024 * 1024 + 1)}</kml>`);
    const bytes = await zip.generateAsync({ type: 'uint8array' });
    const buffer = Uint8Array.from(bytes).buffer;
    const file = new File([buffer], 'oversized.kmz', { type: 'application/vnd.google-earth.kmz' });
    file.arrayBuffer = async () => buffer;

    await expect(importForecastTransfer(file)).rejects.toThrow('Expanded KML is too large');
  });

  test('does not treat CIG metadata as significant threat metadata', () => {
    const kml = `<kml><Document><Folder><name>Day 1</name></Folder><Placemark>
      <name>Tornado CIG2</name>
      <ExtendedData>
        <Data name="gfc_day"><value>1</value></Data>
        <Data name="gfc_outlook_type"><value>tornado</value></Data>
        <Data name="gfc_probability_key"><value>CIG2</value></Data>
        <Data name="gfc_significant"><value>false</value></Data>
        <Data name="gfc_cig"><value>CIG2</value></Data>
      </ExtendedData>
      <Polygon><outerBoundaryIs><LinearRing><coordinates>-98,34 -96,34 -96,36 -98,36 -98,34</coordinates></LinearRing></outerBoundaryIs></Polygon>
    </Placemark></Document></kml>`;

    const { placemarks } = parseKmlDocument(kml, 1);
    expect(placemarks[0]?.isSignificant).toBe(false);
  });

  test('exports KML blobs through exportForecastTransfer', async () => {
    const forecastCycle = buildForecast();
    const click = jest.fn();
    const createObjectURL = jest.fn(() => 'blob:test');
    const revokeObjectURL = jest.fn();
    const appendChild = jest.spyOn(document.body, 'appendChild').mockImplementation((node) => node);
    const removeChild = jest.spyOn(document.body, 'removeChild').mockImplementation((node) => node);
    const link = document.createElement('a');
    link.click = click;

    jest.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
      if (tagName === 'a') {
        return link;
      }
      return document.createElement(tagName);
    });
    global.URL.createObjectURL = createObjectURL;
    global.URL.revokeObjectURL = revokeObjectURL;

    await exportForecastTransfer({
      format: 'kml',
      scope: 'current-day',
      forecastCycle,
      mapView: { center: [39.8, -98.5], zoom: 4 },
      day: 1,
      workspaceId: 'severe',
    });

    expect(createObjectURL).toHaveBeenCalled();
    expect(click).toHaveBeenCalled();
    expect(link.download).toMatch(/gfc-day-1-.*\.kml$/);

    appendChild.mockRestore();
    removeChild.mockRestore();
    jest.restoreAllMocks();
  });

  test('rejects non-Severe KML/KMZ exports so Custom cannot create Severe-owned geometry', async () => {
    const forecastCycle = buildForecast();
    const mapView = { center: [39.8, -98.5] as [number, number], zoom: 4 };

    await expect(exportForecastTransfer({
      format: 'kml',
      scope: 'cycle',
      forecastCycle,
      mapView,
      workspaceId: 'custom',
    })).rejects.toThrow('Severe workspace');

    await expect(exportForecastTransfer({
      format: 'kmz',
      scope: 'cycle',
      forecastCycle,
      mapView,
      workspaceId: 'custom',
    })).rejects.toThrow('Severe workspace');
  });

  test('rejects workflow packages with present-but-unknown or noncanonical outer workspaces', async () => {
    const bare = serializeForecast(buildForecast(), { center: [39.8, -98.5], zoom: 4 });
    const basePkg = buildWorkflowExportPackage({ scope: 'cycle', forecast: bare, workspaceId: 'severe', exportedAt: '2026-08-18T12:00:00.000Z' });

    for (const badWorkspace of ['bogus', 'Severe', 'SEVERE', 42]) {
      const pkg = { ...basePkg, workspaceId: badWorkspace };
      const zip = new JSZip();
      zip.file('workflow_package.json', JSON.stringify(pkg));
      const bytes = await zip.generateAsync({ type: 'uint8array' });
      const buffer = Uint8Array.from(bytes).buffer;
      const file = new File([buffer], 'bad-outer.zip', { type: 'application/zip' });
      file.arrayBuffer = async () => buffer;
      await expect(importForecastTransfer(file)).rejects.toThrow('unknown workspace');
    }
  });

  test('refuses to export native JSON without a registered workspace owner', async () => {
    for (const invalid of [undefined, 'Severe', 'mesoscale-v2']) {
      await expect(exportForecastTransfer({
        format: 'json',
        scope: 'cycle',
        forecastCycle: buildForecast(),
        mapView: mapView(),
        workspaceId: invalid as never,
      })).rejects.toThrow('valid workspace');
    }
  });

  test('refuses to export a workflow package without a registered workspace owner', async () => {
    for (const invalid of [undefined, '', 'bogus']) {
      await expect(exportForecastTransfer({
        format: 'package',
        scope: 'cycle',
        forecastCycle: buildForecast(),
        mapView: mapView(),
        workspaceId: invalid as never,
      })).rejects.toThrow('valid workspace');
    }
  });
});
