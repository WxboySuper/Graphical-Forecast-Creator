import React from 'react';
import { useSelector } from 'react-redux';
import { RootState } from '../../store';
import { colorMappings, getCategoricalRiskDisplayName } from '../../utils/outlookUtils';
import './Legend.css';

const Legend: React.FC = () => {
  const { activeOutlookType } = useSelector((state: RootState) => state.forecast.drawingState);

  const renderCategoricalLegend = () => (
    <>
      <h4 id="legend-title">Categorical Risk Levels</h4>
      <div className="legend-items" role="list" aria-labelledby="legend-title">
        {['HIGH', 'MDT', 'ENH', 'SLGT', 'MRGL', 'TSTM'].map(risk => (
          <div key={risk} className="legend-item" role="listitem">
            <div 
              className="legend-color" 
              style={{ backgroundColor: colorMappings.categorical[risk] }}
              role="img"
              aria-label={`Color for ${getCategoricalRiskDisplayName(risk)}`}
            />
            <span>{getCategoricalRiskDisplayName(risk)}</span>
          </div>
        ))}
      </div>
    </>
  );

  const renderProbabilisticLegend = () => {
    const colorMap = activeOutlookType === 'tornado' ? colorMappings.tornado : colorMappings.wind;
    const probabilities = activeOutlookType === 'tornado' 
      ? ['2%', '5%', '10%', '15%', '30%', '45%', '60%']
      : ['5%', '15%', '30%', '45%', '60%'];

    return (
      <>
        <h4 id="legend-title">{activeOutlookType.charAt(0).toUpperCase() + activeOutlookType.slice(1)} Probabilities</h4>
        <div className="legend-items" role="list" aria-labelledby="legend-title">
          {probabilities.map(prob => (
            <React.Fragment key={prob}>
              <div className="legend-item" role="listitem">
                <div 
                  className="legend-color" 
                  style={{ backgroundColor: colorMap[prob] }}
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
                    style={{ backgroundColor: colorMap[prob] }}
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
};

export default Legend;