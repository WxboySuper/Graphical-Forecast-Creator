import type { WmsLayerConfig } from '../wms';
import type { useMonitorMapRefs } from './monitorMapRefs';
import { useMonitorRadarWmsSync } from './useMonitorRadarWmsSync';
import { useMonitorSatelliteWmsSync } from './useMonitorSatelliteWmsSync';

type MonitorMapRefs = ReturnType<typeof useMonitorMapRefs>;

interface UseMonitorMapWmsSyncArgs {
  radarLayer: WmsLayerConfig | null;
  radarOpacity: number;
  satelliteLayer: WmsLayerConfig | null;
  satelliteOpacity: number;
  refs: MonitorMapRefs;
}

/** Synchronizes all monitor WMS layers for the current map settings. */
export const useMonitorMapWmsSync = ({
  radarLayer,
  radarOpacity,
  satelliteLayer,
  satelliteOpacity,
  refs,
}: UseMonitorMapWmsSyncArgs) => {
  useMonitorRadarWmsSync(radarLayer, radarOpacity, refs);
  useMonitorSatelliteWmsSync(satelliteLayer, satelliteOpacity, refs);
};
