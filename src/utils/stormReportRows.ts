import { v4 as uuidv4 } from 'uuid';
import type { ReportType, StormReport } from '../types/stormReports';
import { buildCsvRow, extractStormReportMagnitude, splitCsvLine, type StormReportRowFieldMap } from './stormReportCsv';

export type TodaySectionDescriptor = {
  header: string;
  rowHeaders: readonly string[];
};

export type TodaySectionHeader = {
  header: string;
  type: ReportType;
};

/** Shared today.csv section and row schema used by parsing and benchmarks. */
export const TODAY_SECTION_DESCRIPTORS: Record<ReportType, TodaySectionDescriptor> = {
  tornado: {
    header: 'Time,F_Scale',
    rowHeaders: ['Time', 'F_Scale', 'Location', 'County', 'State', 'Lat', 'Lon', 'Comments'],
  },
  wind: {
    header: 'Time,Speed',
    rowHeaders: ['Time', 'Speed', 'Location', 'County', 'State', 'Lat', 'Lon', 'Comments'],
  },
  hail: {
    header: 'Time,Size',
    rowHeaders: ['Time', 'Size', 'Location', 'County', 'State', 'Lat', 'Lon', 'Comments'],
  },
};

export const TODAY_SECTION_HEADERS: ReadonlyArray<TodaySectionHeader> = (
  Object.keys(TODAY_SECTION_DESCRIPTORS) as ReportType[]
).map((type) => ({
  header: TODAY_SECTION_DESCRIPTORS[type].header,
  type,
}));

const ARCHIVE_HEADER_ALIASES: Readonly<Record<string, string>> = {
  time: 'Time',
  ef_scale: 'EF_Scale',
  'speed(mph)': 'Speed(MPH)',
  'size(1/100in.)': 'Size(1/100in.)',
  location: 'Location',
  county: 'County',
  state: 'State',
  lat: 'LAT',
  lon: 'LON',
  remarks: 'Remarks',
};

/** SPC coordinates outside these limits cannot describe a real report. */
const MAX_LATITUDE = 90;
const MAX_LONGITUDE = 180;

/**
 * Rejects missing, non-finite, and out-of-range coordinates. `parseFloat`
 * turns `1e999` into Infinity, which `Number.isNaN` never caught, and
 * verification builds bounding boxes from these values.
 */
const hasUsableCoordinates = (latitude: number, longitude: number): boolean =>
  Number.isFinite(latitude) &&
  Number.isFinite(longitude) &&
  Math.abs(latitude) <= MAX_LATITUDE &&
  Math.abs(longitude) <= MAX_LONGITUDE;

/** Parses one normalized storm-report CSV row using the supplied column mapping. */

const parseStormReportRow = (
  line: string,
  type: ReportType,
  headers: string[],
  fields: StormReportRowFieldMap,
): StormReport | null => {
  const row = buildCsvRow(headers, splitCsvLine(line));
  const lat = parseFloat(row[fields.latField]);
  const lon = parseFloat(row[fields.lonField]);

  if (!hasUsableCoordinates(lat, lon)) {
    return null;
  }

  return {
    id: uuidv4(),
    type,
    latitude: lat,
    longitude: lon,
    time: row.Time ? `${row.Time}Z` : '',
    magnitude: extractStormReportMagnitude(type, row, fields),
    location: row.Location || '',
    county: row.County || '',
    state: row.State || '',
    comments: row[fields.remarksField] || '',
  };
};

/** Parses one today.csv report row for the given report type. */
export const parseTodayCsvRow = (line: string, type: ReportType): StormReport | null => {
  const { rowHeaders } = TODAY_SECTION_DESCRIPTORS[type];

  return parseStormReportRow(line, type, [...rowHeaders], {
    scaleField: type === 'tornado' ? 'F_Scale' : undefined,
    speedField: type === 'wind' ? 'Speed' : undefined,
    sizeField: type === 'hail' ? 'Size' : undefined,
    latField: 'Lat',
    lonField: 'Lon',
    remarksField: 'Comments',
  });
};

/** Parses one archive CSV row using the archive header aliases. */
export const parseArchiveCsvRow = (
  line: string,
  type: ReportType,
  headers: string[],
): StormReport | null => {
  const normalizedHeaders = headers.map((header) => ARCHIVE_HEADER_ALIASES[header.trim().toLowerCase()] ?? header.trim());
  return parseStormReportRow(line, type, normalizedHeaders, {
    scaleField: 'EF_Scale',
    speedField: 'Speed(MPH)',
    sizeField: 'Size(1/100in.)',
    latField: 'LAT',
    lonField: 'LON',
    remarksField: 'Remarks',
  });
};
