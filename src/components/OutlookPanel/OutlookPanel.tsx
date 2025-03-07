import React from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { RootState } from '../../store';
import { 
  setActiveOutlookType, 
  setActiveProbability, 
  toggleSignificant 
} from '../../store/forecastSlice';
import { OutlookType, CategoricalRiskLevel, TornadoProbability, WindHailProbability } from '../../types/outlooks';
import { colorMappings, getCategoricalRiskDisplayName } from '../../utils/outlookUtils';
import './OutlookPanel.css';

const OutlookPanel: React.FC = () => {
  const dispatch = useDispatch();
  const { drawingState } = useSelector((state: RootState) => state.forecast);
  const featureFlags = useSelector((state: RootState) => state.featureFlags);
  const { activeOutlookType, activeProbability, isSignificant } = drawingState;
  
  // Check if significant threats are enabled via feature flags
  const significantThreatsEnabled = featureFlags.significantThreatsEnabled;
  
  // Handler for changing the outlook type
  const handleOutlookTypeChange = (type: OutlookType) => {
    // Check if the requested outlook type is enabled before changing
    const isEnabled = getOutlookTypeEnabled(type);
    if (!isEnabled) {
      alert(`The ${type} outlook is temporarily unavailable due to maintenance or an issue.`);
      return;
    }
    
    dispatch(setActiveOutlookType(type));
  };
  
  // Helper to check if an outlook type is enabled
  const getOutlookTypeEnabled = (type: OutlookType): boolean => {
    switch (type) {
      case 'tornado': return featureFlags.tornadoOutlookEnabled;
      case 'wind': return featureFlags.windOutlookEnabled;
      case 'hail': return featureFlags.hailOutlookEnabled;
      case 'categorical': return featureFlags.categoricalOutlookEnabled;
      default: return true;
    }
  };
  
  // Handler for changing the probability/risk level
  const handleProbabilityChange = (probability: TornadoProbability | WindHailProbability | CategoricalRiskLevel) => {
    dispatch(setActiveProbability(probability));
  };
  
  // Handler for toggling significant status
  const handleToggleSignificant = () => {
    // Don't allow toggling if significant threats are disabled
    if (!significantThreatsEnabled) {
      alert('Significant threats are temporarily unavailable due to an issue.');
      return;
    }
    
    // Just dispatch the toggle action once - the reducer will handle the logic
    dispatch(toggleSignificant());
  };
  
  // Get available probabilities based on active outlook type
  const getAvailableProbabilities = () => {
    switch (activeOutlookType) {
      case 'categorical':
        return ['TSTM', 'MRGL', 'SLGT', 'ENH', 'MDT', 'HIGH'] as CategoricalRiskLevel[];
      case 'tornado':
        return ['2%', '5%', '10%', '15%', '30%', '45%', '60%'] as TornadoProbability[];
      case 'wind':
      case 'hail':
        return ['5%', '15%', '30%', '45%', '60%'] as WindHailProbability[];
      default:
        return [];
    }
  };
  
  // Check if current probability allows significant variants
  const canBeSignificant = () => {
    // First check if significant threats are globally enabled
    if (!significantThreatsEnabled || activeOutlookType === 'categorical') return false;
    
    const probability = activeProbability.replace('#', '');
    switch (activeOutlookType) {
      case 'tornado':
        // Tornado probabilities of 10% and higher can be significant
        return !['2%', '5%'].includes(probability);
      case 'wind':
      case 'hail':
        // Wind and hail probabilities of 15% and higher can be significant
        return !['5%'].includes(probability);
      default:
        return false;
    }
  };

  // Get button style for probability selector
  const getProbabilityButtonStyle = (prob: string) => {
    const isActive = activeProbability === prob;
    let color = '#FFFFFF';
    let textColor = '#000000';

    // Get the appropriate color based on outlook type and probability
    if (activeOutlookType === 'categorical') {
      color = colorMappings.categorical[prob as keyof typeof colorMappings.categorical];
      // Light background colors need dark text
      if (['TSTM', 'MRGL', 'SLGT'].includes(prob)) {
        textColor = '#000000';
      } else {
        textColor = '#FFFFFF';
      }
    } else {
      const colorMap = activeOutlookType === 'tornado' ? colorMappings.tornado : colorMappings.wind;
      color = colorMap[prob as keyof typeof colorMap];
      // Most probability colors need white text
      textColor = '#FFFFFF';
    }

    return {
      backgroundColor: color,
      color: textColor,
      boxShadow: isActive ? '0 0 0 2px white, 0 0 0 4px #3f51b5' : undefined
    };
  };

  // Get the current color based on outlook type and probability
  const getCurrentColor = () => {
    if (activeOutlookType === 'categorical') {
      return colorMappings.categorical[activeProbability as keyof typeof colorMappings.categorical] || '#FFFFFF';
    } else {
      const colorMap = activeOutlookType === 'tornado' ? colorMappings.tornado : colorMappings.wind;
      return colorMap[activeProbability as keyof typeof colorMap] || '#FFFFFF';
    }
  };
  
  return (
    <div className="outlook-panel">
      <h2>Outlook Configuration</h2>
      
      <div className="outlook-section">
        <h3>Outlook Type</h3>
        <div className="outlook-buttons" role="radiogroup" aria-label="Outlook type selection">
          {/* Tornado outlook button with feature flag */}
          <div className="tooltip">
            <button 
              className={`${activeOutlookType === 'tornado' ? 'active' : ''} ${!featureFlags.tornadoOutlookEnabled ? 'button-disabled' : ''}`} 
              onClick={() => handleOutlookTypeChange('tornado')}
              disabled={!featureFlags.tornadoOutlookEnabled}
              aria-pressed={activeOutlookType === 'tornado'}
              aria-label="Tornado outlook (T)"
            >
              Tornado
              {!featureFlags.tornadoOutlookEnabled && <span className="maintenance-badge">!</span>}
            </button>
            {!featureFlags.tornadoOutlookEnabled && (
              <span className="tooltip-text">Tornado outlook temporarily unavailable</span>
            )}
          </div>
          
          {/* Wind outlook button with feature flag */}
          <div className="tooltip">
            <button 
              className={`${activeOutlookType === 'wind' ? 'active' : ''} ${!featureFlags.windOutlookEnabled ? 'button-disabled' : ''}`} 
              onClick={() => handleOutlookTypeChange('wind')}
              disabled={!featureFlags.windOutlookEnabled}
              aria-pressed={activeOutlookType === 'wind'}
              aria-label="Wind outlook (W)"
            >
              Wind
              {!featureFlags.windOutlookEnabled && <span className="maintenance-badge">!</span>}
            </button>
            {!featureFlags.windOutlookEnabled && (
              <span className="tooltip-text">Wind outlook temporarily unavailable</span>
            )}
          </div>
          
          {/* Hail outlook button with feature flag */}
          <div className="tooltip">
            <button 
              className={`${activeOutlookType === 'hail' ? 'active' : ''} ${!featureFlags.hailOutlookEnabled ? 'button-disabled' : ''}`}
              onClick={() => handleOutlookTypeChange('hail')}
              disabled={!featureFlags.hailOutlookEnabled}
              aria-pressed={activeOutlookType === 'hail'}
              aria-label="Hail outlook (L)"
            >
              Hail
              {!featureFlags.hailOutlookEnabled && <span className="maintenance-badge">!</span>}
            </button>
            {!featureFlags.hailOutlookEnabled && (
              <span className="tooltip-text">Hail outlook temporarily unavailable</span>
            )}
          </div>
          
          {/* Categorical outlook button with feature flag */}
          <div className="tooltip">
            <button 
              className={`${activeOutlookType === 'categorical' ? 'active' : ''} ${!featureFlags.categoricalOutlookEnabled ? 'button-disabled' : ''}`}
              onClick={() => handleOutlookTypeChange('categorical')}
              disabled={!featureFlags.categoricalOutlookEnabled}
              aria-pressed={activeOutlookType === 'categorical'}
              aria-label="Categorical outlook (C)"
            >
              Categorical
              {!featureFlags.categoricalOutlookEnabled && <span className="maintenance-badge">!</span>}
            </button>
            {!featureFlags.categoricalOutlookEnabled && (
              <span className="tooltip-text">Categorical outlook temporarily unavailable</span>
            )}
          </div>
        </div>
        
        {/* Warning if current outlook type is disabled */}
        {!getOutlookTypeEnabled(activeOutlookType) && (
          <div className="warning-notice">
            <p>⚠️ You are viewing a disabled outlook type. Please select an available outlook type to continue.</p>
          </div>
        )}
      </div>
      
      <div className="outlook-section">
        <h3>{activeOutlookType === 'categorical' ? 'Risk Level' : 'Probability'}</h3>
        <div className="probability-selector" role="radiogroup" aria-label="Risk level or probability selection">
          {getAvailableProbabilities().map(prob => (
            <button 
              key={prob} 
              className={activeProbability === prob ? 'active' : ''} 
              onClick={() => handleProbabilityChange(prob)}
              style={getProbabilityButtonStyle(prob)}
              aria-pressed={activeProbability === prob}
              aria-label={`${prob}${activeOutlookType === 'categorical' ? ` (${getCategoricalRiskDisplayName(prob as CategoricalRiskLevel)})` : ''}`}
              title={activeOutlookType === 'categorical' ? getCategoricalRiskDisplayName(prob as CategoricalRiskLevel) : undefined}
              disabled={!getOutlookTypeEnabled(activeOutlookType)}
            >
              {prob}
            </button>
          ))}
        </div>
      </div>
      
      {canBeSignificant() && (
        <div className="outlook-section">
          <h3>Significant Threat</h3>
          <div className="tooltip">
            <label className="switch">
              <input 
                type="checkbox" 
                checked={isSignificant} 
                onChange={handleToggleSignificant} 
                disabled={!significantThreatsEnabled}
              />
              <span className={`slider round ${!significantThreatsEnabled ? 'disabled' : ''}`}></span>
            </label>
            <span className="switch-label">
              {isSignificant ? 'Enabled' : 'Disabled'}
              {isSignificant && (
                <div className="probability-note">
                  Current: {activeProbability}
                </div>
              )}
            </span>
            {!significantThreatsEnabled && (
              <span className="tooltip-text">
                Significant threats temporarily unavailable
              </span>
            )}
          </div>
          
          {!significantThreatsEnabled && isSignificant && (
            <div className="warning-notice">
              <p>⚠️ Significant threats are currently disabled. Your significant markings will not be applied.</p>
            </div>
          )}
        </div>
      )}
      
      <div className="outlook-section">
        <h3>Current Selection</h3>
        <div 
          className={`color-preview ${drawingState.isSignificant && significantThreatsEnabled ? 'significant' : ''}`} 
          style={{ backgroundColor: getCurrentColor() }}
        >
          {activeOutlookType.charAt(0).toUpperCase() + activeOutlookType.slice(1)} - {activeProbability}
          {isSignificant && significantThreatsEnabled && ' (Significant)'}
        </div>
      </div>
      
      {/* Feature flags status information */}
      {(!featureFlags.tornadoOutlookEnabled || 
        !featureFlags.windOutlookEnabled || 
        !featureFlags.hailOutlookEnabled || 
        !featureFlags.categoricalOutlookEnabled || 
        !featureFlags.significantThreatsEnabled) && (
        <div className="outlook-section feature-flags-info">
          <h3>Feature Status</h3>
          <ul className="feature-status-list">
            {!featureFlags.tornadoOutlookEnabled && <li>⚠️ Tornado outlooks temporarily unavailable</li>}
            {!featureFlags.windOutlookEnabled && <li>⚠️ Wind outlooks temporarily unavailable</li>}
            {!featureFlags.hailOutlookEnabled && <li>⚠️ Hail outlooks temporarily unavailable</li>}
            {!featureFlags.categoricalOutlookEnabled && <li>⚠️ Categorical outlooks temporarily unavailable</li>}
            {!featureFlags.significantThreatsEnabled && <li>⚠️ Significant threats temporarily unavailable</li>}
          </ul>
        </div>
      )}
    </div>
  );
};

export default OutlookPanel;