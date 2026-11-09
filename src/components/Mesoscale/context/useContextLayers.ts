import { useCallback, useEffect, useState } from 'react';
import { fetchLayerTimeValues, type WmsLayerConfig } from '../../../monitor/wms';
import { CONTEXT_STORAGE_KEY, DEFAULT_CONTEXT_LAYERS, parseContextLayers, type ContextLayersState } from './contextLayers';

const REFRESH_MS = 5 * 60_000;

const readStored = (): ContextLayersState => {
  try {
    const raw = window.localStorage.getItem(CONTEXT_STORAGE_KEY);
    return raw ? parseContextLayers(JSON.parse(raw)) : DEFAULT_CONTEXT_LAYERS;
  } catch {
    return DEFAULT_CONTEXT_LAYERS;
  }
};

export interface ContextLayersController {
  state: ContextLayersState;
  setRadar: (next: Partial<ContextLayersState['radar']>) => void;
  setSatellite: (next: Partial<ContextLayersState['satellite']>) => void;
}

/** Context layer choices, kept in this browser. A storage failure never blocks the workspace. */
export const useContextLayers = (): ContextLayersController => {
  const [state, setState] = useState<ContextLayersState>(readStored);
  useEffect(() => {
    try {
      window.localStorage.setItem(CONTEXT_STORAGE_KEY, JSON.stringify(state));
    } catch { /* storage may be unavailable */ }
  }, [state]);
  const setRadar = useCallback((next: Partial<ContextLayersState['radar']>) => setState(current => ({ ...current, radar: { ...current.radar, ...next } })), []);
  const setSatellite = useCallback((next: Partial<ContextLayersState['satellite']>) => setState(current => ({ ...current, satellite: { ...current.satellite, ...next } })), []);
  return { state, setRadar, setSatellite };
};

export type LayerTimeState =
  | { status: 'off' }
  | { status: 'loading' }
  | { status: 'ready'; time: string }
  | { status: 'unavailable' };

/** The newest valid time of a WMS layer, refreshed every few minutes; `off` when no layer is chosen. */
export const useLayerTime = (config: WmsLayerConfig | null): LayerTimeState => {
  const [result, setResult] = useState<LayerTimeState>({ status: config ? 'loading' : 'off' });
  const url = config?.url;
  const layer = config?.layer;
  useEffect(() => {
    if (!url || !layer) {
      setResult({ status: 'off' });
      return undefined;
    }
    let cancelled = false;
    const load = (): void => {
      fetchLayerTimeValues({ url, layer }).then((times) => {
        if (cancelled) return;
        const latest = times[times.length - 1];
        setResult(latest ? { status: 'ready', time: latest } : { status: 'unavailable' });
      }).catch(() => {
        if (!cancelled) setResult({ status: 'unavailable' });
      });
    };
    setResult({ status: 'loading' });
    load();
    const timer = window.setInterval(load, REFRESH_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [url, layer]);
  return result;
};
