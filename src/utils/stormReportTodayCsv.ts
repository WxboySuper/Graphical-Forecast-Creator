import type { StormReport } from '../types/stormReports';
import type { ReportType } from '../types/stormReports';
import { parseTodayCsvRow } from './stormReportRows';

const TODAY_SECTION_HEADERS: ReadonlyArray<{ header: string; type: ReportType }> = [
  { header: 'Time,F_Scale', type: 'tornado' },
  { header: 'Time,Speed', type: 'wind' },
  { header: 'Time,Size', type: 'hail' },
];

const parseTodaySectionRows = (
  lines: string[],
  startIndex: number,
  type: ReportType,
): StormReport[] => {
  const reports: StormReport[] = [];
  for (let index = startIndex; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line || line.startsWith('Time,')) {
      break;
    }

    const report = parseTodayCsvRow(line, type);
    if (report) {
      reports.push(report);
    }
  }

  return reports;
};

/** Parses SPC today.csv (Time,F_Scale / Time,Speed / Time,Size sections). */
export const parseTodayStormReportCsv = (csvText: string): StormReport[] => {
  const lines = csvText.split('\n').map((line) => line.trim()).filter(Boolean);

  return TODAY_SECTION_HEADERS.flatMap(({ header, type }) => {
    const headerIndex = lines.findIndex((line) => line.startsWith(header));
    if (headerIndex < 0) {
      return [];
    }

    return parseTodaySectionRows(lines, headerIndex + 1, type);
  });
};
