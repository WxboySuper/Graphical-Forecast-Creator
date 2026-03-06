import React, { useState, useMemo } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { RootState } from '../../store';
import {
  setReports,
  setDate,
  setLoading,
  setError,
  toggleVisibility,
  toggleReportType,
  clearReports
} from '../../store/stormReportsSlice';
import { selectVerificationOutlooksForDay } from '../../store/verificationSlice';
import { fetchStormReports, formatReportDate } from '../../utils/stormReportParser';
import { analyzeVerification, formatVerificationSummary } from '../../utils/verificationUtils';
import type { OutlookTypeVerification, VerificationResult } from '../../utils/verificationUtils';
import { DayType } from '../../types/outlooks';
import './VerificationPanel.css';

interface VerificationPanelProps {
  activeOutlookType?: 'categorical' | 'tornado' | 'wind' | 'hail';
  selectedDay?: DayType;
}

type ActiveOutlookType = NonNullable<VerificationPanelProps['activeOutlookType']>;

interface ReportTypeFilter {
  tornado: boolean;
  wind: boolean;
  hail: boolean;
}

interface ReportCounts {
  tornado: number;
  wind: number;
  hail: number;
}

const RISK_LEVEL_ORDER = ['TSTM', 'MRGL', 'SLGT', 'ENH', 'MDT', 'HIGH', '2%', '5%', '10%', '15%', '30%', '45%', '60%', 'SIG'];

const getReportCounts = (reports: { type: 'tornado' | 'wind' | 'hail' }[]): ReportCounts => ({
  tornado: reports.filter((r) => r.type === 'tornado').length,
  wind: reports.filter((r) => r.type === 'wind').length,
  hail: reports.filter((r) => r.type === 'hail').length
});

const ErrorBanner: React.FC<{ error: string }> = ({ error }) => {
  const isInfo = error.startsWith('info:');
  const message = isInfo ? error.replace('info:', '') : error;
  const icon = isInfo ? 'ℹ️' : '⚠️';

  return (
    <div className={isInfo ? 'info-message' : 'error-message'}>
      <p>{icon} {message}</p>
    </div>
  );
};

const ReportSummarySection: React.FC<{ date: string | null; totalReports: number; reportCounts: ReportCounts }> = ({
  date,
  totalReports,
  reportCounts
}) => (
  <div className="verification-section">
    <h3>Report Summary</h3>
    <div className="report-summary">
      <p><strong>Date:</strong> {date}</p>
      <p><strong>Total Reports:</strong> {totalReports}</p>
      <ul>
        <li>Tornado: {reportCounts.tornado}</li>
        <li>Wind: {reportCounts.wind}</li>
        <li>Hail: {reportCounts.hail}</li>
      </ul>
    </div>
  </div>
);

const DisplayOptionsSection: React.FC<{ visible: boolean; onToggleVisibility: () => void }> = ({
  visible,
  onToggleVisibility
}) => (
  <div className="verification-section">
    <h3>Display Options</h3>
    <div className="display-controls">
      <label className="checkbox-label">
        <input
          type="checkbox"
          checked={visible}
          onChange={onToggleVisibility}
        />
        <span>Show Reports on Map</span>
      </label>
    </div>
  </div>
);

const FilterByTypeSection: React.FC<{
  visible: boolean;
  filterByType: ReportTypeFilter;
  reportCounts: ReportCounts;
  onToggleType: (type: 'tornado' | 'wind' | 'hail') => void;
}> = ({ visible, filterByType, reportCounts, onToggleType }) => {
  if (!visible) {
    return null;
  }

  return (
    <div className="verification-section">
      <h3>Filter by Type</h3>
      <div className="filter-controls">
        <label className="checkbox-label tornado-label">
          <input
            type="checkbox"
            checked={filterByType.tornado}
            onChange={() => onToggleType('tornado')}
          />
          <span>🌪️ Tornado ({reportCounts.tornado})</span>
        </label>
        <label className="checkbox-label wind-label">
          <input
            type="checkbox"
            checked={filterByType.wind}
            onChange={() => onToggleType('wind')}
          />
          <span>💨 Wind ({reportCounts.wind})</span>
        </label>
        <label className="checkbox-label hail-label">
          <input
            type="checkbox"
            checked={filterByType.hail}
            onChange={() => onToggleType('hail')}
          />
          <span>🧊 Hail ({reportCounts.hail})</span>
        </label>
      </div>
    </div>
  );
};

const VerificationAnalysisSection: React.FC<{
  verificationResult: VerificationResult;
  activeOutlookType: ActiveOutlookType;
}> = ({ verificationResult, activeOutlookType }) => {
  const activeVerification = verificationResult[activeOutlookType] as OutlookTypeVerification;
  const riskEntries = Object.entries(activeVerification.byRiskLevel).sort(
    (a, b) => RISK_LEVEL_ORDER.indexOf(b[0].toUpperCase()) - RISK_LEVEL_ORDER.indexOf(a[0].toUpperCase())
  );

  return (
    <div className="verification-section">
      <h3>Verification Analysis - {activeOutlookType.charAt(0).toUpperCase() + activeOutlookType.slice(1)}</h3>
      <div className="verification-results">
        <div className="verification-metrics">
          <div className="metric">
            <span className="metric-label">Hit Rate:</span>
            <span className="metric-value">{activeVerification.hitRate.toFixed(1)}%</span>
          </div>
          <div className="metric">
            <span className="metric-label">Hits:</span>
            <span className="metric-value hit">{activeVerification.hits}</span>
          </div>
          <div className="metric">
            <span className="metric-label">Misses:</span>
            <span className="metric-value miss">{activeVerification.misses}</span>
          </div>
        </div>

        {riskEntries.length > 0 && (
          <div className="risk-level-breakdown">
            <h4>By Risk Level:</h4>
            <div className="risk-level-stats">
              {riskEntries.map(([level, data]) => (
                <div key={level} className="risk-level-stat">
                  <span className="risk-level-name">{level}:</span>
                  <span className="risk-level-value">
                    {data.hits} hits ({data.hitRate.toFixed(1)}%)
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        <details className="verification-details">
          <summary>View Detailed Summary</summary>
          <pre className="verification-summary">
            {formatVerificationSummary(verificationResult, activeOutlookType)}
          </pre>
        </details>
        <p className="verification-note">
          <small>
            <strong>Note:</strong> A "hit" means the report falls within the forecast outlook area.
            Risk levels show how many reports fell within each specific risk category.
          </small>
        </p>
      </div>
    </div>
  );
};

const VerificationPanel: React.FC<VerificationPanelProps> = ({ 
  activeOutlookType = 'categorical',
  selectedDay = 1
}) => {
  const dispatch = useDispatch();
  const { date, loading, error, visible, filterByType, reports } = useSelector(
    (state: RootState) => state.stormReports
  );
  const outlooks = useSelector((state: RootState) => selectVerificationOutlooksForDay(state, selectedDay));
  
  // Calculate verification results when reports or outlooks change
  const verificationResult = useMemo(() => {
    if (reports.length === 0) return null;
    return analyzeVerification(reports, outlooks);
  }, [reports, outlooks]);

  const [selectedDate, setSelectedDate] = useState<string>(() => {
    // Default to today's date
    const today = new Date();
    return today.toISOString().split('T')[0];
  });
  
  const handleLoadReports = async () => {
    try {
      dispatch(setLoading(true));
      dispatch(setError(null));
      
      // Parse YYYY-MM-DD string directly to avoid timezone issues
      const [year, month, day] = selectedDate.split('-').map(Number);
      const dateObj = new Date(year, month - 1, day); // month is 0-indexed

      // Check if the selected date is today in local time
      const today = new Date();
      const isToday = 
        dateObj.getFullYear() === today.getFullYear() && 
        dateObj.getMonth() === today.getMonth() && 
        dateObj.getDate() === today.getDate();

      if (isToday) {
        dispatch(setError('info:Storm reports are not available for the current day until later.'));
        dispatch(setLoading(false));
        return;
      }

      const reportDate = formatReportDate(dateObj);
      const fetchedReports = await fetchStormReports(reportDate);

      dispatch(setReports(fetchedReports));
      dispatch(setDate(reportDate));

      if (fetchedReports.length === 0) {
        dispatch(setError('info:No storm reports found for this date.'));
      }
    } catch (err) {
      dispatch(setError(
        err instanceof Error ? err.message : 'Failed to load storm reports. The date may not have available data.'
      ));
    } finally {
      dispatch(setLoading(false));
    }
  };
  
  const handleClearReports = () => {
    dispatch(clearReports());
  };
  
  const handleToggleVisibility = () => {
    dispatch(toggleVisibility());
  };
  
  const handleToggleType = (type: 'tornado' | 'wind' | 'hail') => {
    dispatch(toggleReportType(type));
  };

  const reportCounts = getReportCounts(reports);
  const totalReports = reports.length;
  const hasReports = totalReports > 0;
  
  return (
    <div className="verification-panel">
      <h2>Storm Reports Verification</h2>
      
      <div className="verification-section">
        <h3>Load Reports</h3>
        <div className="date-selector">
          <label htmlFor="report-date">
            Select Date:
            <input
              type="date"
              id="report-date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              disabled={loading}
              max={new Date().toISOString().split('T')[0]}
            />
          </label>
          <button
            onClick={handleLoadReports}
            disabled={loading}
            className="load-button"
          >
            {loading ? 'Loading...' : 'Load Reports'}
          </button>
        </div>

        {error && <ErrorBanner error={error} />}
      </div>

      {hasReports && (
        <>
          <ReportSummarySection
            date={date}
            totalReports={totalReports}
            reportCounts={reportCounts}
          />

          <DisplayOptionsSection
            visible={visible}
            onToggleVisibility={handleToggleVisibility}
          />

          <FilterByTypeSection
            visible={visible}
            filterByType={filterByType}
            reportCounts={reportCounts}
            onToggleType={handleToggleType}
          />

          {verificationResult && (
            <VerificationAnalysisSection
              verificationResult={verificationResult}
              activeOutlookType={activeOutlookType}
            />
          )}

          <div className="verification-section">
            <button
              onClick={handleClearReports}
              className="clear-button"
            >
              Clear Reports
            </button>
          </div>
        </>
      )}
      
      <div className="verification-info">
        <p><small>
          Storm reports are loaded from the NOAA Storm Prediction Center archives.
          Data may not be available for all dates.
        </small></p>
      </div>
    </div>
  );
};

export default VerificationPanel;
