import { useEffect } from 'react';
import type { WmsLayerConfig } from '../../monitor/wms';
import { applyWmsLayer, buildWmsParams } from './monitorMapLayerUtils';
import type { useMonitorMapRefs } from './monitorMapRefs';

type MonitorMapRefs = ReturnType<typeof useMonitorMapRefs>;

export const useMonitorRadarWmsSync = (
  radarLayer: WmsLayerConfig | null,
  radarOpacity: number,
  refs: MonitorMapRefs,
  darkMode: boolean,
) => {
  useEffect(() => {
    if (refs.radarLayerRef.current) {
      applyWmsLayer(refs.radarLayerRef.current, radarLayer, radarOpacity, refs.radarLayerKeyRef);
    }
  }, [darkMode, radarLayer, radarOpacity]);

  useEffect(() => {
    const source = refs.radarLayerRef.current?.getSource();
    if (source && radarLayer) {
      source.updateParams(buildWmsParams(radarLayer));
    }
  }, [radarLayer?.latestTime]);
};
