import { useMemo } from 'react';
import { radarConfig, satelliteConfig } from './contextLayers';
import { useContextLayers, useLayerTime, type ContextLayersController, type LayerTimeState } from './useContextLayers';
import type { WmsLayerConfig } from '../../../monitor/wms';

export interface ContextLayerView {
  controller: ContextLayersController;
  radar: { config: WmsLayerConfig | null; time: LayerTimeState; opacity: number };
  satellite: { config: WmsLayerConfig | null; time: LayerTimeState; opacity: number };
}

/** The context choices together with each layer's WMS config and latest time, for the panel and the map. */
export const useContextLayerView = (): ContextLayerView => {
  const controller = useContextLayers();
  const { radar, satellite } = controller.state;
  const radarWms = useMemo(() => radarConfig(radar.product), [radar.product]);
  const satelliteWms = useMemo(() => satelliteConfig(satellite.product), [satellite.product]);
  const radarTime = useLayerTime(radarWms);
  const satelliteTime = useLayerTime(satelliteWms);
  return {
    controller,
    radar: { config: radarWms, time: radarTime, opacity: radar.opacity },
    satellite: { config: satelliteWms, time: satelliteTime, opacity: satellite.opacity },
  };
};
