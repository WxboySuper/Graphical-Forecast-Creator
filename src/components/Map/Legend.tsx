// skipcq: JS-W1028
import React from 'react';
import { useSelector } from 'react-redux';
import { RootState } from '../../store';
import { colorMappings, getCategoricalRiskDisplayName } from '../../utils/outlookUtils';
import { CategoricalRiskLevel, TornadoProbability, WindHailProbability } from '../../types/outlooks';
import './Legend.css';

// Optimized: Memoized to prevent re-renders when parent re-renders
const Legend: React.FC = React.memo(() => {
  // Optimized: Select only activeOutlookType to avoid re-rendering on other drawing state changes (like activeProbability)
  const activeOutlookType = useSelector((state: RootState) => state.forecast.drawingState.activeOutlookType);

  const renderCategoricalLegend = () => (
    <>
      <h4 id="legend-title">Categorical Risk Levels</h4>
      <div className="legend-items" role="list" aria-labelledby="legend-title">
        {(['HIGH', 'MDT', 'ENH', 'SLGT', 'MRGL', 'TSTM'] as const).map(risk => (
          <div key={risk} className="legend-item" role="listitem">
            <div 
              className="legend-color" 
              style={{ backgroundColor: colorMappings.categorical[risk] }}
              role="img"
              aria-label={`Color for ${getCategoricalRiskDisplayName(risk as CategoricalRiskLevel)}`}
            />
            <span>{getCategoricalRiskDisplayName(risk as CategoricalRiskLevel)}</span>
          </div>
        ))}
      </div>
    </>
  );

  const renderProbabilisticLegend = () => {
    const probabilities = activeOutlookType === 'tornado'
      ? (['2%', '5%', '10%', '15%', '30%', '45%', '60%'] as TornadoProbability[])
      : (['5%', '15%', '30%', '45%', '60%'] as WindHailProbability[]);

    return (
      <>
        <h4 id="legend-title">{activeOutlookType.charAt(0).toUpperCase() + activeOutlookType.slice(1)} Probabilities</h4>
        <div className="legend-items" role="list" aria-labelledby="legend-title">
          {probabilities.map(prob => (
            <React.Fragment key={prob}>
              <div className="legend-item" role="listitem">
                <div 
                  className="legend-color" 
                  style={{ backgroundColor: activeOutlookType === 'tornado' ? colorMappings.tornado[prob as TornadoProbability] : colorMappings.wind[prob as WindHailProbability] }}
                  role="img"
                  aria-label={`Color for ${prob} probability`}
                />
                <span>{prob}</span>
              </div>
              {/* Show significant variant if applicable */}
              {((activeOutlookType === 'tornado' && !['2%', '5%'].includes(prob)) ||
                (activeOutlookType !== 'tornado' && prob !== '5%')) && (
                <div className="legend-item" role="listitem">
                  <div
                    className="legend-color significant-threat-pattern"
                    style={{ backgroundColor: activeOutlookType === 'tornado' ? colorMappings.tornado[prob as TornadoProbability] : colorMappings.wind[prob as WindHailProbability] }}
                    role="img"
                    aria-label={`Color for ${prob.replace('%', '#')} significant threat probability`}
                  />
                  <span>{prob.replace('%', '#')} (Significant)</span>
                </div>
              )}
            </React.Fragment>
          ))}
        </div>
      </>
    );
  };

  return (
    <div className="map-legend" role="complementary" aria-label="Map Legend">
      {activeOutlookType === 'categorical' ? renderCategoricalLegend() : renderProbabilisticLegend()}
    </div>
  );
});

Legend.displayName = 'Legend';

export default Legend;