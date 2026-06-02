import type { WmsLayerConfig } from '../../monitor/wms';
import type { useMonitorMapRefs } from './monitorMapRefs';
import { useMonitorRadarWmsSync } from './useMonitorRadarWmsSync';
import { useMonitorSatelliteWmsSync } from './useMonitorSatelliteWmsSync';

type MonitorMapRefs = ReturnType<typeof useMonitorMapRefs>;

interface UseMonitorMapWmsSyncArgs {
  darkMode: boolean;
  radarLayer: WmsLayerConfig | null;
  radarOpacity: number;
  satelliteLayer: WmsLayerConfig | null;
  satelliteOpacity: number;
  refs: MonitorMapRefs;
}

export const useMonitorMapWmsSync = ({
  darkMode,
  radarLayer,
  radarOpacity,
  satelliteLayer,
  satelliteOpacity,
  refs,
}: UseMonitorMapWmsSyncArgs) => {
  useMonitorRadarWmsSync(radarLayer, radarOpacity, refs, darkMode);
  useMonitorSatelliteWmsSync(satelliteLayer, satelliteOpacity, refs, darkMode);
};
