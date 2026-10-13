import type { StormReport, ReportType } from '../types/stormReports';
import { parseTodayCsvRow, TODAY_SECTION_HEADERS } from './stormReportRows';

type TodayReportsByType = Record<ReportType, StormReport[]>;

const createReportBuckets = (): TodayReportsByType => ({
  tornado: [],
  wind: [],
  hail: [],
});

/** Normalizes an SPC CSV header before matching its section schema. */
const normalizeHeader = ({ line }: { line: string }): string =>
  line.replace(/^\uFEFF/u, '').replace(/"/gu, '').split(',').map((value) => value.trim().toLowerCase()).join(',');

const getTodaySectionType = ({ line }: { line: string }): ReportType | undefined => {
  const normalizedLine = normalizeHeader({ line });
  return TODAY_SECTION_HEADERS.find(({ header }) => normalizedLine.startsWith(normalizeHeader({ line: header })))?.type;
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
    if (normalizeHeader({ line }).startsWith('time,')) {
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
