import { useEffect, useRef } from 'react';
import type { MesoscaleLayerSpec } from '../../mesoscale';
import { createMonitorMesoscaleLayerRegistry, syncMonitorMesoscaleLayers } from './monitorMesoscaleLayerSync';
import type { useMonitorMapRefs } from './monitorMapRefs';

type MonitorMapRefs = ReturnType<typeof useMonitorMapRefs>;

export const useMonitorMesoscaleLayerSync = (specs: MesoscaleLayerSpec[], refs: MonitorMapRefs): void => {
  const registryRef = useRef(createMonitorMesoscaleLayerRegistry());
  const mapRef = refs?.mapRef;
  useEffect(() => {
    if (!mapRef) return;
    const map = mapRef.current;
    if (map) syncMonitorMesoscaleLayers(map, specs, registryRef.current);
  }, [mapRef, specs]);

  useEffect(() => () => {
    if (!mapRef) return;
    const map = mapRef.current;
    if (map) syncMonitorMesoscaleLayers(map, [], registryRef.current);
  }, [mapRef]);
};
