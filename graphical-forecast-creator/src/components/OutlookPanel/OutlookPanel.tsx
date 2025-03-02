import React from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { RootState } from '../../store';
import { 
  setActiveOutlookType, 
  setActiveProbability, 
  toggleSignificant 
} from '../../store/forecastSlice';
import { OutlookType, CategoricalRiskLevel } from '../../types/outlooks';
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
  const handleProbabilityChange = (probability: string) => {
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
      : currentProb.replace('%', '#');

    if (newProb !== currentProb) {
      dispatch(setActiveProbability(newProb as any));
    } else {
      dispatch(toggleSignificant());
    }
  };
  
  // Get available probabilities based on active outlook type
  const getAvailableProbabilities = () => {
    switch (activeOutlookType) {
      case 'tornado':
        return Object.keys(colorMappings.tornado).filter(key => !key.includes('#'));
      case 'wind':
      case 'hail':
        return Object.keys(colorMappings.wind).filter(key => !key.includes('#'));
      case 'categorical':
        return Object.keys(colorMappings.categorical);
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
  
  // Get color for the current selection
  const getCurrentColor = () => {
    if (activeOutlookType === 'categorical') {
      return colorMappings.categorical[activeProbability as keyof typeof colorMappings.categorical];
    } else if (activeOutlookType === 'tornado') {
      return colorMappings.tornado[activeProbability as keyof typeof colorMappings.tornado];
    } else if (activeOutlookType === 'wind' || activeOutlookType === 'hail') {
      return colorMappings.wind[activeProbability as keyof typeof colorMappings.wind];
    }
    return '#FFFFFF';
  };
  
  return (
    <div className="outlook-panel">
      <h2>Outlook Configuration</h2>
      
      <div className="outlook-section">
        <h3>Outlook Type</h3>
        <div className="outlook-buttons">
          <button 
            className={activeOutlookType === 'tornado' ? 'active' : ''} 
            onClick={() => handleOutlookTypeChange('tornado')}
          >
            Tornado
          </button>
          <button 
            className={activeOutlookType === 'wind' ? 'active' : ''} 
            onClick={() => handleOutlookTypeChange('wind')}
          >
            Wind
          </button>
          <button 
            className={activeOutlookType === 'hail' ? 'active' : ''} 
            onClick={() => handleOutlookTypeChange('hail')}
          >
            Hail
          </button>
          <button 
            className={activeOutlookType === 'categorical' ? 'active' : ''} 
            onClick={() => handleOutlookTypeChange('categorical')}
          >
            Categorical
          </button>
        </div>
      </div>
      
      <div className="outlook-section">
        <h3>{activeOutlookType === 'categorical' ? 'Risk Level' : 'Probability'}</h3>
        <div className="probability-selector">
          {getAvailableProbabilities().map(prob => (
            <button 
              key={prob} 
              className={activeProbability === prob ? 'active' : ''} 
              onClick={() => handleProbabilityChange(prob)}
              style={{ 
                backgroundColor: activeOutlookType === 'categorical' 
                  ? colorMappings.categorical[prob as keyof typeof colorMappings.categorical] 
                  : activeOutlookType === 'tornado'
                    ? colorMappings.tornado[prob as keyof typeof colorMappings.tornado]
                    : colorMappings.wind[prob as keyof typeof colorMappings.wind],
                color: ['#f3f67d', '#bfe7bc', '#7dc580'].includes(
                  activeOutlookType === 'categorical' 
                    ? colorMappings.categorical[prob as keyof typeof colorMappings.categorical] 
                    : activeOutlookType === 'tornado'
                      ? colorMappings.tornado[prob as keyof typeof colorMappings.tornado]
                      : colorMappings.wind[prob as keyof typeof colorMappings.wind]
                ) ? '#000' : '#fff'
              }}
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
        <div className="color-preview" style={{ backgroundColor: getCurrentColor() }}>
          {activeOutlookType.charAt(0).toUpperCase() + activeOutlookType.slice(1)} - {activeProbability}
          {isSignificant && ' (Significant)'}
        </div>
        {isSignificant && (
          <div className="hatch-preview">
            <div className="hatch-pattern"></div>
          </div>
        )}
      </div>
    </div>
  );
};

export default OutlookPanel;