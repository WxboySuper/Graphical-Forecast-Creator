import { StormReport, ReportType } from '../types/stormReports';
import { parseArchiveCsvRow, TODAY_SECTION_HEADERS } from './stormReportRows';
import { parseTodayStormReportCsv } from './stormReportTodayCsv';

export { parseTodayStormReportCsv } from './stormReportTodayCsv';

const SPC_STORM_REPORTS_BASE_URL = 'https://www.spc.noaa.gov/climo/reports';

export const SPC_TODAY_STORM_REPORTS_URL = `${SPC_STORM_REPORTS_BASE_URL}/today_filtered.csv`;

export const SPC_YESTERDAY_STORM_REPORTS_URL = `${SPC_STORM_REPORTS_BASE_URL}/yesterday_filtered.csv`;

type ArchiveUrlOptions = { date: string; format?: 'filtered' | 'raw' };
type CalendarDateParts = { date: Date; year: number; month: number; day: number };
type ArchiveRowContext = { line: string; section: ReportType; headers: string[] };
type RollingFeedRequest = { url: string; label: string };

/** Confirms a constructed date kept the requested calendar year, month, and day. */
function isValidCalendarDate({ date, year, month, day }: CalendarDateParts): boolean {
  return date.getFullYear() === year && date.getMonth() === month && date.getDate() === day;
}

/** Builds an SPC archive URL for a valid YYMMDD date and report format. */
function archiveUrlForDate({ date, format = 'filtered' }: ArchiveUrlOptions): string {
  if (!isValidArchiveDate({ date })) {
    throw new Error(`Invalid SPC report date: ${date}. Expected YYMMDD.`);
  }
  return `${SPC_STORM_REPORTS_BASE_URL}/${date}_rpts_${format}.csv`;
}

/** Validates the six digit date used by SPC's YYMMDD archive filenames. */
function isValidArchiveDate({ date }: { date: string }): boolean {
  if (!/^\d{6}$/.test(date)) {
    return false;
  }
  const year = resolveArchiveYear(Number(date.slice(0, 2)), new Date().getFullYear());
  const month = Number(date.slice(2, 4)) - 1;
  const day = Number(date.slice(4, 6));
  return isValidCalendarDate({ date: new Date(year, month, day), year, month, day });
}

/** Applies the rolling-century rule used for SPC YYMMDD archive dates. */
function resolveArchiveYear(shortYear: number, referenceYear: number): number {
  const currentCentury = Math.floor(referenceYear / 100) * 100;
  let year = currentCentury + shortYear;
  if (year > referenceYear + 1) year -= 100;
  return year;
}

const ARCHIVE_SECTION_HEADERS: readonly { labels: readonly string[]; type: ReportType }[] = [
  { labels: ['Tornado LSR', 'Raw Tornado LSR'], type: 'tornado' },
  { labels: ['Wind/Gust LSR', 'Wind LSR', 'Raw Wind/Gust LSR', 'Raw Wind LSR'], type: 'wind' },
  { labels: ['Hail LSR', 'Raw Hail LSR'], type: 'hail' },
];

/** Finds a section marker at the beginning of a raw archive line. */
function archiveSectionForLine({ line }: { line: string }): ReportType | null {
  return ARCHIVE_SECTION_HEADERS.find(({ labels }) => labels.some((label) => line.startsWith(label)))?.type ?? null;
}

/** Returns true when the archive contains one of SPC's filtered report sections. */
function hasFilteredArchiveHeaders({ csvText }: { csvText: string }): boolean {
  const sectionHeaders = TODAY_SECTION_HEADERS.map(({ header }) => `${header},`);
  return csvText.split('\n', 50).some((line) => sectionHeaders.some((header) => line.trim().startsWith(header)));
}

/** Detects raw section markers within the archive preamble. */
function hasRawArchiveHeaders({ csvText }: { csvText: string }): boolean {
  return csvText.split('\n', 50).some((line) => archiveSectionForLine({ line: line.trim() }) !== null);
}

/** Parses the sectioned raw archive format, ignoring malformed rows. */
function parseRawArchiveStormReportCsv({ csvText }: { csvText: string }): StormReport[] {
  const reports: StormReport[] = [];
  const lines = csvText.split('\n');

  let currentSection: ReportType | null = null;
  let headers: string[] = [];

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (!line) {
      continue;
    }

    const section = archiveSectionForLine({ line });
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

    const report = parseArchiveCsvRowSafely({ line, section: currentSection, headers });
    if (report) reports.push(report);
  }

  return reports;
}

/** Rejects empty, HTML, and unrecognized archive responses before parsing. */
function isRecognizedArchiveResponse({ csvText }: { csvText: string }): boolean {
  const trimmedText = csvText.trimStart();
  if (!trimmedText) return false;
  if (/^<\s*html\b/i.test(trimmedText)) return false;
  if (hasFilteredArchiveHeaders({ csvText })) return true;
  return hasRawArchiveHeaders({ csvText });
}

/** Parses archived filtered or raw SPC storm report text. */
export const parseArchiveStormReportCsv = (csvText: string): StormReport[] =>
  hasFilteredArchiveHeaders({ csvText })
    ? parseTodayStormReportCsv(csvText)
    : parseRawArchiveStormReportCsv({ csvText });

/** Parses one raw archive row without stopping the rest of the report file. */
function parseArchiveCsvRowSafely({ line, section, headers }: ArchiveRowContext): StormReport | null {
  try {
    return parseArchiveCsvRow(line, section, headers);
  } catch {
    return null;
  }
}

/**
 * Fetches storm reports from NOAA archives for a given date
 * @param date Date in YYMMDD format (e.g., "260130" for January 30, 2026)
 * @returns Promise with array of storm reports
 */
export async function fetchStormReports(date: string): Promise<StormReport[]> {
  const filteredArchiveUrl = archiveUrlForDate({ date });
  let response: Response;
  try {
    response = await fetch(filteredArchiveUrl);
  } catch {
    throw new Error(`Could not load SPC storm reports for ${date}. Check the connection and try again.`);
  }

  // Some older SPC archive dates have a raw CSV but no filtered counterpart.
  if (response.status === 404) {
    try {
      response = await fetch(archiveUrlForDate({ date, format: 'raw' }));
    } catch {
      throw new Error(`Could not load SPC storm reports for ${date}. Check the connection and try again.`);
    }
  }

  if (!response.ok) {
    throw new Error(`SPC storm reports for ${date} are unavailable (HTTP ${response.status}).`);
  }

  const csvText = await response.text();
  if (!isRecognizedArchiveResponse({ csvText })) {
    throw new Error(`SPC returned an invalid report archive for ${date}.`);
  }
  return parseArchiveStormReportCsv(csvText);
}

/** Fetches a rolling report-day feed (today_filtered.csv / yesterday_filtered.csv). */
const fetchRollingStormReports = async ({ url, label }: RollingFeedRequest): Promise<StormReport[]> => {
  let response: Response;
  try {
    response = await fetch(url);
  } catch {
    throw new Error(`Could not load ${label}. Check the connection and try again.`);
  }

  if (!response.ok) {
    throw new Error(`Failed to fetch ${label} (HTTP ${response.status}).`);
  }

  return parseTodayStormReportCsv(await response.text());
};

/** Fetches same-day SPC storm reports (today_filtered.csv). */
export function fetchTodayStormReports(): Promise<StormReport[]> {
  return fetchRollingStormReports({ url: SPC_TODAY_STORM_REPORTS_URL, label: "today's storm reports" });
}

/** Fetches the previous report day's SPC storm reports (yesterday_filtered.csv). */
export function fetchYesterdayStormReports(): Promise<StormReport[]> {
  return fetchRollingStormReports({ url: SPC_YESTERDAY_STORM_REPORTS_URL, label: "yesterday's storm reports" });
}

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
export function parseReportDate(dateStr: string, referenceDate = new Date()): Date {
  if (!/^\d{6}$/.test(dateStr)) {
    return new Date(Number.NaN);
  }

  const shortYear = parseInt(dateStr.slice(0, 2), 10);
  const year = resolveArchiveYear(shortYear, referenceDate.getFullYear());
  const month = parseInt(dateStr.slice(2, 4), 10) - 1;
  const day = parseInt(dateStr.slice(4, 6), 10);
  const parsedDate = new Date(year, month, day);
  if (!isValidCalendarDate({ date: parsedDate, year, month, day })) {
    return new Date(Number.NaN);
  }

  return parsedDate;
}
