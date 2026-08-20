import type { MonitorOutlookLayerType } from './types';
import type { ReportType, StormReport } from '../types/stormReports';

interface StormReportFilters {
  filterTornado: boolean;
  filterWind: boolean;
  filterHail: boolean;
}

const isTypeEnabled = (type: ReportType, filters: StormReportFilters): boolean => {
  if (type === 'tornado') {
    return filters.filterTornado;
  }
  if (type === 'wind') {
    return filters.filterWind;
  }
  return filters.filterHail;
};

export const filterVisibleStormReports = (
  reports: StormReport[],
  filters: StormReportFilters,
  matchOutlookType: boolean,
  outlookType: MonitorOutlookLayerType,
): StormReport[] =>
  reports.filter((report) => {
    if (!isTypeEnabled(report.type, filters)) {
      return false;
    }

    if (matchOutlookType && outlookType !== 'categorical') {
      return report.type === outlookType;
    }

    return true;
  });
