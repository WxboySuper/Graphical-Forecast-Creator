// skipcq: JS-C1003
import * as React from 'react';
import type { Dispatch } from 'redux';
// skipcq: JS-C1003
import * as L from 'leaflet';
import { GeoJSON } from 'react-leaflet';
import { Feature } from 'geojson';
import { removeFeature } from '../../store/forecastSlice';
import { OutlookType } from '../../types/outlooks';
import { PMMap } from '../../types/map';
import { FeatureStyle, getFeatureStyle } from '../../utils/outlookUtils';
import { createTooltipContent, stripHtml } from '../../utils/domUtils';

// Helper to check if drawing mode is active (safe with optional chaining)
const isDrawingMode = (map: L.Map): boolean => {
  const pmMap = map as PMMap;
  return Boolean(pmMap.pm?.globalDrawModeEnabled?.());
};

// Force the style on the created layer (in case global Geoman styles persist)
function applyFeatureStyle(layer: L.Layer, styleObj: FeatureStyle) {
  const layerWithStyle = layer as L.Path & { setStyle?: (opts: L.PathOptions) => void };
  if (typeof layerWithStyle.setStyle === 'function') {
    try {
      layerWithStyle.setStyle(styleObj as L.PathOptions);
    } catch {
      // ignore
    }
  }
}

// Force underlying SVG attributes if available to override external styles
function applySvgAttributes(layer: L.Layer, styleObj: FeatureStyle) {
  try {
    const layerWithPath = layer as L.Layer & { _path?: SVGElement };
    const pathEl = layerWithPath._path;
    if (pathEl) {
      const fc = styleObj.fillColor;
      if (typeof fc === 'string' && !fc.startsWith('url(')) {
        pathEl.setAttribute('fill', fc);
      }
      pathEl.setAttribute('fill-opacity', String(styleObj.fillOpacity ?? 1));
      if (styleObj.color) pathEl.setAttribute('stroke', String(styleObj.color));
      pathEl.setAttribute('stroke-width', String(styleObj.weight ?? 1));
    }
  } catch {
    // ignore DOM write errors in server env
  }
}

// Attach event handlers directly to the layer to ensure they bind
function attachEventHandlers(layer: L.Layer, handlers: Record<string, (e: L.LeafletEvent) => void>) {
  const layerWithOn = layer as L.Layer & { on?: (event: string, fn: (...args: unknown[]) => void) => void };
  try {
    Object.entries(handlers).forEach(([evt, fn]) => {
      if (typeof layerWithOn.on === 'function') {
        layerWithOn.on(evt, fn as (...args: unknown[]) => void);
      }
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[onEachFeature] Failed to attach handlers:', err);
  }
}

// Create an onEachFeature factory that forces the Leaflet layer style and attaches handlers
function createOnEachFeature(
  styleObj: FeatureStyle,
  handlers: Record<string, (e: L.LeafletEvent) => void>
) {
  return function onEach(_feature: Feature, layer: L.Layer) {
    applyFeatureStyle(layer, styleObj);
    applySvgAttributes(layer, styleObj);
    attachEventHandlers(layer, handlers);
  };
}

// Optimized: Memoized component for individual features to prevent unnecessary re-renders
const OutlookFeature: React.FC<{
  feature: Feature;
  outlookType: OutlookType;
  probability: string;
  dispatch: Dispatch;
  map: L.Map;
}> = React.memo(({ feature, outlookType, probability, dispatch, map }) => {
  const featureId = feature.id as string;

  const handleClick = React.useCallback(() => {
    // Check if drawing is active to prevent accidental deletion when clicking inside an existing polygon
    if (isDrawingMode(map)) {
      return;
    }

    const outlookName = outlookType.charAt(0).toUpperCase() + outlookType.slice(1);
    const safeProbability = stripHtml(probability);
    const message = `Delete this ${outlookName} outlook area?\n\nRisk Level: ${safeProbability}${safeProbability.includes('#') ? ' (Significant)' : ''}`;
    // eslint-disable-next-line no-restricted-globals, no-alert
    if (confirm(message)) {
      dispatch(removeFeature({ outlookType, probability, featureId }));
    }
  }, [dispatch, map, outlookType, probability, featureId]);

  const handleMouseOver = React.useCallback((e: L.LeafletEvent) => {
    const layer = e.target as L.Layer;
    const tooltipContent = createTooltipContent(outlookType, probability);

    if ('bindTooltip' in layer && typeof layer.bindTooltip === 'function') {
      layer.bindTooltip(tooltipContent, {
        direction: 'top',
        sticky: true,
        opacity: 0.9,
        className: 'feature-tooltip'
      }).openTooltip();
    }
  }, [outlookType, probability]);

  const handlers = React.useMemo(() => ({
    click: handleClick,
    mouseover: handleMouseOver
  }), [handleClick, handleMouseOver]);

  const styleObj = React.useMemo(() => getFeatureStyle(outlookType, probability), [outlookType, probability]);

  // Create stable onEachFeature callback
  const onEach = React.useMemo(() => createOnEachFeature(styleObj, handlers), [styleObj, handlers]);

  return (
    <GeoJSON
      data={feature}
      pathOptions={styleObj as L.PathOptions}
      onEachFeature={onEach}
    />
  );
});

OutlookFeature.displayName = 'OutlookFeature';

export default OutlookFeature;
