/**
 * Unofficial forecast badge. Provides the persistent educational-use warning shown
 * on map surfaces without owning forecast or safety decisions.
 */
import React from 'react';
import './UnofficialBadge.css';

const UnofficialBadge: React.FC = () => (
  <div className="unofficial-badge" aria-label="This is an unofficial forecast for educational purposes only">
    <div className="unofficial-badge-inner">
      <span className="unofficial-badge-dot" aria-hidden="true" />
      Unofficial Forecast — Not for Safety Decisions
    </div>
  </div>
);

export default UnofficialBadge;