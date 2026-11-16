/**
 * Draws the chosen radar and satellite layers on the Mesoscale map, under the drawn areas. They sit
 * above the model fields (radar echoes read best on top) and below the roads and boundaries.
 */
import { useEffect, useRef } from 'react';
import type OLMap from 'ol/Map';
import TileLayer from 'ol/layer/Tile';
import type TileWMS from 'ol/source/TileWMS';
import { applyWmsLayer } from '../../../monitor/components/monitorMapLayerUtils';
import type { WmsLayerConfig } from '../../../monitor/wms';
import type { LayerTimeState } from './useContextLayers';

const SATELLITE_Z_INDEX = 50;
const RADAR_Z_INDEX = 60;

interface ContextLayerProps {
  map: OLMap;
  config: WmsLayerConfig | null;
  time: LayerTimeState;
  opacity: number;
  zIndex: number;
}

/** One WMS layer that appears only when a layer is chosen and its latest time is known. */
const useWmsContextLayer = ({ map, config, time, opacity, zIndex }: ContextLayerProps): void => {
  const layerRef = useRef<TileLayer<TileWMS> | null>(null);
  const activeKey = useRef<string | null>(null);

  useEffect(() => {
    const layer = new TileLayer<TileWMS>({ zIndex, visible: false });
    layerRef.current = layer;
    map.addLayer(layer);
    return () => {
      map.removeLayer(layer);
      layerRef.current = null;
      activeKey.current = null;
    };
  }, [map, zIndex]);

  const latestTime = time.status === 'ready' ? time.time : undefined;
  useEffect(() => {
    const layer = layerRef.current;
    if (!layer) return;
    applyWmsLayer(layer, config && latestTime ? { ...config, latestTime } : null, opacity, activeKey);
  }, [config, latestTime, opacity]);
};

interface Props {
  map: OLMap;
  radar: { config: WmsLayerConfig | null; time: LayerTimeState; opacity: number };
  satellite: { config: WmsLayerConfig | null; time: LayerTimeState; opacity: number };
}

export const MesoscaleContextLayers = ({ map, radar, satellite }: Props): null => {
  useWmsContextLayer({ map, ...satellite, zIndex: SATELLITE_Z_INDEX });
  useWmsContextLayer({ map, ...radar, zIndex: RADAR_Z_INDEX });
  return null;
};
