import { StormReport } from '../types/stormReports';
export { describeStormReportFetchTarget, formatReportDate, resolveStormReportFetchTarget } from './stormReportSource';
import { parseStormReportsCsv } from './stormReportCsv';

/**
 * Fetches storm reports from NOAA archives for a given date.
 * Supports both the legacy positional YYMMDD string and the object form used by newer callers.
 * @param input Date in YYMMDD format or an object containing that date.
 * @returns Promise with array of storm reports
 */
export function fetchStormReports(input: string | { date: string }): Promise<StormReport[]> {
  const date = typeof input === 'string' ? input : input.date;
  const url = `https://www.spc.noaa.gov/climo/reports/${date}_rpts_raw.csv`;
  return fetchStormReportsFromUrl({ url });
}

/** Fetches storm reports from a specific SPC CSV URL and parses the response. */
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
