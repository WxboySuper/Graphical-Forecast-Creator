// skipcq: JS-W1028
import React from 'react';
import { useSelector } from 'react-redux';
import { RootState } from '../../store';
import { colorMappings, getCategoricalRiskDisplayName } from '../../utils/outlookUtils';
import { CategoricalRiskLevel } from '../../types/outlooks';
import './Legend.css';

type LegendOutlookType = 'categorical' | 'tornado' | 'wind' | 'hail' | 'totalSevere' | 'day4-8';

interface LegendProps {
  activeOutlookType?: LegendOutlookType;
}

// Optimized: Memoized to prevent re-renders when parent re-renders
const Legend: React.FC<LegendProps> = React.memo(({ activeOutlookType: activeOutlookTypeOverride }) => {
  // Optimized: Select only activeOutlookType to avoid re-rendering on other drawing state changes (like activeProbability)
  const storeActiveOutlookType = useSelector((state: RootState) => state.forecast.drawingState.activeOutlookType);
  const darkMode = useSelector((state: RootState) => state.theme.darkMode);
  const activeOutlookType = activeOutlookTypeOverride || storeActiveOutlookType;

  const renderCategoricalLegend = () => (
    <>
      <h4 id="legend-title">Categorical Risk Levels</h4>
      <div className="legend-items" role="list" aria-labelledby="legend-title">
        {(['HIGH', 'MDT', 'ENH', 'SLGT', 'MRGL', 'TSTM'] as const).map(risk => (
          <div key={risk} className="legend-item" role="listitem">
            <div 
              className="legend-color" 
              style={{ backgroundColor: colorMappings.categorical[risk], opacity: 0.5 }}
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
      probabilities = ['5%', '15%', '30%', '45%', '60%', 'CIG1', 'CIG2'];
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
            const label = isCig ? `${prob} (Hatching)` : prob;

            return (
              <div key={prob} className="legend-item" role="listitem">
                {isCig ? (
                  // Inline SVG swatch so the pattern renders correctly in HTML context
                  <svg
                    width="24"
                    height="24"
                    aria-label={`Legend for ${label}`}
                    role="img"
                    style={{
                      flexShrink: 0,
                      borderRadius: 2,
                      border: darkMode ? '1px solid rgba(255,255,255,0.55)' : '1px solid rgba(0,0,0,0.4)'
                    }}
                  >
                    <defs>
                      {prob === 'CIG1' && (
                        <pattern id={`legend-${prob}`} x="0" y="0" width="10" height="10" patternUnits="userSpaceOnUse">
                          {/* Broken diagonal — matches createHatchPattern CIG1 */}
                          <line x1="0" y1="0" x2="3" y2="3" stroke={darkMode ? '#f5f5f5' : '#111'} strokeWidth="1.2"/>
                          <line x1="5" y1="5" x2="10" y2="10" stroke={darkMode ? '#f5f5f5' : '#111'} strokeWidth="1.2"/>
                        </pattern>
                      )}
                      {prob === 'CIG2' && (
                        <pattern id={`legend-${prob}`} x="0" y="0" width="10" height="10" patternUnits="userSpaceOnUse">
                          {/* Solid diagonal */}
                          <line x1="0" y1="0" x2="10" y2="10" stroke={darkMode ? '#f5f5f5' : '#111'} strokeWidth="1.2"/>
                        </pattern>
                      )}
                      {prob === 'CIG3' && (
                        <pattern id={`legend-${prob}`} x="0" y="0" width="10" height="10" patternUnits="userSpaceOnUse">
                          {/* Crosshatch */}
                          <line x1="0" y1="0" x2="10" y2="10" stroke={darkMode ? '#f5f5f5' : '#111'} strokeWidth="1.2"/>
                          <line x1="0" y1="10" x2="10" y2="0" stroke={darkMode ? '#f5f5f5' : '#111'} strokeWidth="1.2"/>
                        </pattern>
                      )}
                    </defs>
                    <rect width="24" height="24" fill={darkMode ? '#3a3a3a' : '#d9d9d9'}/>
                    <rect width="24" height="24" fill={`url(#legend-${prob})`}/>
                  </svg>
                ) : (
                  <div
                    className="legend-color"
                    style={{ backgroundColor: colorMap[prob] }}
                    role="img"
                    aria-label={`Legend for ${label}`}
                  />
                )}
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