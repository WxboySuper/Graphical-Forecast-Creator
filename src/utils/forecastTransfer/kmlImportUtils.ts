import JSZip from 'jszip';
import type { ForecastCycle, DayType } from '../../types/outlooks';
import { parseKmlDocument } from './parseKml';
import { forecastCycleFromKmlPlacemarks } from './forecastCycleFromKml';
import type { ForecastImportResult } from './types';
import { MAX_KML_IMPORT_BYTES } from '../forecastImportValidation';

/** Finds the preferred KML entry in an archive, falling back to any .kml file. */
const findKmlEntry = (zip: JSZip): JSZip.JSZipObject => {
  const preferred = zip.file('doc.kml')
    ?? Object.values(zip.files).find((entry) => entry.name.toLowerCase().endsWith('.kml'));
  if (!preferred) throw new Error('KMZ archive does not contain a KML document.');
  return preferred;
};

/** Reads one entry through JSZip's stream so the cap stops decompression instead of checking after it. */
type StreamableKmlEntry = JSZip.JSZipObject & {
  internalStream(type: 'uint8array'): JSZip.JSZipStreamHelper<Uint8Array>;
};

const expandedTooLargeError = (): Error =>
  new Error(`Expanded KML is too large. The maximum supported size is ${MAX_KML_IMPORT_BYTES / 1024 / 1024} MB.`);

/** Expands and validates one KML archive entry. */
// @codescene(disable:"Complex Method")
const expandKmlEntry = async (entry: JSZip.JSZipObject): Promise<string> => {
  const declaredSize = (entry as unknown as { _data?: { uncompressedSize?: number } })._data?.uncompressedSize;
  if (declaredSize !== undefined && declaredSize > MAX_KML_IMPORT_BYTES) {
    throw expandedTooLargeError();
  }

  const stream = (entry as StreamableKmlEntry).internalStream('uint8array');
  const chunks: Uint8Array[] = [];
  let total = 0;

  await new Promise<void>((resolve, reject) => {
    let settled = false;
    const settle = (action: () => void) => {
      if (settled) return;
      settled = true;
      action();
    };

    stream
      .on('data', (chunk) => {
        if (settled) return;
        total += chunk.length;
        if (total > MAX_KML_IMPORT_BYTES) {
          // Pause the worker chain so the forged-metadata case stops decompressing.
          stream.pause();
          settle(() => reject(expandedTooLargeError()));
          return;
        }
        chunks.push(chunk);
      })
      .on('error', (error) => settle(() => reject(error)))
      .on('end', () => settle(resolve))
      .resume();
  });

  const expandedKml = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    expandedKml.set(chunk, offset);
    offset += chunk.length;
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

/** Imports a KML/KMZ transfer into a forecast cycle. The file carries no owner, so the result is unowned. */
export const importKmlTransfer = async (file: File, bytes: Uint8Array | undefined, format: 'kml' | 'kmz', options?: { baseCycle?: ForecastCycle; defaultDay?: DayType }): Promise<ForecastImportResult> => {
  const kml = await readKmlPayload(file, bytes);
  const { placemarks, warnings } = parseKmlDocument(kml, options?.defaultDay ?? options?.baseCycle?.currentDay ?? 1);
  return {
    forecastCycle: forecastCycleFromKmlPlacemarks(placemarks, options?.baseCycle),
    workspaceId: null,
    warnings,
    format,
  };
};
