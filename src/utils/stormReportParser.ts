import { StormReport, ReportType } from '../types/stormReports';
import { v4 as uuidv4 } from 'uuid';

/**
 * Fetches storm reports from SPC for a given date
 * @param date Date in YYMMDD format (e.g., "260130" for January 30, 2026)
 * @returns Promise with array of storm reports
 */
export async function fetchStormReports(date: string): Promise<StormReport[]> {
  const url = `https://www.spc.noaa.gov/climo/reports/${date}_rpts_raw.csv`;
  
  try {
    const response = await fetch(url);
    
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
      const report = parseCSVRow(line, currentSection, headers);
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
function parseCSVRow(line: string, type: ReportType, headers: string[]): StormReport | null {
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
  const lat = parseFloat(row['LAT']);
  const lon = parseFloat(row['LON']);
  
  if (isNaN(lat) || isNaN(lon)) {
    return null;
  }
  
  // Extract time (HHMM format)
  const time = row['Time'] ? `${row['Time']}Z` : '';
  
  // Extract magnitude based on type
  let magnitude = '';
  if (type === 'tornado') {
    const efScale = row['EF_Scale'];
    if (efScale && efScale !== 'UNK') {
      magnitude = efScale;
    } else {
      // Try to extract from remarks
      const remarks = row['Remarks'] || '';
      const efMatch = remarks.match(/EF-?(\d+)/i);
      if (efMatch) {
        magnitude = `EF${efMatch[1]}`;
      }
    }
  } else if (type === 'wind') {
    const speed = row['Speed(MPH)'];
    if (speed && speed !== 'UNK') {
      magnitude = `${speed} mph`;
    }
  } else if (type === 'hail') {
    const size = row['Size(1/100in.)'];
    if (size && size !== 'UNK') {
      // Convert from 1/100 inches to inches
      const inches = parseInt(size) / 100;
      magnitude = `${inches.toFixed(2)}"`;
    }
  }

  return {
    id: uuidv4(),
    type,
    latitude: lat,
    longitude: lon,
    time,
    magnitude,
    location: row['Location'] || '',
    county: row['County'] || '',
    state: row['State'] || '',
    comments: row['Remarks'] || ''
  };
}

/**
 * Formats a date object to YYMMDD format for SPC API
 */
export function formatDateForSPC(date: Date): string {
  const year = date.getFullYear().toString().slice(-2);
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  return `${year}${month}${day}`;
}

/**
 * Parses YYMMDD format to Date object
 */
export function parseSPCDate(dateStr: string): Date {
  const year = 2000 + parseInt(dateStr.slice(0, 2));
  const month = parseInt(dateStr.slice(2, 4)) - 1;
  const day = parseInt(dateStr.slice(4, 6));
  return new Date(year, month, day);
}
