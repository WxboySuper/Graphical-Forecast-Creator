import { StormReport, ReportType } from '../types/stormReports';
import { v4 as uuidv4 } from 'uuid';

export const SPC_TODAY_STORM_REPORTS_URL = 'https://www.spc.noaa.gov/climo/reports/today.csv';

const archiveUrlForDate = (date: string): string =>
  `https://www.spc.noaa.gov/climo/reports/${date}_rpts_raw.csv`;

/**
 * Fetches storm reports from NOAA archives for a given date
 * @param date Date in YYMMDD format (e.g., "260130" for January 30, 2026)
 * @returns Promise with array of storm reports
 */
export async function fetchStormReports(date: string): Promise<StormReport[]> {
  const response = await fetch(archiveUrlForDate(date));

  if (!response.ok) {
    throw new Error(`Failed to fetch storm reports: ${response.statusText}`);
  }

  return parseArchiveStormReportCsv(await response.text());
}

/** Fetches same-day SPC storm reports (today.csv). */
export async function fetchTodayStormReports(): Promise<StormReport[]> {
  const response = await fetch(SPC_TODAY_STORM_REPORTS_URL);

  if (!response.ok) {
    throw new Error(`Failed to fetch today's storm reports: ${response.statusText}`);
  }

  return parseTodayStormReportCsv(await response.text());
}

/** Parses SPC today.csv (Time,F_Scale / Time,Speed / Time,Size sections). */
export const parseTodayStormReportCsv = (csvText: string): StormReport[] => {
  const lines = csvText.split('\n').map((line) => line.trim());
  const reports: StormReport[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    if (!line) {
      index += 1;
      continue;
    }

    if (line.startsWith('Time,F_Scale')) {
      index += 1;
      while (index < lines.length && lines[index] && !lines[index].startsWith('Time,')) {
        const report = parseTodayCsvRow(lines[index], 'tornado');
        if (report) {
          reports.push(report);
        }
        index += 1;
      }
      continue;
    }

    if (line.startsWith('Time,Speed')) {
      index += 1;
      while (index < lines.length && lines[index] && !lines[index].startsWith('Time,')) {
        const report = parseTodayCsvRow(lines[index], 'wind');
        if (report) {
          reports.push(report);
        }
        index += 1;
      }
      continue;
    }

    if (line.startsWith('Time,Size')) {
      index += 1;
      while (index < lines.length && lines[index] && !lines[index].startsWith('Time,')) {
        const report = parseTodayCsvRow(lines[index], 'hail');
        if (report) {
          reports.push(report);
        }
        index += 1;
      }
      continue;
    }

    index += 1;
  }

  return reports;
};

/**
 * Parses archived *_rpts_raw.csv storm report text.
 */
export const parseArchiveStormReportCsv = (csvText: string): StormReport[] => {
  const reports: StormReport[] = [];
  const lines = csvText.split('\n');
  
  let currentSection: ReportType | null = null;
  let headers: string[] = [];
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    // Skip empty lines
    if (!line) {
      continue;
    }
    
    // Detect section headers
    if (line.includes('Raw Tornado LSR')) {
      currentSection = 'tornado';
      continue;
    } else if (line.includes('Raw Wind/Gust LSR') || line.includes('Raw Wind LSR')) {
      currentSection = 'wind';
      continue;
    } else if (line.includes('Raw Hail LSR')) {
      currentSection = 'hail';
      continue;
    }
    
    // Parse header row
    if (line.startsWith('Time,')) {
      headers = line.split(',');
      continue;
    }
    
    // Skip if we don't have a current section
    if (!currentSection) {
      continue;
    }
    
    if (headers.length === 0) {
      continue;
    }
    
    // Parse data row
    try {
      const report = parseArchiveCsvRow(line, currentSection, headers);
      if (report) {
        reports.push(report);
      }
    } catch {
      continue;
    }
  }
  
  return reports;
}

/**
 * Parses a single CSV row into a storm report
 */
const parseTodayCsvRow = (line: string, type: ReportType): StormReport | null => {
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

const parseArchiveCsvRow = (line: string, type: ReportType, headers: string[]): StormReport | null =>
  parseStormReportRow(line, type, headers, {
    scaleField: 'EF_Scale',
    speedField: 'Speed(MPH)',
    sizeField: 'Size(1/100in.)',
    latField: 'LAT',
    lonField: 'LON',
    remarksField: 'Remarks',
  });

interface StormReportRowFieldMap {
  scaleField?: string;
  speedField?: string;
  sizeField?: string;
  latField: string;
  lonField: string;
  remarksField: string;
}

const parseStormReportRow = (
  line: string,
  type: ReportType,
  headers: string[],
  fields: StormReportRowFieldMap,
): StormReport | null => {
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
  values.push(currentValue); // Push the last value
  
  // Create object from headers and values
  const row: Record<string, string> = {};
  headers.forEach((header, index) => {
    row[header] = values[index] || '';
  });
  
  // Extract coordinates
  const lat = parseFloat(row[fields.latField]);
  const lon = parseFloat(row[fields.lonField]);
  
  if (isNaN(lat) || isNaN(lon)) {
    return null;
  }
  
  // Extract time (HHMM format)
  const time = row['Time'] ? `${row['Time']}Z` : '';
  
  // Extract magnitude based on type
  let magnitude = '';
  const remarks = row[fields.remarksField] || '';

  if (type === 'tornado') {
    const scaleField = fields.scaleField ? row[fields.scaleField] : '';
    if (scaleField && scaleField !== 'UNK') {
      magnitude = scaleField.startsWith('EF') ? scaleField : `EF${scaleField}`;
    } else {
      const efMatch = remarks.match(/EF-?(\d+)/i);
      if (efMatch) {
        magnitude = `EF${efMatch[1]}`;
      }
    }
  } else if (type === 'wind') {
    const speed = fields.speedField ? row[fields.speedField] : '';
    if (speed && speed !== 'UNK') {
      magnitude = speed.toLowerCase().includes('mph') ? speed : `${speed} mph`;
    }
  } else if (type === 'hail') {
    const size = fields.sizeField ? row[fields.sizeField] : '';
    if (size && size !== 'UNK') {
      if (size.includes('.')) {
        magnitude = `${size}"`;
      } else {
        const inches = parseInt(size, 10) / 100;
        magnitude = Number.isNaN(inches) ? '' : `${inches.toFixed(2)}"`;
      }
    }
  }

  return {
    id: uuidv4(),
    type,
    latitude: lat,
    longitude: lon,
    time,
    magnitude,
    location: row.Location || '',
    county: row.County || '',
    state: row.State || '',
    comments: remarks,
  };
};

/**
 * Formats a date object to YYMMDD format for NOAA storm report archives
 */
export function formatReportDate(date: Date): string {
  const year = date.getFullYear().toString().slice(-2);
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  return `${year}${month}${day}`;
}

/**
 * Parses YYMMDD format to Date object
 */
export function parseReportDate(dateStr: string): Date {
  const year = 2000 + parseInt(dateStr.slice(0, 2));
  const month = parseInt(dateStr.slice(2, 4)) - 1;
  const day = parseInt(dateStr.slice(4, 6));
  return new Date(year, month, day);
}
