import { useEffect, useMemo, useState } from 'react';
import type { AddToastFn } from '../components/Layout';
import type { MonitorOutlookLayerType } from './types';
import type { ReportType, StormReport } from '../types/stormReports';
import { fetchTodayStormReports } from '../utils/stormReportParser';

interface UseMonitorStormReportsArgs {
  enabled: boolean;
  filterTornado: boolean;
  filterWind: boolean;
  filterHail: boolean;
  matchOutlookType: boolean;
  outlookType: MonitorOutlookLayerType;
  refreshToken: number;
  addToast: AddToastFn;
}

const isTypeEnabled = (
  type: ReportType,
  filters: { filterTornado: boolean; filterWind: boolean; filterHail: boolean },
): boolean => {
  if (type === 'tornado') {
    return filters.filterTornado;
  }
  if (type === 'wind') {
    return filters.filterWind;
  }
  return filters.filterHail;
};

export const useMonitorStormReports = ({
  enabled,
  filterTornado,
  filterWind,
  filterHail,
  matchOutlookType,
  outlookType,
  refreshToken,
  addToast,
}: UseMonitorStormReportsArgs) => {
  const [reports, setReports] = useState<StormReport[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fetchedAt, setFetchedAt] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) {
      setReports([]);
      setError(null);
      setLoading(false);
      return;
    }

    let active = true;
    setLoading(true);
    setError(null);

    fetchTodayStormReports()
      .then((nextReports) => {
        if (!active) {
          return;
        }

        setReports(nextReports);
        setFetchedAt(new Date().toISOString());
      })
      .catch(() => {
        if (!active) {
          return;
        }

        setReports([]);
        setError('Storm reports are unavailable right now.');
        addToast('SPC storm reports could not be loaded.', 'warning');
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [addToast, enabled, refreshToken]);

  const visibleReports = useMemo(() => {
    const filters = { filterTornado, filterWind, filterHail };

    return reports.filter((report) => {
      if (!isTypeEnabled(report.type, filters)) {
        return false;
      }

      if (matchOutlookType && outlookType !== 'categorical') {
        return report.type === outlookType;
      }

      return true;
    });
  }, [filterHail, filterTornado, filterWind, matchOutlookType, outlookType, reports]);

  return {
    reports: visibleReports,
    loading,
    error,
    fetchedAt,
    totalCount: reports.length,
  };
};
