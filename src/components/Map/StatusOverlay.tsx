import React from 'react';
import { useSelector } from 'react-redux';
import { RootState } from '../../store';
import './StatusOverlay.css';

const StatusOverlay: React.FC = () => {
  const isLow = useSelector((state: RootState) => state.forecast.isLowProbability);
  const activeOutlook = useSelector((state: RootState) => state.forecast.drawingState.activeOutlookType);

  if (!isLow) return null;

  const text = activeOutlook === 'categorical'
    ? 'No Thunderstorms Forecasted'
    : 'Probability Too Low';

  return (
    <div className="gfc-status-overlay" role="status" aria-live="polite">
      <div className="gfc-status-badge" title={text} aria-label={text}>
        <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="10" fill="#ffffff" opacity="0.06" />
        </svg>
        <span className="gfc-status-text">{text}</span>
      </div>
    </div>
  );
};

export default StatusOverlay;
