import { v4 as uuidv4 } from 'uuid';
import type { StormReport, ReportType } from '../types/stormReports';

interface StormReportCsvRow {
  time: string;
  latitude: string;
  longitude: string;
  efScale: string;
  speedMph: string;
  sizeHundredthsInch: string;
  location: string;
  county: string;
  state: string;
  remarks: string;
}

const CSV_ROW_FIELDS = [
  ['time', 'Time'],
  ['latitude', 'LAT'],
  ['longitude', 'LON'],
  ['efScale', 'EF_Scale'],
  ['speedMph', 'Speed(MPH)'],
  ['sizeHundredthsInch', 'Size(1/100in.)'],
  ['location', 'Location'],
  ['county', 'County'],
  ['state', 'State'],
  ['remarks', 'Remarks'],
] as const;

/** Parses CSV text into storm reports. */
export function parseStormReportsCsv(csvText: string): StormReport[] {
  const reports: StormReport[] = [];
  const lines = csvText.split('\n');

  let currentSection: ReportType | null = null;
  let headers: string[] = [];

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      continue;
    }

    const section = getReportSection(line);
    if (section) {
      currentSection = section;
      continue;
    }

    if (line.startsWith('Time,')) {
      headers = line.split(',');
      continue;
    }

    if (!currentSection || headers.length === 0) {
      continue;
    }

    const report = parseCsvRow({
      row: buildCsvRow(line, headers),
      type: currentSection
    });
    if (report) {
      reports.push(report);
    }
  }

  return reports;
}

/** Determines which report section a CSV line belongs to. */
function getReportSection(line: string): ReportType | null {
  if (line.includes('Raw Tornado LSR')) {
    return 'tornado';
  }

  if (line.includes('Raw Wind/Gust LSR') || line.includes('Raw Wind LSR')) {
    return 'wind';
  }

  if (line.includes('Raw Hail LSR')) {
    return 'hail';
  }

  return null;
}

/** Converts one CSV line into a typed row object the parser can work with. */
function buildCsvRow(line: string, headers: string[]): StormReportCsvRow {
  const values = splitCsvLine(line);
  const rowMap = buildRowMap(headers, values);

  return CSV_ROW_FIELDS.reduce<StormReportCsvRow>((row, [field, header]) => {
    row[field] = getCsvField(rowMap, header);
    return row;
  }, {
    time: '',
    latitude: '',
    longitude: '',
    efScale: '',
    speedMph: '',
    sizeHundredthsInch: '',
    location: '',
    county: '',
    state: '',
    remarks: '',
  });
}

/** Extracts a report magnitude from a parsed CSV row using the row's hazard type. */
function extractMagnitude(input: { row: StormReportCsvRow; type: ReportType }): string {
  switch (input.type) {
    case 'tornado':
      return extractTornadoMagnitude(input.row);
    case 'wind':
      return extractWindMagnitude(input.row);
    case 'hail':
      return extractHailMagnitude(input.row);
    default:
      return '';
  }
}

/** Converts a parsed CSV row into a storm report record. */
function parseCsvRow(input: { row: StormReportCsvRow; type: ReportType }): StormReport | null {
  const lat = parseFloat(input.row.latitude);
  const lon = parseFloat(input.row.longitude);

  if (Number.isNaN(lat) || Number.isNaN(lon)) {
    return null;
  }

  return {
    id: uuidv4(),
    type: input.type,
    latitude: lat,
    longitude: lon,
    time: input.row.time ? `${input.row.time}Z` : '',
    magnitude: extractMagnitude(input),
    location: input.row.location,
    county: input.row.county,
    state: input.row.state,
    comments: input.row.remarks
  };
}

/** Splits a CSV line while preserving quoted commas. */
function splitCsvLine(line: string): string[] {
  return line.split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/).map((value) => value.replaceAll('"', ''));
}

/** Builds a header-to-value lookup from one CSV line. */
function buildRowMap(headers: string[], values: string[]): Record<string, string> {
  return headers.reduce<Record<string, string>>((acc, header, index) => {
    acc[header] = values[index] ?? '';
    return acc;
  }, {});
}

/** Returns a CSV field value or an empty string when the field is missing. */
function getCsvField(rowMap: Record<string, string>, header: string): string {
  return rowMap[header] ?? '';
}

/** Pulls the tornado magnitude from either the EF scale or the remarks text. */
function extractTornadoMagnitude(row: StormReportCsvRow): string {
  if (row.efScale && row.efScale !== 'UNK') {
    return row.efScale;
  }

  const efMatch = row.remarks.match(/EF-?(\d+)/i);
  return efMatch ? `EF${efMatch[1]}` : '';
}

/** Pulls the wind magnitude when the SPC report includes a valid speed. */
function extractWindMagnitude(row: StormReportCsvRow): string {
  return row.speedMph && row.speedMph !== 'UNK' ? `${row.speedMph} mph` : '';
}

/** Pulls the hail magnitude when the SPC report includes a valid size. */
function extractHailMagnitude(row: StormReportCsvRow): string {
  return row.sizeHundredthsInch && row.sizeHundredthsInch !== 'UNK'
    ? `${(parseInt(row.sizeHundredthsInch, 10) / 100).toFixed(2)}"`
    : '';
}
