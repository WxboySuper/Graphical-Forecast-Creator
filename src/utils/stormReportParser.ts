import { StormReport, ReportType } from '../types/stormReports';
import { v4 as uuidv4 } from 'uuid';
export { describeStormReportFetchTarget, formatReportDate, resolveStormReportFetchTarget } from './stormReportSource';

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

/**
 * Fetches storm reports from NOAA archives for a given date
 * @param date Date in YYMMDD format (e.g., "260130" for January 30, 2026)
 * @returns Promise with array of storm reports
 */
export function fetchStormReports(input: { date: string }): Promise<StormReport[]> {
  const url = `https://www.spc.noaa.gov/climo/reports/${input.date}_rpts_raw.csv`;
  return fetchStormReportsFromUrl({ url });
}

export async function fetchStormReportsFromUrl(input: { url: string }): Promise<StormReport[]> {
  try {
    const response = await fetch(input.url);

    if (!response.ok) {
      throw new Error(`Failed to fetch storm reports: ${response.statusText}`);
    }

    const text = await response.text();
    const reports = parseCSV(text);

    return reports;
  } catch (error) {
    throw error;
  }
}

/**
 * Parses CSV text into storm reports
 */
function parseCSV(csvText: string): StormReport[] {
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

    const report = parseCSVRow({
      row: buildCsvRow(line, headers),
      type: currentSection
    });
    if (report) {
      reports.push(report);
    }
  }

  return reports;
}

/**
 * Parses a single CSV row into a storm report
 */
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
  // Split by comma, but handle quoted fields
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
    tornado: (row) => row.efScale !== 'UNK' && row.efScale ? row.efScale : (row.remarks.match(/EF-?(\d+)/i)?.[1] ? `EF${row.remarks.match(/EF-?(\d+)/i)?.[1]}` : ''),
    wind: (row) => row.speedMph !== 'UNK' && row.speedMph ? `${row.speedMph} mph` : '',
    hail: (row) => row.sizeHundredthsInch !== 'UNK' && row.sizeHundredthsInch
      ? `${(parseInt(row.sizeHundredthsInch, 10) / 100).toFixed(2)}"`
      : ''
  };

  return extractors[input.type](input.row);
}

/** Converts a parsed CSV row into a storm report record. */
function parseCSVRow(input: { row: StormReportCsvRow; type: ReportType }): StormReport | null {
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

/**
 * Parses YYMMDD format to Date object
 */
export function parseReportDate(dateStr: string): Date {
  const year = 2000 + parseInt(dateStr.slice(0, 2));
  const month = parseInt(dateStr.slice(2, 4)) - 1;
  const day = parseInt(dateStr.slice(4, 6));
  return new Date(Date.UTC(year, month, day));
}
