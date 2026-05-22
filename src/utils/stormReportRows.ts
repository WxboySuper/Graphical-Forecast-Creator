import { v4 as uuidv4 } from 'uuid';
import type { ReportType, StormReport } from '../types/stormReports';
import { buildCsvRow, extractStormReportMagnitude, splitCsvLine } from './stormReportCsv';
import type { StormReportRowFieldMap } from './stormReportCsv';

const parseStormReportRow = (
  line: string,
  type: ReportType,
  headers: string[],
  fields: StormReportRowFieldMap,
): StormReport | null => {
  const row = buildCsvRow(headers, splitCsvLine(line));
  const lat = parseFloat(row[fields.latField]);
  const lon = parseFloat(row[fields.lonField]);

  if (Number.isNaN(lat) || Number.isNaN(lon)) {
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

export const parseTodayCsvRow = (line: string, type: ReportType): StormReport | null => {
  const headers = type === 'tornado'
    ? ['Time', 'F_Scale', 'Location', 'County', 'State', 'Lat', 'Lon', 'Comments']
    : type === 'wind'
      ? ['Time', 'Speed', 'Location', 'County', 'State', 'Lat', 'Lon', 'Comments']
      : ['Time', 'Size', 'Location', 'County', 'State', 'Lat', 'Lon', 'Comments'];

  return parseStormReportRow(line, type, headers, {
    scaleField: type === 'tornado' ? 'F_Scale' : undefined,
    speedField: type === 'wind' ? 'Speed' : undefined,
    sizeField: type === 'hail' ? 'Size' : undefined,
    latField: 'Lat',
    lonField: 'Lon',
    remarksField: 'Comments',
  });
};

export const parseArchiveCsvRow = (
  line: string,
  type: ReportType,
  headers: string[],
): StormReport | null =>
  parseStormReportRow(line, type, headers, {
    scaleField: 'EF_Scale',
    speedField: 'Speed(MPH)',
    sizeField: 'Size(1/100in.)',
    latField: 'LAT',
    lonField: 'LON',
    remarksField: 'Remarks',
  });
