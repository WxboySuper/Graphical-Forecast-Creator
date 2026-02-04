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
}) => (
  <div className="outlook-section">
    <h3>Outlook Type</h3>
    <div className="outlook-buttons" aria-label="Outlook type selection">
      <OutlookButton
        label="Tornado"
        enabled={getOutlookTypeEnabled('tornado')}
        active={activeOutlookType === 'tornado'}
        onClick={outlookTypeHandlers.tornado}
        tooltip="Tornado outlook temporarily unavailable"
        ariaLabel="Tornado outlook (T)"
      />
      <OutlookButton
        label="Wind"
        enabled={getOutlookTypeEnabled('wind')}
        active={activeOutlookType === 'wind'}
        onClick={outlookTypeHandlers.wind}
        tooltip="Wind outlook temporarily unavailable"
        ariaLabel="Wind outlook (W)"
      />
      <OutlookButton
        label="Hail"
        enabled={getOutlookTypeEnabled('hail')}
        active={activeOutlookType === 'hail'}
        onClick={outlookTypeHandlers.hail}
        tooltip="Hail outlook temporarily unavailable"
        ariaLabel="Hail outlook (L)"
      />
      <OutlookButton
        label="Categorical"
        enabled={getOutlookTypeEnabled('categorical')}
        active={activeOutlookType === 'categorical'}
        onClick={outlookTypeHandlers.categorical}
        tooltip="Categorical outlook temporarily unavailable"
        ariaLabel="Categorical outlook (C)"
      />
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
        <p>⚠️ You are viewing a disabled outlook type. Please select an available outlook type to continue.</p>
      </div>
    )}
  </div>
));

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
      
      {canBeSignificant(activeOutlookType, activeProbability, significantThreatsEnabled) && (
        <SignificantSectionTop
          isSignificant={isSignificant}
          handleToggleSignificant={handleToggleSignificant}
          significantThreatsEnabled={significantThreatsEnabled}
          activeProbability={activeProbability}
        />
      )}

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