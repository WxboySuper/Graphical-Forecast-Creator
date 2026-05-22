import { useEffect, useMemo, useState } from 'react';
import type { AddToastFn } from '../components/Layout';
import type { MonitorOutlookLayerType } from './types';
import type { StormReport } from '../types/stormReports';
import { fetchTodayStormReports } from '../utils/stormReportParser';
import { filterVisibleStormReports } from './filterVisibleStormReports';

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

  const visibleReports = useMemo(
    () => filterVisibleStormReports(
      reports,
      { filterTornado, filterWind, filterHail },
      matchOutlookType,
      outlookType,
    ),
    [filterHail, filterTornado, filterWind, matchOutlookType, outlookType, reports],
  );

  return {
    reports: visibleReports,
    loading,
    error,
    fetchedAt,
    totalCount: reports.length,
  };
};
