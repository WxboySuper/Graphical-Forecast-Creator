import type React from 'react';
import LayerGroup from 'ol/layer/Group';
import TileLayer from 'ol/layer/Tile';
import VectorSource from 'ol/source/Vector';
import TileWMS from 'ol/source/TileWMS';
import XYZ from 'ol/source/XYZ';
import GeoJSON from 'ol/format/GeoJSON';
import { Fill, Stroke, Style } from 'ol/style';
import type { WmsLayerConfig } from '../../monitor/wms';

export const BASE_LAYER_Z_INDEX = 0;
export const SATELLITE_LAYER_Z_INDEX = 15;
export const RADAR_LAYER_Z_INDEX = 20;
export const ALERTS_LAYER_Z_INDEX = 1030;
export const MONITOR_OUTLOOK_TRANSPARENCY_SCALE = 0.38;
export const STATE_OUTLINE_LAYER_Z_INDEX = 1045;
export const OUTLOOK_LAYER_Z_INDEX = 1040;
export const STORM_REPORTS_LAYER_Z_INDEX = 1048;
export const TOP_VECTOR_REFERENCE_LAYER_Z_INDEX = 1050;

const US_STATES_GEOJSON_URL =
  'https://raw.githubusercontent.com/PublicaMundi/MappingAPI/master/data/geojson/us-states.json';

let cachedUsStatesGeoJSON: object | null = null;

export const createBaseSource = (darkMode: boolean) => new XYZ({
  url: darkMode
    ? 'https://{a-d}.basemaps.cartocdn.com/rastertiles/dark_nolabels/{z}/{x}/{y}{r}.png'
    : 'https://{a-d}.basemaps.cartocdn.com/rastertiles/voyager_nolabels/{z}/{x}/{y}{r}.png',
  attributions: '&copy; OpenStreetMap &copy; CARTO',
  crossOrigin: 'anonymous',
  maxZoom: 19,
});

export const replaceLayerGroupLayers = (target: LayerGroup, source: LayerGroup) => {
  const targetLayers = target.getLayers();
  targetLayers.clear();
  source.getLayers().getArray().forEach((layer) => {
    targetLayers.push(layer);
  });
};

export const createStateOutlineStyle = (darkMode: boolean) => new Style({
  fill: new Fill({ color: 'rgba(0, 0, 0, 0)' }),
  stroke: new Stroke({
    color: darkMode ? 'rgba(226, 232, 240, 0.72)' : 'rgba(51, 65, 85, 0.88)',
    width: 1.1,
  }),
});

const createWmsSource = (config: WmsLayerConfig): TileWMS => new TileWMS({
  url: config.url,
  params: {
    LAYERS: config.layer,
    TILED: true,
    ...(config.latestTime ? { TIME: config.latestTime } : {}),
  },
  serverType: 'geoserver',
  crossOrigin: 'anonymous',
});

export const buildWmsParams = (config: WmsLayerConfig) => ({
  LAYERS: config.layer,
  TILED: true,
  ...(config.latestTime ? { TIME: config.latestTime } : {}),
});

export const buildWmsLayerKey = (config: WmsLayerConfig): string => `${config.url}::${config.layer}`;

export const applyWmsLayer = (
  layer: TileLayer<TileWMS>,
  config: WmsLayerConfig | null,
  opacity: number,
  activeLayerKeyRef: React.MutableRefObject<string | null>,
) => {
  if (!config) {
    layer.setVisible(false);
    activeLayerKeyRef.current = null;
    return;
  }

  const nextLayerKey = buildWmsLayerKey(config);
  const source = layer.getSource();

  if (!source || activeLayerKeyRef.current !== nextLayerKey) {
    layer.setSource(createWmsSource(config));
    activeLayerKeyRef.current = nextLayerKey;
  } else {
    source.updateParams(buildWmsParams(config));
  }

  layer.setOpacity(opacity);
  layer.setVisible(true);
};

export const loadUsStateOutlines = async (source: VectorSource, darkMode: boolean) => {
  if (source.getFeatures().length > 0) {
    return;
  }

  if (!cachedUsStatesGeoJSON) {
    const response = await fetch(US_STATES_GEOJSON_URL);
    if (!response.ok) {
      throw new Error(`Failed to fetch US states GeoJSON: ${response.statusText}`);
    }
    cachedUsStatesGeoJSON = await response.json() as object;
  }

  const format = new GeoJSON();
  const features = format.readFeatures(cachedUsStatesGeoJSON, {
    dataProjection: 'EPSG:4326',
    featureProjection: 'EPSG:3857',
  });
  const style = createStateOutlineStyle(darkMode);
  features.forEach((feature) => {
    if ('setStyle' in feature && typeof feature.setStyle === 'function') {
      feature.setStyle(style);
    }
  });
  source.addFeatures(features as never);
};
