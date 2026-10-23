import type { StormReport, ReportType } from '../types/stormReports';
import { parseTodayCsvRow, TODAY_SECTION_HEADERS } from './stormReportRows';
import { isStormReportCsvHeaderLine, normalizeStormReportCsvHeader } from './stormReportCsv';

type TodayReportsByType = Record<ReportType, StormReport[]>;

const createReportBuckets = (): TodayReportsByType => ({
  tornado: [],
  wind: [],
  hail: [],
});

const NORMALIZED_TODAY_HEADERS = TODAY_SECTION_HEADERS.map(({ header, type }) => ({
  prefix: normalizeStormReportCsvHeader(header),
  type,
}));

/** Finds a known filtered-feed section header without normalizing every row. */
const getTodaySectionType = ({ line }: { line: string }): ReportType | undefined => {
  if (!isStormReportCsvHeaderLine(line)) return undefined;
  const normalizedHeader = normalizeStormReportCsvHeader(line);
  return NORMALIZED_TODAY_HEADERS.find(({ prefix }) => normalizedHeader.startsWith(prefix))?.type;
};

const flattenReports = (reportsByType: TodayReportsByType): StormReport[] => [
  ...reportsByType.tornado,
  ...reportsByType.wind,
  ...reportsByType.hail,
];

/** Parses SPC today.csv (Time,F_Scale / Time,Speed / Time,Size sections). */
export const parseTodayStormReportCsv = (csvText: string): StormReport[] => {
  const lines = csvText.split('\n').map((line) => line.trim()).filter(Boolean);
  const reportsByType = createReportBuckets();
  let activeType: ReportType | undefined;

  for (const line of lines) {
    const sectionType = getTodaySectionType({ line });
    if (isStormReportCsvHeaderLine(line)) {
      // Preserve the former parser's boundary behavior for unknown sections.
      activeType = sectionType;
      continue;
    }

    if (!activeType) {
      continue;
    }

    const report = parseTodayCsvRow(line, activeType);
    if (report) {
      reportsByType[activeType].push(report);
    }
  }

  return flattenReports(reportsByType);
};
