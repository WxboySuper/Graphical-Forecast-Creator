import { StormReport } from '../types/stormReports';
export { describeStormReportFetchTarget, formatReportDate, resolveStormReportFetchTarget } from './stormReportSource';
import { parseStormReportsCsv } from './stormReportCsv';

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
    const reports = parseStormReportsCsv(text);

    return reports;
  } catch (error) {
    throw error;
  }
}
