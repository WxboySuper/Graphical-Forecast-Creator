export type StormReportSource = 'today' | 'yesterday' | 'archive';

export interface StormReportFetchTarget {
  source: StormReportSource;
  url: string;
  reportDate: string;
  label: string;
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
 * Formats a date object to YYMMDD format for NOAA storm report archives.
 */
export function formatReportDate(date: Date): string {
  const year = date.getUTCFullYear().toString().slice(-2);
  const month = (date.getUTCMonth() + 1).toString().padStart(2, '0');
  const day = date.getUTCDate().toString().padStart(2, '0');
  return `${year}${month}${day}`;
}

