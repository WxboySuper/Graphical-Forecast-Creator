import { StormReport, ReportType } from '../types/stormReports';
import { parseArchiveCsvRow, TODAY_SECTION_HEADERS } from './stormReportRows';
import { parseTodayStormReportCsv } from './stormReportTodayCsv';
import { isStormReportCsvHeaderLine, normalizeStormReportCsvHeader } from './stormReportCsv';

export { parseTodayStormReportCsv } from './stormReportTodayCsv';

const SPC_STORM_REPORTS_BASE_URL = 'https://www.spc.noaa.gov/climo/reports';
const RAW_ONLY_ARCHIVE_DATES = new Map<string, number>();
const RAW_ONLY_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const RAW_ONLY_CACHE_LIMIT = 32;

export const SPC_TODAY_STORM_REPORTS_URL = `${SPC_STORM_REPORTS_BASE_URL}/today_filtered.csv`;

export const SPC_YESTERDAY_STORM_REPORTS_URL = `${SPC_STORM_REPORTS_BASE_URL}/yesterday_filtered.csv`;

type ArchiveUrlOptions = { date: string; format?: 'filtered' | 'raw'; referenceDate?: Date };
type ArchiveDateValidation = { date: string; referenceDate?: Date };
type ArchiveYearResolution = { shortYear: number; referenceYear: number };
type TextContext = { csvText: string };
type ErrorContext = { context: string };
type HttpErrorContext = ErrorContext & { status: number };
type CsvLine = { line: string };
type ArchiveRowContext = { line: string; section: ReportType; headers: string[] };
type FetchTextRequest = { url: string; context: string };
type FetchedResponseText = { response: Response; text?: string; bodyError?: unknown };
type ParsedArchiveResponse = FetchedResponseText & { reports?: StormReport[]; parseError?: unknown };
type CalendarDateParts = { date: Date; year: number; month: number; day: number };
type RollingFeedRequest = { url: string; label: string };

/** Confirms a constructed date kept the requested calendar year, month, and day. */
function isValidCalendarDate({ date, year, month, day }: CalendarDateParts): boolean {
  return date.getFullYear() === year && date.getMonth() === month && date.getDate() === day;
}

/** Builds an SPC archive URL for a valid YYMMDD date and report format. */
function archiveUrlForDate({ date, format = 'filtered', referenceDate = new Date() }: ArchiveUrlOptions): string {
  if (!isValidArchiveDate({ date, referenceDate })) {
    const parsedDate = /^\d{6}$/u.test(date) ? parseReportDate(date, referenceDate) : new Date(Number.NaN);
    if (!Number.isNaN(parsedDate.getTime()) && parsedDate.getTime() > referenceDate.getTime()) {
      throw new Error(`SPC report date is in the future: ${date}. Choose a published report day.`);
    }
    throw new Error(`Invalid SPC report date: ${date}. Expected YYMMDD.`);
  }
  return `${SPC_STORM_REPORTS_BASE_URL}/${date}_rpts_${format}.csv`;
}

/** Validates the six digit date used by SPC's YYMMDD archive filenames. */
function isValidArchiveDate({ date, referenceDate = new Date() }: ArchiveDateValidation): boolean {
  if (!/^\d{6}$/u.test(date)) {
    return false;
  }
  const parsedDate = parseReportDate(date, referenceDate);
  return !Number.isNaN(parsedDate.getTime()) && parsedDate.getTime() <= referenceDate.getTime();
}

/** Applies the rolling-century rule used for SPC YYMMDD archive dates. */
function resolveArchiveYear({ shortYear, referenceYear }: ArchiveYearResolution): number {
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

const FILTERED_SECTION_PREFIXES: readonly string[] = TODAY_SECTION_HEADERS.map(({ header }) => normalizeStormReportCsvHeader(header));

/** Creates user guidance for network failures without exposing transport details. */
function connectionError({ context }: ErrorContext): Error {
  return new Error(`${context} Check the connection and try again.`);
}

/** Formats an HTTP failure with its source context and status code. */
function httpError({ context, status }: HttpErrorContext): Error {
  return new Error(`Failed to load ${context} (HTTP ${status}).`);
}

/** Fetches a response and reads its body while preserving a friendly network error. */
async function fetchResponseText({ url, context }: FetchTextRequest): Promise<FetchedResponseText> {
  let response: Response;
  try {
    response = await fetch(url);
  } catch {
    throw connectionError({ context: `Could not load ${context}.` });
  }
  if (!response.ok) return { response };
  try {
    return { response, text: await response.text() };
  } catch (bodyError) {
    return { response, bodyError };
  }
}

/** Finds a section marker at the beginning of a raw archive line. */
function archiveSectionForLine({ line }: CsvLine): ReportType | null {
  const normalizedLine = line.replace(/^\uFEFF/u, '').replace(/"/gu, '').trimStart().toLowerCase();
  return ARCHIVE_SECTION_HEADERS.find(({ labels }) => labels.some((label) => normalizedLine.startsWith(label.toLowerCase())))?.type ?? null;
}

/** Returns true when the archive contains one of SPC's filtered report sections. */
function hasFilteredArchiveHeaders({ csvText }: TextContext): boolean {
  return csvText.split('\n').some((line) => {
    if (!isStormReportCsvHeaderLine(line)) return false;
    const normalized = normalizeStormReportCsvHeader(line);
    return FILTERED_SECTION_PREFIXES.some((header) => normalized.startsWith(`${header},`));
  });
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
      headers = [];
      continue;
    }

    if (isStormReportCsvHeaderLine(line)) {
      headers = line.replace(/^\uFEFF/u, '').replace(/"/gu, '').split(',').map((header) => header.trim());
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

/** Detects filtered and raw archive formats and rejects empty or HTML responses. */
function archiveFormatFor({ csvText }: TextContext): 'filtered' | 'raw' | undefined {
  const trimmedText = csvText.trimStart();
  if (!trimmedText || /^<\s*html\b/iu.test(trimmedText)) return undefined;
  let foundRawSection = false;
  for (const line of csvText.split('\n')) {
    if (isStormReportCsvHeaderLine(line)) {
      const normalized = normalizeStormReportCsvHeader(line);
      if (FILTERED_SECTION_PREFIXES.some((header) => normalized.startsWith(`${header},`))) return 'filtered';
    }
    if (!foundRawSection && archiveSectionForLine({ line }) !== null) foundRawSection = true;
  }
  return foundRawSection ? 'raw' : undefined;
}

/** Parses archived filtered or raw SPC storm report text, rejecting unrecognized bodies. */
export const parseArchiveStormReportCsv = (csvText: string): StormReport[] => {
  const format = archiveFormatFor({ csvText });
  if (!format) {
    throw new Error('SPC returned an invalid report archive.');
  }
  return format === 'filtered'
    ? parseTodayStormReportCsv(csvText)
    : parseRawArchiveStormReportCsv({ csvText });
};

/** Parses one raw archive row without stopping the rest of the report file. */
function parseArchiveCsvRowSafely({ line, section, headers }: ArchiveRowContext): StormReport | null {
  try {
    return parseArchiveCsvRow(line, section, headers);
  } catch {
    return null;
  }
}

/** Loads and parses an archive response while retaining diagnostics for callers. */
async function loadParsedArchive(url: string, date: string): Promise<ParsedArchiveResponse> {
  const archive = await fetchResponseText({ url, context: `SPC storm reports for ${date}` });
  if (!archive.response.ok || !archive.text) return archive;
  try {
    return { ...archive, reports: parseArchiveStormReportCsv(archive.text) };
  } catch (parseError) {
    return { ...archive, parseError };
  }
}

/** Returns parsed reports or raises a friendly invalid-archive error. */
function requireArchiveReports(archive: ParsedArchiveResponse, date: string): StormReport[] {
  if (archive.reports !== undefined) return archive.reports;
  throw new Error(`SPC returned an invalid report archive for ${date}.`, {
    cause: new AggregateError([archive.parseError, archive.bodyError].filter((error) => error !== undefined)),
  });
}

/** Fetches storm reports from NOAA archives for a date in YYMMDD format. */
export async function fetchStormReports(date: string): Promise<StormReport[]> {
  const context = `SPC storm reports for ${date}`;
  const initialFormat = shouldUseRawArchive(date) ? 'raw' : 'filtered';
  const filtered = await loadParsedArchive(archiveUrlForDate({ date, format: initialFormat }), date);

  if (initialFormat === 'raw') {
    if (!filtered.response.ok) throw httpError({ context, status: filtered.response.status });
    return requireArchiveReports(filtered, date);
  }
  if (filtered.reports !== undefined) return filtered.reports;
  rememberRawArchive(date);

  const raw = await loadParsedArchive(archiveUrlForDate({ date, format: 'raw' }), date);
  if (!raw.response.ok) {
    throw new Error(`SPC report archives failed for ${date} (filtered HTTP ${filtered.response.status}; raw HTTP ${raw.response.status}).`);
  }
  if (raw.reports === undefined) {
    throw new Error(`SPC returned invalid report archives for ${date}.`, {
      cause: new AggregateError([filtered.parseError, filtered.bodyError, raw.parseError, raw.bodyError].filter((error) => error !== undefined)),
    });
  }
  return raw.reports;
}

/** Reuses a short-lived raw-archive probe result and bounds session memory. */
function shouldUseRawArchive(date: string): boolean {
  const expiresAt = RAW_ONLY_ARCHIVE_DATES.get(date);
  if (expiresAt === undefined) return false;
  if (expiresAt <= Date.now()) {
    RAW_ONLY_ARCHIVE_DATES.delete(date);
    return false;
  }
  return true;
}

/** Caches a raw-only archive briefly so a later filtered archive is retried. */
function rememberRawArchive(date: string): void {
  const now = Date.now();
  for (const [cachedDate, expiresAt] of RAW_ONLY_ARCHIVE_DATES) {
    if (expiresAt <= now) RAW_ONLY_ARCHIVE_DATES.delete(cachedDate);
  }
  if (RAW_ONLY_ARCHIVE_DATES.size >= RAW_ONLY_CACHE_LIMIT) {
    const oldestDate = RAW_ONLY_ARCHIVE_DATES.keys().next().value;
    if (oldestDate !== undefined) RAW_ONLY_ARCHIVE_DATES.delete(oldestDate);
  }
  RAW_ONLY_ARCHIVE_DATES.set(date, now + RAW_ONLY_CACHE_TTL_MS);
}

/** Fetches a rolling report-day feed (today_filtered.csv / yesterday_filtered.csv). */
const fetchRollingStormReports = async ({ url, label }: RollingFeedRequest): Promise<StormReport[]> => {
  const { response, text } = await fetchResponseText({ url, context: label });
  return parseRollingStormReports({ response, text, label });
};

/** Validates a rolling feed and parses its filtered sections. */
function parseRollingStormReports({ response, text, label }: Pick<RollingFeedRequest, 'label'> & { response: Response; text?: string }): StormReport[] {
  if (!response.ok) throw httpError({ context: label, status: response.status });
  if (!text) throw connectionError({ context: `Could not read ${label}.` });
  if (!text.trim()) throw new Error(`SPC returned invalid ${label}.`);
  if (/^\s*<\s*html\b/iu.test(text)) throw new Error(`SPC returned invalid ${label}.`);
  if (!hasFilteredArchiveHeaders({ csvText: text })) throw new Error(`SPC returned invalid ${label}.`);
  return parseTodayStormReportCsv(text);
}

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
  if (!/^\d{6}$/u.test(dateStr)) {
    return new Date(Number.NaN);
  }

  const shortYear = parseInt(dateStr.slice(0, 2), 10);
  const year = resolveArchiveYear({ shortYear, referenceYear: referenceDate.getFullYear() });
  const month = parseInt(dateStr.slice(2, 4), 10) - 1;
  const day = parseInt(dateStr.slice(4, 6), 10);
  const parsedDate = new Date(year, month, day);
  if (!isValidCalendarDate({ date: parsedDate, year, month, day })) {
    return new Date(Number.NaN);
  }

  return parsedDate;
}
