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
  const values: string[] = [];
  let currentValue = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      values.push(currentValue);
      currentValue = '';
    } else {
      currentValue += char;
    }
  }

  values.push(currentValue);
  const rowMap = headers.reduce<Record<string, string>>((acc, header, index) => {
    acc[header] = values[index] || '';
    return acc;
  }, {});

  return {
    time: rowMap['Time'] || '',
    latitude: rowMap['LAT'] || '',
    longitude: rowMap['LON'] || '',
    efScale: rowMap['EF_Scale'] || '',
    speedMph: rowMap['Speed(MPH)'] || '',
    sizeHundredthsInch: rowMap['Size(1/100in.)'] || '',
    location: rowMap['Location'] || '',
    county: rowMap['County'] || '',
    state: rowMap['State'] || '',
    remarks: rowMap['Remarks'] || ''
  };
}

/** Extracts a report magnitude from a parsed CSV row using the row's hazard type. */
function extractMagnitude(input: { row: StormReportCsvRow; type: ReportType }): string {
  const extractors: Record<ReportType, (row: StormReportCsvRow) => string> = {
    tornado: (row) => row.efScale !== 'UNK' && row.efScale
      ? row.efScale
      : row.remarks.match(/EF-?(\d+)/i)?.[1]
        ? `EF${row.remarks.match(/EF-?(\d+)/i)?.[1]}`
        : '',
    wind: (row) => row.speedMph !== 'UNK' && row.speedMph ? `${row.speedMph} mph` : '',
    hail: (row) => row.sizeHundredthsInch !== 'UNK' && row.sizeHundredthsInch
      ? `${(parseInt(row.sizeHundredthsInch, 10) / 100).toFixed(2)}"`
      : ''
  };

  return extractors[input.type](input.row);
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
