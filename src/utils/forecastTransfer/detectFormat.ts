import type { ForecastTransferFormat } from './types';

const KML_EXTENSIONS = new Set(['.kml', '.kmz']);
const JSON_EXTENSIONS = new Set(['.json', '.gfc']);
const PACKAGE_EXTENSIONS = new Set(['.zip']);

const hasExtension = (name: string, extensions: Set<string>): boolean =>
  [...extensions].some((ext) => name.endsWith(ext));

/** Detects the forecast transfer format from file metadata. */
export const detectForecastTransferFormat = (file: File, bytes?: Uint8Array): ForecastTransferFormat | null => {
  const lowerName = file.name.toLowerCase();

  if (hasExtension(lowerName, KML_EXTENSIONS)) {
    return lowerName.endsWith('.kmz') ? 'kmz' : 'kml';
  }

  if (hasExtension(lowerName, JSON_EXTENSIONS)) {
    return 'json';
  }

  if (
    hasExtension(lowerName, PACKAGE_EXTENSIONS)
    || file.type === 'application/zip'
    || (bytes?.[0] === 0x50 && bytes?.[1] === 0x4b)
  ) {
    return 'package';
  }

  if (file.type === 'application/vnd.google-earth.kml+xml' || file.type === 'application/vnd.google-earth.kmz') {
    return lowerName.endsWith('.kmz') ? 'kmz' : 'kml';
  }

  return null;
};
