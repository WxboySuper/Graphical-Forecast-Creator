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
import { DayType } from '../../types/outlooks';
import './VerificationPanel.css';

interface VerificationPanelProps {
  activeOutlookType?: 'categorical' | 'tornado' | 'wind' | 'hail';
  selectedDay?: DayType;
}

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
  
  // Get the verification data for the active outlook type
  const activeVerification = verificationResult ? verificationResult[activeOutlookType] : null;
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
      const reportDate = formatReportDate(dateObj);
      
      const fetchedReports = await fetchStormReports(reportDate);
      
      dispatch(setReports(fetchedReports));
      dispatch(setDate(reportDate));
      
      if (fetchedReports.length === 0) {
        dispatch(setError('No storm reports found for this date.'));
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
  
  // Count reports by type
  const reportCounts = {
    tornado: reports.filter(r => r.type === 'tornado').length,
    wind: reports.filter(r => r.type === 'wind').length,
    hail: reports.filter(r => r.type === 'hail').length
  };
  
  const totalReports = reports.length;
  
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
        
        {error && (
          <div className="error-message">
            <p>⚠️ {error}</p>
          </div>
        )}
      </div>
      
      {totalReports > 0 && (
        <>
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
          
          <div className="verification-section">
            <h3>Display Options</h3>
            <div className="display-controls">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={visible}
                  onChange={handleToggleVisibility}
                />
                <span>Show Reports on Map</span>
              </label>
            </div>
          </div>
          
          {visible && (
            <div className="verification-section">
              <h3>Filter by Type</h3>
              <div className="filter-controls">
                <label className="checkbox-label tornado-label">
                  <input
                    type="checkbox"
                    checked={filterByType.tornado}
                    onChange={() => handleToggleType('tornado')}
                  />
                  <span>🌪️ Tornado ({reportCounts.tornado})</span>
                </label>
                <label className="checkbox-label wind-label">
                  <input
                    type="checkbox"
                    checked={filterByType.wind}
                    onChange={() => handleToggleType('wind')}
                  />
                  <span>💨 Wind ({reportCounts.wind})</span>
                </label>
                <label className="checkbox-label hail-label">
                  <input
                    type="checkbox"
                    checked={filterByType.hail}
                    onChange={() => handleToggleType('hail')}
                  />
                  <span>🧊 Hail ({reportCounts.hail})</span>
                </label>
              </div>
            </div>
          )}
          
          {activeVerification && (
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
                
                {Object.keys(activeVerification.byRiskLevel).length > 0 && (
                  <div className="risk-level-breakdown">
                    <h4>By Risk Level:</h4>
                    <div className="risk-level-stats">
                      {Object.entries(activeVerification.byRiskLevel)
                        .sort((a, b) => {
                          // Sort by risk level
                          const order = ['TSTM', 'MRGL', 'SLGT', 'ENH', 'MDT', 'HIGH', '2%', '5%', '10%', '15%', '30%', '45%', '60%', 'SIG'];
                          return order.indexOf(b[0].toUpperCase()) - order.indexOf(a[0].toUpperCase());
                        })
                        .map(([level, data]) => {
                          return (
                            <div key={level} className="risk-level-stat">
                              <span className="risk-level-name">{level}:</span>
                              <span className="risk-level-value">
                                {data.hits} hits ({data.hitRate.toFixed(1)}%)
                              </span>
                            </div>
                          );
                        })}
                    </div>
                  </div>
                )}
                
                <details className="verification-details">
                  <summary>View Detailed Summary</summary>
                  <pre className="verification-summary">
                    {formatVerificationSummary(verificationResult!, activeOutlookType)}
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
