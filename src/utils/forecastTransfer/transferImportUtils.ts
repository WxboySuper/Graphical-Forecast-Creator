import JSZip from 'jszip';
import {
  deserializeForecast,
  readForecastImportFile,
  validateForecastDataReason,
} from '../fileUtils';
import type { ForecastCycle, DayType } from '../../types/outlooks';
import type { CycleMetadata } from '../../types/workflow';
import { detectForecastTransferFormat } from './detectFormat';
import { parseKmlDocument } from './parseKml';
import { forecastCycleFromKmlPlacemarks } from './forecastCycleFromKml';
import type {
  ForecastImportResult,
  ForecastTransferMapView,
} from './types';
import { isWorkflowExportPackage } from '../workflowPackage';
import { MAX_IMPORT_BYTES, MAX_KML_IMPORT_BYTES, validateImportFileBytes } from '../forecastImportValidation';

/** Reads a browser File into bytes when the File API supports arrayBuffer. */
const readFileBytes = async (file: File): Promise<Uint8Array | undefined> => {
  if (typeof file.arrayBuffer !== 'function') return undefined;
  return new Uint8Array(await file.arrayBuffer());
};

/** Finds the preferred KML entry in an archive, falling back to any .kml file. */
const findKmlEntry = (zip: JSZip): JSZip.JSZipObject => {
  const preferred = zip.file('doc.kml')
    ?? Object.values(zip.files).find((entry) => entry.name.toLowerCase().endsWith('.kml'));
  if (!preferred) throw new Error('KMZ archive does not contain a KML document.');
  return preferred;
};

/** Expands and validates one KML archive entry. */
const expandKmlEntry = async (entry: JSZip.JSZipObject): Promise<string> => {
  const declaredSize = (entry as unknown as { _data?: { uncompressedSize?: number } })._data?.uncompressedSize;
  if (declaredSize !== undefined && declaredSize > MAX_KML_IMPORT_BYTES) {
    throw new Error(`Expanded KML is too large. The maximum supported size is ${MAX_KML_IMPORT_BYTES / 1024 / 1024} MB.`);
  }
  const expandedKml = await entry.async('uint8array');
  if (expandedKml.byteLength > MAX_KML_IMPORT_BYTES) {
    throw new Error(`Expanded KML is too large. The maximum supported size is ${MAX_KML_IMPORT_BYTES / 1024 / 1024} MB.`);
  }
  return new TextDecoder().decode(expandedKml);
};

/** Reads the KML payload from a KMZ file. */
const readKmzPayload = async (file: File, bytes?: Uint8Array): Promise<string> => {
  const zip = await JSZip.loadAsync(bytes ?? file);
  return expandKmlEntry(findKmlEntry(zip));
};

/** Reads plain-text KML or the KML payload from a KMZ file. */
const readKmlPayload = async (file: File, bytes?: Uint8Array): Promise<string> => {
  if (file.name.toLowerCase().endsWith('.kmz') || file.type === 'application/vnd.google-earth.kmz') return readKmzPayload(file, bytes);
  if (bytes) return new TextDecoder().decode(bytes);
  if (typeof file.text === 'function') return file.text();
  if (typeof file.arrayBuffer === 'function') return new TextDecoder().decode(new Uint8Array(await file.arrayBuffer()));
  throw new Error('Unable to read KML file contents.');
};

/** Imports a KML/KMZ transfer into a forecast cycle. */
const importKmlTransfer = async (file: File, bytes: Uint8Array | undefined, format: 'kml' | 'kmz', options?: { baseCycle?: ForecastCycle; defaultDay?: DayType }): Promise<ForecastImportResult> => {
  const kml = await readKmlPayload(file, bytes);
  const { placemarks, warnings } = parseKmlDocument(kml, options?.defaultDay ?? options?.baseCycle?.currentDay ?? 1);
  return { forecastCycle: forecastCycleFromKmlPlacemarks(placemarks, options?.baseCycle), warnings, format };
};

/** Imports a native JSON or workflow package transfer. */
const importNativeTransfer = async (file: File, format: 'json' | 'package'): Promise<ForecastImportResult> => {
  const data = await readForecastImportFile(file);
  const validationError = validateForecastDataReason(data);
  if (validationError) throw new Error(validationError);
  const rawData = data as { mapView?: ForecastTransferMapView; cycleMetadata?: CycleMetadata | null; metadata?: CycleMetadata };
  return { forecastCycle: deserializeForecast(data), mapView: rawData.mapView, cycleMetadata: isWorkflowExportPackage(data) ? rawData.metadata : rawData.cycleMetadata, warnings: [], format };
};

/** Reads transfer bytes and detects the import format before parsing. */
const prepareImport = async (file: File): Promise<{ bytes: Uint8Array | undefined; format: ForecastImportResult['format'] }> => {
  const bytes = await readFileBytes(file);
  const byteGate = validateImportFileBytes(bytes);
  if (!byteGate.ok) throw new Error(byteGate.reason);
  if (file.size > MAX_IMPORT_BYTES) throw new Error(`File is too large (${(file.size / 1024 / 1024).toFixed(1)} MB).`);
  const format = detectForecastTransferFormat(file, bytes);
  if (!format) throw new Error('Unsupported file type. Use JSON, ZIP package, KML, or KMZ.');
  return { bytes, format };
};

/** Imports a supported transfer file into the GFC schema. */
export const importTransferFile = async (file: File, options?: { baseCycle?: ForecastCycle; defaultDay?: DayType }): Promise<ForecastImportResult> => {
  const { bytes, format } = await prepareImport(file);
  return format === 'kml' || format === 'kmz'
    ? importKmlTransfer(file, bytes, format, options)
    : importNativeTransfer(file, format);
};
