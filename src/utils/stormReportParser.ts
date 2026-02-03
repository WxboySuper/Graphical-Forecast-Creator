import { StormReport, ReportType } from '../types/stormReports';
import { v4 as uuidv4 } from 'uuid';

/**
 * Fetches storm reports from SPC for a given date
 * @param date Date in YYMMDD format (e.g., "260130" for January 30, 2026)
 * @returns Promise with array of storm reports
 */
export async function fetchStormReports(date: string): Promise<StormReport[]> {
  const url = `https://www.spc.noaa.gov/climo/reports/${date}_rpts_raw.csv`;
  
  console.log('=== STARTING STORM REPORT FETCH ===');
  console.log('URL:', url);
  console.log('Date:', date);
  
  try {
    console.log('Fetching from URL...');
    const response = await fetch(url);
    
    console.log('Response received:', {
      status: response.status,
      statusText: response.statusText,
      ok: response.ok,
      headers: {
        contentType: response.headers.get('content-type'),
        contentLength: response.headers.get('content-length'),
      }
    });
    
    if (!response.ok) {
      throw new Error(`Failed to fetch storm reports: ${response.statusText}`);
    }
    
    console.log('Reading response text...');
    const text = await response.text();
    
    console.log('Response text received, length:', text.length);
    console.log('First 1000 characters:', text.substring(0, 1000));
    console.log('Last 500 characters:', text.substring(text.length - 500));
    console.log('Full CSV content:');
    console.log(text);
    
    console.log('\n=== STARTING CSV PARSING ===');
    const reports = parseCSV(text);
    
    console.log('\n=== FETCH COMPLETE ===');
    console.log('Total reports parsed:', reports.length);
    
    return reports;
  } catch (error) {
    console.error('=== ERROR FETCHING STORM REPORTS ===');
    console.error('Error details:', error);
    console.error('Error message:', error instanceof Error ? error.message : String(error));
    console.error('Error stack:', error instanceof Error ? error.stack : 'No stack trace');
    throw error;
  }
}

/**
 * Parses CSV text into storm reports
 */
function parseCSV(csvText: string): StormReport[] {
  console.log('\n--- parseCSV called ---');
  console.log('CSV text length:', csvText.length);
  
  const reports: StormReport[] = [];
  const lines = csvText.split('\n');
  
  console.log('Total lines after split:', lines.length);
  console.log('First 10 lines:', lines.slice(0, 10));
  
  let currentSection: ReportType | null = null;
  let headers: string[] = [];
  let lineNumber = 0;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    lineNumber++;
    
    console.log(`\nLine ${lineNumber} (${line.length} chars):`, line.substring(0, 100));
    
    // Skip empty lines
    if (!line) {
      console.log('  -> Skipping empty line');
      continue;
    }
    
    // Detect section headers
    if (line.includes('Raw Tornado LSR')) {
      console.log('  -> FOUND TORNADO SECTION');
      currentSection = 'tornado';
      continue;
    } else if (line.includes('Raw Wind/Gust LSR') || line.includes('Raw Wind LSR')) {
      console.log('  -> FOUND WIND SECTION');
      currentSection = 'wind';
      continue;
    } else if (line.includes('Raw Hail LSR')) {
      console.log('  -> FOUND HAIL SECTION');
      currentSection = 'hail';
      continue;
    }
    
    // Parse header row
    if (line.startsWith('Time,')) {
      console.log('  -> FOUND HEADER ROW');
      headers = line.split(',');
      console.log('  -> Headers:', headers);
      continue;
    }
    
    // Skip if we don't have a current section
    if (!currentSection) {
      console.log('  -> Skipping (no current section)');
      continue;
    }
    
    if (headers.length === 0) {
      console.log('  -> Skipping (no headers yet)');
      continue;
    }
    
    // Parse data row
    console.log(`  -> Attempting to parse as ${currentSection} data row`);
    try {
      const report = parseCSVRow(line, currentSection, headers);
      if (report) {
        console.log('  -> Successfully parsed report:', {
          type: report.type,
          location: report.location,
          magnitude: report.magnitude,
          lat: report.latitude,
          lon: report.longitude
        });
        reports.push(report);
      } else {
        console.log('  -> parseCSVRow returned null');
      }
    } catch (error) {
      console.warn('  -> Error parsing CSV row:', error, '\n     Line:', line);
    }
  }
  
  console.log('\n--- parseCSV complete ---');
  console.log(`Total reports extracted: ${reports.length}`);
  console.log('Reports by type:', {
    tornado: reports.filter(r => r.type === 'tornado').length,
    wind: reports.filter(r => r.type === 'wind').length,
    hail: reports.filter(r => r.type === 'hail').length
  });
  
  return reports;
}

/**
 * Parses a single CSV row into a storm report
 */
function parseCSVRow(line: string, type: ReportType, headers: string[]): StormReport | null {
  console.log('    parseCSVRow: Starting to parse row');
  console.log('    Type:', type);
  console.log('    Line:', line);
  console.log('    Headers:', headers);
  
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
  
  console.log('    Parsed values:', values);
  console.log('    Values count:', values.length, 'Headers count:', headers.length);
  
  // Create object from headers and values
  const row: Record<string, string> = {};
  headers.forEach((header, index) => {
    row[header] = values[index] || '';
  });
  
  console.log('    Row object:', row);
  
  // Extract coordinates
  const lat = parseFloat(row['LAT']);
  const lon = parseFloat(row['LON']);
  
  console.log('    Coordinates:', { lat, lon, latStr: row['LAT'], lonStr: row['LON'] });
  
  if (isNaN(lat) || isNaN(lon)) {
    console.warn('    Invalid coordinates - skipping row');
    return null;
  }
  
  // Extract time (HHMM format)
  const time = row['Time'] ? `${row['Time']}Z` : '';
  console.log('    Time:', time);
  
  // Extract magnitude based on type
  let magnitude = '';
  if (type === 'tornado') {
    const efScale = row['EF_Scale'];
    console.log('    EF_Scale value:', efScale);
    if (efScale && efScale !== 'UNK') {
      magnitude = efScale;
    } else {
      // Try to extract from remarks
      const remarks = row['Remarks'] || '';
      const efMatch = remarks.match(/EF-?(\d+)/i);
      console.log('    Trying to extract EF from remarks:', efMatch);
      if (efMatch) {
        magnitude = `EF${efMatch[1]}`;
      }
    }
  } else if (type === 'wind') {
    const speed = row['Speed(MPH)'];
    console.log('    Speed value:', speed);
    if (speed && speed !== 'UNK') {
      magnitude = `${speed} mph`;
    }
  } else if (type === 'hail') {
    const size = row['Size(1/100in.)'];
    console.log('    Size value:', size);
    if (size && size !== 'UNK') {
      // Convert from 1/100 inches to inches
      const inches = parseInt(size) / 100;
      magnitude = `${inches.toFixed(2)}"`;
    }
  }
  
  console.log('    Final magnitude:', magnitude);
  
  const report = {
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
  
  console.log('    Created report:', report);
  
  return report;
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
