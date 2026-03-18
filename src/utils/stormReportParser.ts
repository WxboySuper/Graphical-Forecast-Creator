import { StormReport, ReportType } from '../types/stormReports';
import { v4 as uuidv4 } from 'uuid';

export type StormReportSource = 'today' | 'yesterday' | 'archive';

export interface StormReportFetchTarget {
  source: StormReportSource;
  url: string;
  reportDate: string;
  label: string;
}

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

/** Formats a UTC date into a stable YYYY-MM-DD key. */
const formatUtcDateKey = (date: Date): string => {
  const year = date.getUTCFullYear().toString();
  const month = (date.getUTCMonth() + 1).toString().padStart(2, '0');
  const day = date.getUTCDate().toString().padStart(2, '0');
  return `${year}-${month}-${day}`;
};

/** Truncates a date to UTC midnight for day-level comparisons. */
const toUtcDateOnly = (date: Date): Date => new Date(Date.UTC(
  date.getUTCFullYear(),
  date.getUTCMonth(),
  date.getUTCDate()
));

/** Adds a UTC day offset without crossing local-time boundaries. */
const addUtcDays = (date: Date, days: number): Date => new Date(Date.UTC(
  date.getUTCFullYear(),
  date.getUTCMonth(),
  date.getUTCDate() + days
));

/**
 * Resolves the SPC storm-report source for a selected calendar day.
 * Today and yesterday use the live SPC endpoints; all other dates use the archive CSV path.
 */
export function resolveStormReportFetchTarget(input: { selectedDate: string; now?: Date }): StormReportFetchTarget {
  const { selectedDate, now = new Date() } = input;
  const [year, month, day] = selectedDate.split('-').map(Number);
  const selectedUtcDate = new Date(Date.UTC(year, month - 1, day));
  const currentUtcDate = toUtcDateOnly(now);
  const yesterdayUtcDate = addUtcDays(currentUtcDate, -1);

  const reportDate = formatReportDate(selectedUtcDate);

  if (formatUtcDateKey(selectedUtcDate) === formatUtcDateKey(currentUtcDate)) {
    return {
      source: 'today',
      url: 'https://www.spc.noaa.gov/climo/reports/today.csv',
      reportDate,
      label: 'today.csv'
    };
  }

  if (formatUtcDateKey(selectedUtcDate) === formatUtcDateKey(yesterdayUtcDate)) {
    return {
      source: 'yesterday',
      url: 'https://www.spc.noaa.gov/climo/reports/yesterday.csv',
      reportDate,
      label: 'yesterday.csv'
    };
  }

  return {
    source: 'archive',
    url: `https://www.spc.noaa.gov/climo/reports/${reportDate}_rpts_raw.csv`,
    reportDate,
    label: `${reportDate}_rpts_raw.csv`
  };
}

/**
 * Returns a user-facing label for a resolved storm report source.
 */
export function describeStormReportFetchTarget(target: StormReportFetchTarget): string {
  const prettyDate = `${target.reportDate.slice(0, 2)}/${target.reportDate.slice(2, 4)}/${target.reportDate.slice(4, 6)}`;

  const messages: Record<StormReportSource, string> = {
    today: `Loaded storm reports from SPC today.csv for ${prettyDate}.`,
    yesterday: `Loaded storm reports from SPC yesterday.csv for ${prettyDate}.`,
    archive: `Loaded storm reports from SPC archive for ${prettyDate}.`
  };

  return messages[target.source];
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

/**
 * Fetches storm reports from a specific SPC CSV URL.
 */
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

function extractMagnitude(type: ReportType, row: StormReportCsvRow): string {
  if (type === 'tornado') {
    if (row.efScale && row.efScale !== 'UNK') {
      return row.efScale;
    }

    const efMatch = row.remarks.match(/EF-?(\d+)/i);
    if (efMatch) {
      return `EF${efMatch[1]}`;
    }
  }

  if (type === 'wind' && row.speedMph && row.speedMph !== 'UNK') {
    return `${row.speedMph} mph`;
  }

  if (type === 'hail' && row.sizeHundredthsInch && row.sizeHundredthsInch !== 'UNK') {
    const inches = parseInt(row.sizeHundredthsInch, 10) / 100;
    return `${inches.toFixed(2)}"`;
  }

  return '';
}

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
    magnitude: extractMagnitude(input.type, input.row),
    location: input.row.location,
    county: input.row.county,
    state: input.row.state,
    comments: input.row.remarks
  };
}

/**
 * Formats a date object to YYMMDD format for NOAA storm report archives
 */
export function formatReportDate(date: Date): string {
  const year = date.getUTCFullYear().toString().slice(-2);
  const month = (date.getUTCMonth() + 1).toString().padStart(2, '0');
  const day = date.getUTCDate().toString().padStart(2, '0');
  return `${year}${month}${day}`;
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
