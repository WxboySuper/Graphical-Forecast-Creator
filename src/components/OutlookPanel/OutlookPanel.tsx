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
  const { activeOutlookType, activeProbability, isSignificant } = drawingState;
  
  // Handler for changing the outlook type
  const handleOutlookTypeChange = (type: OutlookType) => {
    dispatch(setActiveOutlookType(type));
  };
  
  // Handler for changing the probability/risk level
  const handleProbabilityChange = (probability: TornadoProbability | WindHailProbability | CategoricalRiskLevel) => {
    dispatch(setActiveProbability(probability));
  };
  
  // Handler for toggling significant status
  const handleToggleSignificant = () => {
    // Update the probability to match significant status
    const currentProb = activeProbability;
    if (!currentProb.includes('%')) {
      dispatch(toggleSignificant());
      return;
    }

    // Convert probability to/from significant variant
    const newProb = isSignificant
      ? currentProb.replace('#', '')
      : `${currentProb.replace('%', '')}#`;

    if (newProb !== currentProb) {
      dispatch(setActiveProbability(newProb as any));
    } else {
      dispatch(toggleSignificant());
    }
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
    if (activeOutlookType === 'categorical') return false;
    
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
          <button 
            className={activeOutlookType === 'tornado' ? 'active' : ''} 
            onClick={() => handleOutlookTypeChange('tornado')}
            aria-pressed={activeOutlookType === 'tornado'}
            aria-label="Tornado outlook (T)"
          >
            Tornado
          </button>
          <button 
            className={activeOutlookType === 'wind' ? 'active' : ''} 
            onClick={() => handleOutlookTypeChange('wind')}
            aria-pressed={activeOutlookType === 'wind'}
            aria-label="Wind outlook (W)"
          >
            Wind
          </button>
          <button 
            className={activeOutlookType === 'hail' ? 'active' : ''} 
            onClick={() => handleOutlookTypeChange('hail')}
            aria-pressed={activeOutlookType === 'hail'}
            aria-label="Hail outlook (L)"
          >
            Hail
          </button>
          <button 
            className={activeOutlookType === 'categorical' ? 'active' : ''} 
            onClick={() => handleOutlookTypeChange('categorical')}
            aria-pressed={activeOutlookType === 'categorical'}
            aria-label="Categorical outlook (C)"
          >
            Categorical
          </button>
        </div>
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
            >
              {prob}
            </button>
          ))}
        </div>
      </div>
      
      {canBeSignificant() && (
        <div className="outlook-section">
          <h3>Significant Threat</h3>
          <label className="switch">
            <input 
              type="checkbox" 
              checked={isSignificant} 
              onChange={handleToggleSignificant} 
            />
            <span className="slider round"></span>
          </label>
          <span className="switch-label">
            {isSignificant ? 'Enabled' : 'Disabled'}
            {isSignificant && (
              <div className="probability-note">
                Current: {activeProbability}
              </div>
            )}
          </span>
        </div>
      )}
      
      <div className="outlook-section">
        <h3>Current Selection</h3>
        <div 
          className={`color-preview ${drawingState.isSignificant ? 'significant' : ''}`} 
          style={{ backgroundColor: getCurrentColor() }}
        >
          {activeOutlookType.charAt(0).toUpperCase() + activeOutlookType.slice(1)} - {activeProbability}
          {isSignificant && ' (Significant)'}
        </div>
      </div>
    </div>
  );
};

export default OutlookPanel;