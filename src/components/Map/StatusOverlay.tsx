import React from 'react';
import { useSelector } from 'react-redux';
import { RootState } from '../../store';
import { selectIsLowProbability } from '../../store/forecastSlice';
import './StatusOverlay.css';

const StatusOverlay: React.FC = () => {
  const isLow = useSelector(selectIsLowProbability);
  const activeOutlook = useSelector((state: RootState) => state.forecast.drawingState.activeOutlookType);

  if (!isLow) return null;

  const text = activeOutlook === 'categorical'
    ? 'No Thunderstorms Forecasted'
    : 'Probability Too Low';

  return (
    <div className="gfc-status-overlay" role="status" aria-live="polite">
      <div className="gfc-status-badge" title={text} aria-label={text}>
        <span className="gfc-status-text">{text}</span>
      </div>
    </div>
  );
};

export default StatusOverlay;
