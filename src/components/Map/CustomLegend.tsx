import React from 'react';
import { useSelector } from 'react-redux';
import { isFeatureExposed } from '../../config/featureExposure';
import { isCustomWorkspaceActive } from '../../config/forecastWorkspaces';
import { selectCurrentCustomLayers } from '../../store/forecastSlice';
import type { RootState } from '../../store';
import type { CustomCategoryTemplate } from '../../types/customProducts';

/** Shows the custom-layer legend only when the active route owns custom editing. */
export const useCustomLegendMode = (activeOutlookTypeOverride?: string): boolean => {
  const workspaceId = useSelector((state: RootState) => state.forecast.workspaceId);
  return !activeOutlookTypeOverride && isCustomWorkspaceActive(
    workspaceId,
    isFeatureExposed('customProducts'),
    isFeatureExposed('customWorkspace'),
  );
};

/** Builds the fill and hatch styles for a custom category swatch. */
const getCustomSwatchBackground = (category: CustomCategoryTemplate): React.CSSProperties => {
  const angle = category.style.hatch === 'reverse-diagonal' ? '-45deg' : '45deg';
  const diagonal = `repeating-linear-gradient(${angle}, transparent 0 6px, ${category.style.strokeColor} 6px 8px)`;
  const reverse = `repeating-linear-gradient(-45deg, transparent 0 6px, ${category.style.strokeColor} 6px 8px)`;
  return {
    backgroundColor: category.style.fillColor,
    opacity: 1,
    backgroundImage: category.style.hatch === 'none' ? undefined : category.style.hatch === 'crosshatch' ? `${diagonal}, ${reverse}` : diagonal,
    borderColor: category.style.strokeColor,
    borderWidth: category.style.strokeWidth,
  };
};

/** Renders the categories for the active custom layer. */
const CustomLegend: React.FC = () => {
  const activeCustomLayerId = useSelector((state: RootState) => state.forecast.customEditor?.activeLayerId ?? null);
  const customLayers = useSelector(selectCurrentCustomLayers);
  const activeCustomLayer = customLayers.layers.find(({ id }) => id === activeCustomLayerId) ?? customLayers.layers[0];

  return (
    <>
      <h4 id="legend-title">{activeCustomLayer?.label ?? 'Custom Layers'}</h4>
      <div className="legend-items" role="list" aria-labelledby="legend-title">
        {activeCustomLayer ? [...activeCustomLayer.categories].sort((a, b) => a.order - b.order).map((category) => (
          <div key={category.id} className="legend-item" role="listitem">
            <div className="legend-color" style={getCustomSwatchBackground(category)} role="img" aria-label={`${category.label} custom style`} />
            <span>{category.label}</span>
          </div>
        )) : <span>No custom layer selected</span>}
      </div>
    </>
  );
};

export default CustomLegend;
