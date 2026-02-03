// skipcq: JS-W1028
import React, { memo } from 'react';
import { OutlookType, CategoricalRiskLevel } from '../../types/outlooks';
import { getCategoricalRiskDisplayName } from '../../utils/outlookUtils';
import {
  canBeSignificant,
  getProbabilityButtonStyle,
  getCurrentColor,
} from './outlookPanelUtils';
import useOutlookPanelLogic from './useOutlookPanelLogic';
import './OutlookPanel.css';
import { FeatureFlags } from '../../store/featureFlagsSlice';

interface OutlookButtonProps {
  label: string;
  enabled: boolean;
  active: boolean;
  onClick: () => void;
  tooltip?: string;
  ariaLabel?: string;
}

const OutlookButton: React.FC<OutlookButtonProps> = memo(({ label, enabled, active, onClick, tooltip, ariaLabel }) => (
  <div className="tooltip">
    <button
      className={`${active ? 'active' : ''} ${!enabled ? 'button-disabled' : ''}`}
      onClick={onClick}
      disabled={!enabled}
      aria-pressed={active}
      aria-label={ariaLabel}
    >
      {label}
      {!enabled && <span className="maintenance-badge">!</span>}
    </button>
    {!enabled && tooltip && <span className="tooltip-text">{tooltip}</span>}
  </div>
));


  const FeatureStatus: React.FC<{ featureFlags: FeatureFlags }> = memo(({ featureFlags }) => {
    const items = [
      { ok: featureFlags.tornadoOutlookEnabled, text: '⚠️ Tornado outlooks temporarily unavailable' },
      { ok: featureFlags.windOutlookEnabled, text: '⚠️ Wind outlooks temporarily unavailable' },
      { ok: featureFlags.hailOutlookEnabled, text: '⚠️ Hail outlooks temporarily unavailable' },
      { ok: featureFlags.categoricalOutlookEnabled, text: '⚠️ Categorical outlooks temporarily unavailable' },
      { ok: featureFlags.significantThreatsEnabled, text: '⚠️ Significant threats temporarily unavailable' },
    ];
    const disabled = items.filter(i => !i.ok);
    if (disabled.length === 0) return null;
    return (
      <div className="outlook-section feature-flags-info">
        <h3>Feature Status</h3>
        <ul className="feature-status-list">
          {disabled.map((d) => <li key={d.text}>{d.text}</li>)}
        </ul>
      </div>
    );
  });

  const CurrentSelection: React.FC<{
    activeOutlookType: OutlookType;
    activeProbability: string;
    isSignificant: boolean;
    significantThreatsEnabled: boolean;
  }> = memo(({ activeOutlookType, activeProbability, isSignificant, significantThreatsEnabled }) => (
    <div className="outlook-section">
      <h3>Current Selection</h3>
      <div
        className={`color-preview ${isSignificant && significantThreatsEnabled ? 'significant' : ''}`}
        style={{ backgroundColor: getCurrentColor(activeOutlookType, activeProbability) }}
      >
        {activeOutlookType.charAt(0).toUpperCase() + activeOutlookType.slice(1)} - {activeProbability}
        {isSignificant && significantThreatsEnabled && ' (Significant)'}
      </div>
    </div>
  ));
interface OutlookTypeSectionProps {
  activeOutlookType: OutlookType;
  outlookTypeHandlers: Record<OutlookType, () => void>;
  emergencyMode: boolean;
  getOutlookTypeEnabled: (t: OutlookType) => boolean;
}

export const OutlookTypeSectionTop: React.FC<OutlookTypeSectionProps> = memo(({
  activeOutlookType,
  outlookTypeHandlers,
  emergencyMode,
  getOutlookTypeEnabled
}) => {
  // Determine which outlook types to show based on enabled types
  const showTornado = getOutlookTypeEnabled('tornado');
  const showWind = getOutlookTypeEnabled('wind');
  const showHail = getOutlookTypeEnabled('hail');
  const showCategorical = getOutlookTypeEnabled('categorical');
  const showTotalSevere = getOutlookTypeEnabled('totalSevere');
  const showDay48 = getOutlookTypeEnabled('day4-8');
  
  return (
    <div className="outlook-section">
      <h3>Outlook Type</h3>
      <div className="outlook-buttons" aria-label="Outlook type selection">
        {showTornado && (
          <OutlookButton
            label="Tornado"
            enabled={true}
            active={activeOutlookType === 'tornado'}
            onClick={outlookTypeHandlers.tornado}
            tooltip="Tornado outlook"
            ariaLabel="Tornado outlook (T)"
          />
        )}
        {showWind && (
          <OutlookButton
            label="Wind"
            enabled={true}
            active={activeOutlookType === 'wind'}
            onClick={outlookTypeHandlers.wind}
            tooltip="Wind outlook"
            ariaLabel="Wind outlook (W)"
          />
        )}
        {showHail && (
          <OutlookButton
            label="Hail"
            enabled={true}
            active={activeOutlookType === 'hail'}
            onClick={outlookTypeHandlers.hail}
            tooltip="Hail outlook"
            ariaLabel="Hail outlook (L)"
          />
        )}
        {showTotalSevere && (
          <OutlookButton
            label="Total Severe"
            enabled={true}
            active={activeOutlookType === 'totalSevere'}
            onClick={outlookTypeHandlers.totalSevere}
            tooltip="Day 3 combined severe threat"
            ariaLabel="Total Severe outlook (S)"
          />
        )}
        {showDay48 && (
          <OutlookButton
            label="Day 4-8"
            enabled={true}
            active={activeOutlookType === 'day4-8'}
            onClick={outlookTypeHandlers['day4-8']}
            tooltip="Day 4-8 outlook (15% and 30% only)"
            ariaLabel="Day 4-8 outlook (D)"
          />
        )}
        {showCategorical && (
          <OutlookButton
            label="Categorical"
            enabled={true}
            active={activeOutlookType === 'categorical'}
            onClick={outlookTypeHandlers.categorical}
            tooltip="Categorical outlook"
            ariaLabel="Categorical outlook (C)"
          />
        )}
      </div>
      {emergencyMode && (
        <div className="emergency-warning">
          <h4>⚠️ Emergency Mode - All Outlooks Disabled</h4>
          <p>
            All outlook types are currently disabled. This is typically done during critical maintenance 
            or when addressing severe issues. Please check back later or contact the administrator.
          </p>
          <p>
            You can still view existing forecasts, but creating new ones is temporarily unavailable.
          </p>
        </div>
      )}
      {!getOutlookTypeEnabled(activeOutlookType) && (
        <div className="warning-notice">
          <p>⚠️ You are viewing an outlook type not available for this day. Please select an available outlook type.</p>
        </div>
      )}
    </div>
  );
});

interface ProbabilitySectionProps {
  activeOutlookType: OutlookType;
  probabilities: string[];
  activeProbability: string;
  probabilityHandlers: Record<string, () => void>;
  getProbabilityButtonStyle: (o: OutlookType, a: string, p: string) => React.CSSProperties;
  getCategoricalRiskDisplayName: (p: CategoricalRiskLevel) => string;
  getOutlookTypeEnabled: (t: OutlookType) => boolean;
}

export const ProbabilitySectionTop: React.FC<ProbabilitySectionProps> = memo(({
  activeOutlookType,
  probabilities,
  activeProbability,
  probabilityHandlers,
  getProbabilityButtonStyle,
  getCategoricalRiskDisplayName,
  getOutlookTypeEnabled
}) => (
  <div className="outlook-section">
    <h3>{activeOutlookType === 'categorical' ? 'Risk Level' : 'Probability'}</h3>
    <div className="probability-selector" aria-label="Risk level or probability selection">
      {probabilities.map(prob => (
        <button 
          key={prob} 
          className={activeProbability === prob ? 'active' : ''} 
          onClick={probabilityHandlers[prob]}
          style={getProbabilityButtonStyle(activeOutlookType, activeProbability, prob)}
          aria-pressed={activeProbability === prob}
          aria-label={activeOutlookType === 'categorical' ? `${prob} (${getCategoricalRiskDisplayName(prob as CategoricalRiskLevel)})` : prob}
          title={activeOutlookType === 'categorical' ? getCategoricalRiskDisplayName(prob as CategoricalRiskLevel) : undefined}
          disabled={!getOutlookTypeEnabled(activeOutlookType)}
        >
          {prob}
        </button>
      ))}
    </div>
  </div>
));

interface SignificantSectionProps {
  isSignificant: boolean;
  handleToggleSignificant: () => void;
  significantThreatsEnabled: boolean;
  activeProbability: string;
}

export const SignificantSectionTop: React.FC<SignificantSectionProps> = memo(({
  isSignificant,
  handleToggleSignificant,
  significantThreatsEnabled,
  activeProbability
}) => (
  <div className="outlook-section">
    <h3>Significant Threat</h3>
    <div className="tooltip">
      <label className="switch">
        <input 
          type="checkbox" 
          checked={isSignificant} 
          onChange={handleToggleSignificant} 
          disabled={!significantThreatsEnabled}
          aria-label="Significant threat toggle"
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
));

const OutlookPanel: React.FC = () => {
  const {
    featureFlags,
    emergencyMode,
    activeOutlookType,
    activeProbability,
    isSignificant,
    significantThreatsEnabled,
    getOutlookTypeEnabled,
    outlookTypeHandlers,
    probabilities,
    probabilityHandlers,
    handleToggleSignificant,
  } = useOutlookPanelLogic();

  return (
    <div className="outlook-panel">
      <h2>Outlook Configuration</h2>
      
      <OutlookTypeSectionTop
        activeOutlookType={activeOutlookType}
        outlookTypeHandlers={outlookTypeHandlers}
        emergencyMode={emergencyMode}
        getOutlookTypeEnabled={getOutlookTypeEnabled}
      />
      
      <ProbabilitySectionTop
        activeOutlookType={activeOutlookType}
        probabilities={probabilities}
        activeProbability={activeProbability}
        probabilityHandlers={probabilityHandlers}
        getProbabilityButtonStyle={getProbabilityButtonStyle}
        getCategoricalRiskDisplayName={getCategoricalRiskDisplayName}
        getOutlookTypeEnabled={getOutlookTypeEnabled}
      />
      
      <CurrentSelection
        activeOutlookType={activeOutlookType}
        activeProbability={activeProbability}
        isSignificant={isSignificant}
        significantThreatsEnabled={significantThreatsEnabled}
      />
      
      {/* Feature flags status information */}
      <FeatureStatus featureFlags={featureFlags} />
    </div>
  );
};

export default OutlookPanel;