import { useEffect } from 'react';
import type { WmsLayerConfig } from '../../monitor/wms';
import { applyWmsLayer, buildWmsParams } from './monitorMapLayerUtils';
import type { useMonitorMapRefs } from './monitorMapRefs';

type MonitorMapRefs = ReturnType<typeof useMonitorMapRefs>;

interface UseMonitorMapWmsSyncArgs {
  radarLayer: WmsLayerConfig | null;
  radarOpacity: number;
  satelliteLayer: WmsLayerConfig | null;
  satelliteOpacity: number;
  refs: MonitorMapRefs;
}

export const useMonitorMapWmsSync = ({
  radarLayer,
  radarOpacity,
  satelliteLayer,
  satelliteOpacity,
  refs,
}: UseMonitorMapWmsSyncArgs) => {
  useEffect(() => {
    if (refs.radarLayerRef.current) {
      applyWmsLayer(refs.radarLayerRef.current, radarLayer, radarOpacity, refs.radarLayerKeyRef);
    }
  }, [radarLayer, radarOpacity]);

  useEffect(() => {
    const source = refs.radarLayerRef.current?.getSource();
    if (source && radarLayer) {
      source.updateParams(buildWmsParams(radarLayer));
    }
  }, [radarLayer?.latestTime]);

  useEffect(() => {
    if (refs.satelliteLayerRef.current) {
      applyWmsLayer(refs.satelliteLayerRef.current, satelliteLayer, satelliteOpacity, refs.satelliteLayerKeyRef);
    }
  }, [satelliteLayer, satelliteOpacity]);

  useEffect(() => {
    const source = refs.satelliteLayerRef.current?.getSource();
    if (source && satelliteLayer) {
      source.updateParams(buildWmsParams(satelliteLayer));
    }
  }, [satelliteLayer?.latestTime]);
};
