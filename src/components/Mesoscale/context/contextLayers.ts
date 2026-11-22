/**
 * Radar and satellite context for the Mesoscale workspace. These are display-only observation layers
 * (the same NOAA sources the Monitor page uses) shown under the drawn areas for situational awareness.
 * They are never part of the forecaster's product, so they are not exported, imported, or validated
 * with it; the choices are kept in this browser only.
 */
import { buildRadarLayerConfig, buildSatelliteLayerConfig, type WmsLayerConfig } from '../../../monitor/wms';
import type { MonitorSatelliteProduct } from '../../../monitor/types';

export type ContextRadarProduct = 'off' | 'bref-qcd' | 'cref-qcd';
export type ContextSatelliteProduct = Exclude<MonitorSatelliteProduct, 'none'> | 'off';

export interface ContextLayersState {
  radar: { product: ContextRadarProduct; opacity: number };
  satellite: { product: ContextSatelliteProduct; opacity: number };
}

export const DEFAULT_CONTEXT_OPACITY = 0.7;

export const DEFAULT_CONTEXT_LAYERS: ContextLayersState = {
  radar: { product: 'off', opacity: DEFAULT_CONTEXT_OPACITY },
  satellite: { product: 'off', opacity: DEFAULT_CONTEXT_OPACITY },
};

export const RADAR_OPTIONS: ReadonlyArray<{ value: ContextRadarProduct; label: string }> = [
  { value: 'off', label: 'Off' },
  { value: 'bref-qcd', label: 'Base reflectivity (MRMS)' },
  { value: 'cref-qcd', label: 'Composite reflectivity (MRMS)' },
];

export const SATELLITE_OPTIONS: ReadonlyArray<{ value: ContextSatelliteProduct; label: string }> = [
  { value: 'off', label: 'Off' },
  { value: 'goes-visible', label: 'GOES visible' },
  { value: 'goes-longwave', label: 'GOES longwave infrared' },
  { value: 'goes-water-vapor', label: 'GOES water vapor' },
  { value: 'goes-shortwave', label: 'GOES shortwave infrared' },
];

const RADAR_VALUES = new Set<string>(RADAR_OPTIONS.map(option => option.value));
const SATELLITE_VALUES = new Set<string>(SATELLITE_OPTIONS.map(option => option.value));

export const radarConfig = (product: ContextRadarProduct): WmsLayerConfig | null =>
  product === 'off' ? null : buildRadarLayerConfig({ radarMode: 'mrms-conus', radarProduct: product, radarSite: '' });

export const satelliteConfig = (product: ContextSatelliteProduct): WmsLayerConfig | null =>
  product === 'off' ? null : buildSatelliteLayerConfig(product);

const isOpacity = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
const isRecord = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);

const readLayer = <T extends string>(value: unknown, allowed: Set<string>, fallback: { product: T; opacity: number }) => {
  if (!isRecord(value)) return fallback;
  const product = typeof value.product === 'string' && allowed.has(value.product) ? (value.product as T) : fallback.product;
  return { product, opacity: isOpacity(value.opacity) ? value.opacity : fallback.opacity };
};

/** Reads stored context choices, falling back to "off" for anything missing or unrecognized. */
export const parseContextLayers = (raw: unknown): ContextLayersState => {
  const value = isRecord(raw) ? raw : {};
  return {
    radar: readLayer<ContextRadarProduct>(value.radar, RADAR_VALUES, DEFAULT_CONTEXT_LAYERS.radar),
    satellite: readLayer<ContextSatelliteProduct>(value.satellite, SATELLITE_VALUES, DEFAULT_CONTEXT_LAYERS.satellite),
  };
};

export const CONTEXT_STORAGE_KEY = 'gfc-mesoscale-context-v1';
