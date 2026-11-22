import type OLMap from 'ol/Map';
import { createMesoscaleLayerRegistry, syncMesoscaleLayers, type MesoscaleLayerRegistry, type MesoscaleLayerSpec } from '../../mesoscale';

export const MONITOR_MESOSCALE_Z_INDEX = 25;

export const syncMonitorMesoscaleLayers = (map: OLMap, specs: MesoscaleLayerSpec[], registry: MesoscaleLayerRegistry): void => {
  syncMesoscaleLayers({ map, specs, registry });
  registry.orderedIds.forEach((id, index) => registry.layers.get(id)?.setZIndex(MONITOR_MESOSCALE_Z_INDEX + index));
};

export const createMonitorMesoscaleLayerRegistry = createMesoscaleLayerRegistry;
