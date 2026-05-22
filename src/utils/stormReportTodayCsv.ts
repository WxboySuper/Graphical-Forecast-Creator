import type { StormReport } from '../types/stormReports';
import type { ReportType } from '../types/stormReports';
import { parseTodayCsvRow } from './stormReportRows';

const TODAY_SECTION_HEADERS: ReadonlyArray<{ header: string; type: ReportType }> = [
  { header: 'Time,F_Scale', type: 'tornado' },
  { header: 'Time,Speed', type: 'wind' },
  { header: 'Time,Size', type: 'hail' },
];

const parseTodaySection = (
  lines: string[],
  startIndex: number,
  type: ReportType,
): { reports: StormReport[]; nextIndex: number } => {
  const reports: StormReport[] = [];
  let index = startIndex;

  while (index < lines.length && lines[index] && !lines[index].startsWith('Time,')) {
    const report = parseTodayCsvRow(lines[index], type);
    if (report) {
      reports.push(report);
    }
    index += 1;
  }

  return { reports, nextIndex: index };
};

/** Parses SPC today.csv (Time,F_Scale / Time,Speed / Time,Size sections). */
export const parseTodayStormReportCsv = (csvText: string): StormReport[] => {
  const lines = csvText.split('\n').map((line) => line.trim());
  const reports: StormReport[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    if (!line) {
      index += 1;
      continue;
    }

    const section = TODAY_SECTION_HEADERS.find((entry) => line.startsWith(entry.header));
    if (!section) {
      index += 1;
      continue;
    }

    const parsed = parseTodaySection(lines, index + 1, section.type);
    reports.push(...parsed.reports);
    index = parsed.nextIndex;
  }

  return reports;
};
