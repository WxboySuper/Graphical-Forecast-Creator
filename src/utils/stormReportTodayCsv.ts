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

    const sectionStart = index + 1;
    reports.push(...parseTodaySectionRows(lines, sectionStart, section.type));
    index = sectionStart;
    while (index < lines.length && lines[index] && !lines[index].startsWith('Time,')) {
      index += 1;
    }
  }

  return reports;
};
