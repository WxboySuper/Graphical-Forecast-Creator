import type { ForecastCycle, DayType } from '../../types/outlooks';
import { detectForecastTransferFormat } from './detectFormat';
import type { ForecastImportResult } from './types';
import { MAX_IMPORT_BYTES, validateImportFileBytes } from '../forecastImportValidation';
import { importKmlTransfer } from './kmlImportUtils';
import { importNativeTransfer } from './nativeImportUtils';

/** Reads a browser File into bytes when the File API supports arrayBuffer. */
const readFileBytes = async (file: File): Promise<Uint8Array | undefined> => {
  if (typeof file.arrayBuffer !== 'function') return undefined;
  return new Uint8Array(await file.arrayBuffer());
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
