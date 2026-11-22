/**
 * Categorical-error banner. Reads the automatic derivation error from forecast
 * state and renders recovery guidance while preserving the last good geometry.
 */
import React from 'react';
import { useSelector } from 'react-redux';
import { selectAutoCategoricalError } from '../../store/forecastSlice';
import './CategoricalErrorBanner.css';

const CategoricalErrorBanner: React.FC = () => {
  const error = useSelector(selectAutoCategoricalError);

  if (!error) {
    return null;
  }

  return (
    <div
      className="gfc-categorical-error-banner"
      role="alert"
      aria-live="assertive"
      data-testid="categorical-error-banner"
    >
      <span className="gfc-categorical-error-title">Categorical generation paused</span>
      <span className="gfc-categorical-error-message">{error}</span>
      <span className="gfc-categorical-error-recovery">
        Your previous categorical geometry is still intact. Fix or simplify the
        probabilistic geometry, then the categorical outlook will regenerate automatically.
      </span>
    </div>
  );
};

export default CategoricalErrorBanner;