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
import { MAX_FEATURES_PER_MAP } from '../forecastOutlookValidation';
import { MAX_KML_IMPORT_BYTES } from '../forecastImportValidation';

const square = (): Feature<Polygon> => ({
  type: 'Feature',
  properties: { outlookType: 'tornado', probability: '15%' },
  geometry: {
    type: 'Polygon',
    coordinates: [[[-98, 34], [-96, 34], [-96, 36], [-98, 36], [-98, 34]]],
  },
});

const featureBucket = (length: number): Feature<Polygon>[] =>
  Array.from({ length }, square);

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

/** Rewrites an archive's central-directory uncompressed size to simulate forged ZIP metadata. */
const forgeCentralDirectoryUncompressedSize = (bytes: Uint8Array, declaredSize: number): Uint8Array => {
  const patched = Uint8Array.from(bytes);
  const view = new DataView(patched.buffer);
  let endOfCentralDirectory = -1;
  for (let index = patched.length - 22; index >= 0; index -= 1) {
    if (view.getUint32(index, true) === 0x06054b50) {
      endOfCentralDirectory = index;
      break;
    }
  }
  if (endOfCentralDirectory < 0) {
    throw new Error('ZIP end-of-central-directory record not found.');
  }
  const centralDirectoryOffset = view.getUint32(endOfCentralDirectory + 16, true);
  view.setUint32(centralDirectoryOffset + 24, declaredSize, true);
  return patched;
};

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

  test('imports untagged KML files without claiming ownership the file cannot know', async () => {
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
    // A KML file carries no workspace identity, so the import reports it as
    // unowned rather than asserting Severe ownership. The Severe entry policy
    // decides where that geometry may open.
    expect(result.workspaceId).toBeNull();
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

  test('imports legacy gfc-forecast filenames from payload ownership, not the filename', async () => {
    const payload = serializeForecastWorkspace('custom', buildForecast(), { center: [39.8, -98.5], zoom: 4 });
    const json = JSON.stringify(payload);
    const legacyFile = new File([json], 'gfc-forecast-2026-09-23T12-34-56.json', { type: 'application/json' });
    legacyFile.arrayBuffer = async () => new TextEncoder().encode(json).buffer;

    const legacyResult = await importForecastTransfer(legacyFile);
    expect(legacyResult.format).toBe('json');
    expect(legacyResult.workspaceId).toBe('custom');

    const severePayload = serializeForecastWorkspace('severe', buildForecast(), { center: [39.8, -98.5], zoom: 4 });
    const severeJson = JSON.stringify(severePayload);
    const mislabeledFile = new File([severeJson], 'gfc-custom-forecast-2026-09-23T12-34-56.json', { type: 'application/json' });
    mislabeledFile.arrayBuffer = async () => new TextEncoder().encode(severeJson).buffer;

    const mislabeledResult = await importForecastTransfer(mislabeledFile);
    expect(mislabeledResult.workspaceId).toBe('severe');
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
    const originalCreateElement = document.createElement.bind(document);
    const link = originalCreateElement('a');
    const createElementSpy = jest.spyOn(document, 'createElement').mockImplementation(((
      ...args: Parameters<typeof document.createElement>
    ) => {
      if (args[0] === 'a') return link;
      return originalCreateElement(...args);
    }) as typeof document.createElement);

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
      createElementSpy.mockRestore();
      jest.restoreAllMocks();
    }

    expect(capturedJson).toContain('"custom"');
    expect(link.download).toMatch(/gfc-custom-forecast-.*\.json$/);
    const file = new File([capturedJson], 'custom-forecast.json', { type: 'application/json' });
    file.arrayBuffer = async () => new TextEncoder().encode(capturedJson).buffer;
    const result = await importForecastTransfer(file);
    expect(result.workspaceId).toBe('custom');
    expect(result.mapView).toEqual(mapView);
  });

  test('uses the Severe workspace filename for native JSON exports', async () => {
    const forecastCycle = buildForecast();
    const mapView = { center: [39.8, -98.5] as [number, number], zoom: 4 };
    const originalCreateElement = document.createElement.bind(document);
    const link = originalCreateElement('a');
    const clickSpy = jest.spyOn(link, 'click').mockImplementation(() => undefined);
    const createElementSpy = jest.spyOn(document, 'createElement').mockImplementation(((
      ...args: Parameters<typeof document.createElement>
    ) => {
      if (args[0] === 'a') return link;
      return originalCreateElement(...args);
    }) as typeof document.createElement);
    const appendChildSpy = jest.spyOn(document.body, 'appendChild').mockImplementation((node) => node);
    const removeChildSpy = jest.spyOn(document.body, 'removeChild').mockImplementation((node) => node);
    const createObjectURL = jest.fn(() => 'blob:test');
    const revokeObjectURL = jest.fn();
    global.URL.createObjectURL = createObjectURL;
    global.URL.revokeObjectURL = revokeObjectURL;

    try {
      await exportForecastTransfer({
        format: 'json',
        scope: 'cycle',
        forecastCycle,
        mapView,
        workspaceId: 'severe',
      });
    } finally {
      createElementSpy.mockRestore();
      appendChildSpy.mockRestore();
      removeChildSpy.mockRestore();
      clickSpy.mockRestore();
      jest.restoreAllMocks();
    }

    expect(link.download).toMatch(/^gfc-severe-forecast-.*\.json$/);
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

  test('accepts an outer Severe label over an untagged legacy forecast without a warning', async () => {
    const bare = serializeForecast(buildForecast(), mapView());

    const file = await packageFile(bareInnerPackage(bare, 'severe'), 'labeled-legacy.zip');

    const result = await importForecastTransfer(file);
    expect(result.workspaceId).toBe('severe');
    // The label matches what the payload proves, so nothing about ownership
    // changed and there is nothing to warn about.
    expect(result.warnings).toEqual([]);
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

  test('rejects oversized KMZ entries even when the declared uncompressed size is forged small', async () => {
    const zip = new JSZip();
    zip.file('doc.kml', `<kml>${'x'.repeat(10 * 1024 * 1024 + 1)}</kml>`, { compression: 'DEFLATE' });
    const bytes = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
    const forged = forgeCentralDirectoryUncompressedSize(bytes, 1024);
    const buffer = Uint8Array.from(forged).buffer;
    const file = new File([buffer], 'forged.kmz', { type: 'application/vnd.google-earth.kmz' });
    file.arrayBuffer = async () => buffer;

    await expect(importForecastTransfer(file)).rejects.toThrow('Expanded KML is too large');
  });

  test('pauses KMZ decompression when streamed content exceeds the limit', async () => {
    const listeners = new Map<string, (value?: unknown) => void>();
    const end = jest.fn();
    let paused = false;
    const stream = {
      on: jest.fn((event: string, listener: (value?: unknown) => void) => {
        listeners.set(event, event === 'end'
          ? () => {
            end();
            listener();
          }
          : listener);
        return stream;
      }),
      pause: jest.fn(() => {
        paused = true;
      }),
      resume: jest.fn(() => {
        listeners.get('data')?.(new Uint8Array(MAX_KML_IMPORT_BYTES + 1));
        if (!paused) listeners.get('end')?.();
        return stream;
      }),
    } as unknown as JSZip.JSZipStreamHelper<Uint8Array>;
    const entry = {
      _data: { uncompressedSize: 1 },
      internalStream: jest.fn(() => stream),
    } as unknown as JSZip.JSZipObject;
    const zip = { file: jest.fn(() => entry), files: {} } as unknown as JSZip;
    const loadAsync = jest.spyOn(JSZip, 'loadAsync').mockResolvedValue(zip);
    const file = new File(['zip'], 'controlled.kmz', { type: 'application/vnd.google-earth.kmz' });

    try {
      await expect(importForecastTransfer(file)).rejects.toThrow('Expanded KML is too large');
      expect(stream.pause).toHaveBeenCalledTimes(1);
      expect(end).not.toHaveBeenCalled();
    } finally {
      loadAsync.mockRestore();
    }
  });

  test('imports a small KMZ through the streaming reader', async () => {
    const forecastCycle = buildForecast();
    const kml = buildStructuredKmlDocument({
      forecastCycle,
      options: { scope: 'current-day', day: 1, strategy: 'structured-kml' },
    });
    const zip = new JSZip();
    zip.file('doc.kml', kml);
    const bytes = await zip.generateAsync({ type: 'uint8array' });
    const buffer = Uint8Array.from(bytes).buffer;
    const file = new File([buffer], 'small.kmz', { type: 'application/vnd.google-earth.kmz' });
    file.arrayBuffer = async () => buffer;

    const result = await importForecastTransfer(file, { defaultDay: 1 });
    expect(result.forecastCycle.days[1]?.data.tornado?.get('15%')).toHaveLength(1);
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

  test('rejects KML imports that exceed the per-map feature bound', () => {
    const placemarks = Array.from({ length: MAX_FEATURES_PER_MAP + 1 }, () => ({
      day: 1 as const,
      outlookType: 'tornado' as const,
      probabilityKey: '15%',
      feature: square(),
      isSignificant: false,
    }));

    expect(() => forecastCycleFromKmlPlacemarks(placemarks)).toThrow('features for day 1');
  });

  test('counts existing features across probability buckets and allows the exact limit', () => {
    const baseCycle = buildForecast();
    const baseDay = baseCycle.days[1]!;
    const firstBucketCount = Math.floor((MAX_FEATURES_PER_MAP - 1) / 2);
    baseCycle.days[1] = {
      ...baseDay,
      data: {
        ...baseDay.data,
        tornado: new Map([
          ['15%', featureBucket(firstBucketCount)],
          ['30%', featureBucket(MAX_FEATURES_PER_MAP - 1 - firstBucketCount)],
        ]),
      },
    };

    const atLimit = forecastCycleFromKmlPlacemarks([{
      day: 1,
      outlookType: 'tornado',
      probabilityKey: '30%',
      feature: square(),
      isSignificant: false,
    }], baseCycle);

    const tornadoMap = atLimit.days[1]?.data.tornado;
    expect((tornadoMap?.get('15%')?.length ?? 0) + (tornadoMap?.get('30%')?.length ?? 0))
      .toBe(MAX_FEATURES_PER_MAP);
    expect(() => forecastCycleFromKmlPlacemarks([{
      day: 1,
      outlookType: 'tornado',
      probabilityKey: '15%',
      feature: square(),
      isSignificant: false,
    }], atLimit)).toThrow('features for day 1');
  });

  test('applies the feature limit independently to each day and outlook map', () => {
    const baseCycle = buildForecast();
    const baseDay = baseCycle.days[1]!;
    baseCycle.days[1] = {
      ...baseDay,
      data: {
        ...baseDay.data,
        tornado: new Map([['15%', featureBucket(MAX_FEATURES_PER_MAP - 1)]]),
        wind: new Map([['15%', featureBucket(MAX_FEATURES_PER_MAP - 1)]]),
      },
    };
    baseCycle.days[2] = {
      ...baseDay,
      day: 2,
      data: {
        ...baseDay.data,
        tornado: new Map([['15%', featureBucket(MAX_FEATURES_PER_MAP - 1)]]),
      },
    };

    const atLimit = forecastCycleFromKmlPlacemarks([
      { day: 1, outlookType: 'tornado', probabilityKey: '30%', feature: square(), isSignificant: false },
      { day: 1, outlookType: 'wind', probabilityKey: '30%', feature: square(), isSignificant: false },
      { day: 2, outlookType: 'tornado', probabilityKey: '30%', feature: square(), isSignificant: false },
    ], baseCycle);

    expect(atLimit.days[1]?.data.tornado?.get('30%')).toHaveLength(1);
    expect(atLimit.days[1]?.data.wind?.get('30%')).toHaveLength(1);
    expect(atLimit.days[2]?.data.tornado?.get('30%')).toHaveLength(1);
  });

  test('ignores non-integer gfc_day values and keeps the folder day', () => {
    const kml = `<kml><Document><Folder><name>Day 2</name><Placemark>
      <name>Tornado 15%</name>
      <ExtendedData>
        <Data name="gfc_day"><value>3.5</value></Data>
        <Data name="gfc_outlook_type"><value>tornado</value></Data>
        <Data name="gfc_probability_key"><value>15%</value></Data>
      </ExtendedData>
      <Polygon><outerBoundaryIs><LinearRing><coordinates>-98,34 -96,34 -96,36 -98,36 -98,34</coordinates></LinearRing></outerBoundaryIs></Polygon>
    </Placemark></Folder></Document></kml>`;

    const { placemarks } = parseKmlDocument(kml, 1);
    expect(placemarks).toHaveLength(1);
    expect(placemarks[0]?.day).toBe(2);
  });

  test('exports KML blobs through exportForecastTransfer', async () => {
    const forecastCycle = buildForecast();
    const click = jest.fn();
    const createObjectURL = jest.fn(() => 'blob:test');
    const revokeObjectURL = jest.fn();
    const appendChild = jest.spyOn(document.body, 'appendChild').mockImplementation((node) => node);
    const removeChild = jest.spyOn(document.body, 'removeChild').mockImplementation((node) => node);
    const originalCreateElement = document.createElement.bind(document);
    const link = originalCreateElement('a');
    link.click = click;

    jest.spyOn(document, 'createElement').mockImplementation(((
      ...args: Parameters<typeof document.createElement>
    ) => {
      if (args[0] === 'a') {
        return link;
      }
      return originalCreateElement(...args);
    }) as typeof document.createElement);
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

  test('applies the same kmz feature gate in the export API that the transfer UI uses', async () => {
    const spy = jest.spyOn(require('../../config/featureExposure'), 'isFeatureExposed').mockReturnValue(false);

    await expect(exportForecastTransfer({
      format: 'kml',
      scope: 'cycle',
      forecastCycle: buildForecast(),
      mapView: mapView(),
      workspaceId: 'severe',
    })).rejects.toThrow('not available in this build');

    spy.mockRestore();
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
