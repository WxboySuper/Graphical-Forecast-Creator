import { StormReport, ReportType } from '../types/stormReports';
import { parseArchiveCsvRow, TODAY_SECTION_HEADERS } from './stormReportRows';
import { parseTodayStormReportCsv } from './stormReportTodayCsv';

export { parseTodayStormReportCsv } from './stormReportTodayCsv';

const SPC_STORM_REPORTS_BASE_URL = 'https://www.spc.noaa.gov/climo/reports';
const RAW_ONLY_ARCHIVE_DATES = new Set<string>();

export const SPC_TODAY_STORM_REPORTS_URL = `${SPC_STORM_REPORTS_BASE_URL}/today_filtered.csv`;

export const SPC_YESTERDAY_STORM_REPORTS_URL = `${SPC_STORM_REPORTS_BASE_URL}/yesterday_filtered.csv`;

type ArchiveUrlOptions = { date: string; format?: 'filtered' | 'raw'; referenceDate?: Date };
type CalendarDateParts = { date: Date; year: number; month: number; day: number };
type RollingFeedRequest = { url: string; label: string };

/** Confirms a constructed date kept the requested calendar year, month, and day. */
function isValidCalendarDate({ date, year, month, day }: CalendarDateParts): boolean {
  return date.getFullYear() === year && date.getMonth() === month && date.getDate() === day;
}

/** Builds an SPC archive URL for a valid YYMMDD date and report format. */
function archiveUrlForDate({ date, format = 'filtered', referenceDate = new Date() }: ArchiveUrlOptions): string {
  if (!isValidArchiveDate({ date }, referenceDate)) {
    throw new Error(`Invalid SPC report date: ${date}. Expected YYMMDD.`);
  }
  return `${SPC_STORM_REPORTS_BASE_URL}/${date}_rpts_${format}.csv`;
}

/** Validates the six digit date used by SPC's YYMMDD archive filenames. */
function isValidArchiveDate({ date }: { date: string }, referenceDate = new Date()): boolean {
  if (!/^\d{6}$/.test(date)) {
    return false;
  }
  const parsedDate = parseReportDate(date, referenceDate);
  return !Number.isNaN(parsedDate.getTime()) && parsedDate.getTime() <= referenceDate.getTime();
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

const FILTERED_SECTION_PREFIXES: readonly string[] = TODAY_SECTION_HEADERS.map(({ header }) => normalizeCsvHeader(header));

/** Normalizes header formatting differences without changing the data columns. */
function normalizeCsvHeader(line: string): string {
  return line.replace(/^\uFEFF/, '').replace(/"/g, '').split(',').map((value) => value.trim().toLowerCase()).join(',');
}

function connectionError(context: string): Error {
  return new Error(`${context} Check the connection and try again.`);
}

function httpError(context: string, status: number): Error {
  return new Error(`Failed to load ${context} (HTTP ${status}).`);
}

async function fetchResponseText(url: string, context: string): Promise<{ response: Response; text?: string }> {
  let response: Response;
  try {
    response = await fetch(url);
  } catch {
    throw connectionError(`Could not load ${context}.`);
  }
  if (!response.ok) return { response };
  try {
    return { response, text: await response.text() };
  } catch {
    return { response };
  }
}

/** Finds a section marker at the beginning of a raw archive line. */
function archiveSectionForLine(line: string): ReportType | null {
  const normalizedLine = line.trimStart();
  return ARCHIVE_SECTION_HEADERS.find(({ labels }) => labels.some((label) => normalizedLine.startsWith(label)))?.type ?? null;
}

/** Returns true when the archive contains one of SPC's filtered report sections. */
function hasFilteredArchiveHeaders(csvText: string): boolean {
  return csvText.split('\n').some((line) => {
    const normalized = normalizeCsvHeader(line);
    return FILTERED_SECTION_PREFIXES.some((header) => normalized.startsWith(`${header},`));
  });
}

/** Detects raw section markers within the archive preamble. */
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

    const section = archiveSectionForLine(line);
    if (section) {
      currentSection = section;
      headers = [];
      continue;
    }

    if (normalizeCsvHeader(line).startsWith('time,')) {
      headers = line.replace(/^\uFEFF/, '').replace(/"/g, '').split(',').map((header) => header.trim());
      continue;
    }

    if (!currentSection || headers.length === 0) {
      continue;
    }

    const report = parseArchiveCsvRowSafely(line, currentSection, headers);
    if (report) reports.push(report);
  }

  return reports;
}

/** Detects filtered and raw archive formats and rejects empty or HTML responses. */
function archiveFormatFor(csvText: string): 'filtered' | 'raw' | undefined {
  const trimmedText = csvText.trimStart();
  if (!trimmedText || /^<\s*html\b/i.test(trimmedText)) return undefined;
  let foundRawSection = false;
  for (const line of csvText.split('\n')) {
    const normalized = normalizeCsvHeader(line);
    if (FILTERED_SECTION_PREFIXES.some((header) => normalized.startsWith(`${header},`))) return 'filtered';
    if (!foundRawSection && archiveSectionForLine(line) !== null) foundRawSection = true;
  }
  return foundRawSection ? 'raw' : undefined;
}

/** Parses archived filtered or raw SPC storm report text, rejecting unrecognized bodies. */
export const parseArchiveStormReportCsv = (csvText: string): StormReport[] => {
  const format = archiveFormatFor(csvText);
  if (!format) {
    throw new Error('SPC returned an invalid report archive.');
  }
  return format === 'filtered'
    ? parseTodayStormReportCsv(csvText)
    : parseRawArchiveStormReportCsv({ csvText });
};

/** Parses one raw archive row without stopping the rest of the report file. */
function parseArchiveCsvRowSafely(line: string, section: ReportType, headers: string[]): StormReport | null {
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
  const initialFormat = RAW_ONLY_ARCHIVE_DATES.has(date) ? 'raw' : 'filtered';
  const initialArchiveUrl = archiveUrlForDate({ date, format: initialFormat });
  let archive = await fetchResponseText(initialArchiveUrl, `SPC storm reports for ${date}`);

  // Some older archives have only the raw format. Retry filtered HTTP errors
  // and invalid bodies because the raw counterpart may still be available.
  let reports: StormReport[] | undefined;
  if (archive.text) {
    try {
      reports = parseArchiveStormReportCsv(archive.text);
    } catch {
      reports = undefined;
    }
  }

  if (initialFormat === 'filtered' && (!archive.response.ok || reports === undefined)) {
    if (archive.response.status === 404) RAW_ONLY_ARCHIVE_DATES.add(date);
    archive = await fetchResponseText(archiveUrlForDate({ date, format: 'raw' }), `SPC storm reports for ${date}`);
    reports = undefined;
    if (archive.response.ok && archive.text) {
      try {
        reports = parseArchiveStormReportCsv(archive.text);
      } catch {
        reports = undefined;
      }
    }
  }

  if (!archive.response.ok) {
    throw httpError(`SPC storm reports for ${date}`, archive.response.status);
  }
  if (reports === undefined) {
    throw new Error(`SPC returned an invalid report archive for ${date}.`);
  }
  return reports;
}

/** Fetches a rolling report-day feed (today_filtered.csv / yesterday_filtered.csv). */
const fetchRollingStormReports = async ({ url, label }: RollingFeedRequest): Promise<StormReport[]> => {
  const { response, text } = await fetchResponseText(url, label);
  if (!response.ok) throw httpError(label, response.status);
  if (!text) throw connectionError(`Could not read ${label}.`);
  const csvText = text;
  if (!csvText.trim() || /^\s*<\s*html\b/i.test(csvText) || !hasFilteredArchiveHeaders(csvText)) {
    throw new Error(`SPC returned invalid ${label}.`);
  }
  return parseTodayStormReportCsv(csvText);
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
