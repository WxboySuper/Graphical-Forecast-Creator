// skipcq: JS-W1028
import React from 'react';
import { useSelector } from 'react-redux';
import { RootState } from '../../store';
import { colorMappings, getCategoricalRiskDisplayName } from '../../utils/outlookUtils';
import { CategoricalRiskLevel, TornadoProbability, WindProbability, HailProbability } from '../../types/outlooks';
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
    let probabilities: string[] = [];
    let colorMap: any;

    if (activeOutlookType === 'tornado') {
      probabilities = ['2%', '5%', '10%', '15%', '30%', '45%', '60%', 'CIG1', 'CIG2', 'CIG3'];
      colorMap = colorMappings.tornado;
    } else if (activeOutlookType === 'wind') {
      probabilities = ['5%', '15%', '30%', '45%', '60%', '75%', '90%', 'CIG1', 'CIG2', 'CIG3'];
      colorMap = colorMappings.wind;
    } else if (activeOutlookType === 'hail') {
      probabilities = ['5%', '15%', '30%', '45%', '60%', 'CIG1', 'CIG2', 'CIG3'];
      colorMap = colorMappings.hail;
    } else if (activeOutlookType === 'totalSevere') {
      probabilities = ['5%', '15%', '30%', '45%', '60%', 'CIG1', 'CIG2'];
      colorMap = colorMappings.totalSevere;
    } else if (activeOutlookType === 'day4-8') {
      probabilities = ['15%', '30%'];
      colorMap = colorMappings['day4-8'];
    }

    return (
      <>
        <h4 id="legend-title">
          {activeOutlookType === 'totalSevere' ? 'TotalSevere' : 
           activeOutlookType === 'day4-8' ? 'Day4-8' :
           activeOutlookType.charAt(0).toUpperCase() + activeOutlookType.slice(1)} Probabilities
        </h4>
        <div className="legend-items" role="list" aria-labelledby="legend-title">
          {probabilities.map(prob => {
            const isCig = prob.startsWith('CIG');
            // Determine style: Pattern for CIG, Color for numeric
            const style: React.CSSProperties = isCig 
              ? { background: colorMappings.hatching[prob as 'CIG1'|'CIG2'|'CIG3'] || 'none', border: '1px solid black' }
              : { backgroundColor: colorMap[prob] };
            
            const label = isCig ? `${prob} (Hatching)` : prob;

            return (
              <div key={prob} className="legend-item" role="listitem">
                <div 
                  className="legend-color" 
                  style={style}
                  role="img"
                  aria-label={`Legend for ${label}`}
                />
                <span>{label}</span>
              </div>
            );
          })}
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