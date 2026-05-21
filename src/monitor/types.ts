export type MonitorRadarMode = 'none' | 'mrms-conus' | 'site';

export type MonitorRadarProduct = 'bref-qcd' | 'cref-qcd' | 'sr-bref' | 'sr-bvel';

export type MonitorSatelliteProduct = 'none' | 'goes-visible' | 'goes-longwave' | 'goes-water-vapor' | 'goes-shortwave';

export type MonitorOutlookSourceKind = 'current' | 'local-cycle' | 'cloud-cycle';

export interface MonitorOutlookSourceSelection {
  kind: MonitorOutlookSourceKind;
  id: string;
}

export interface MonitorMapView {
  center: [number, number];
  zoom: number;
}

export interface MonitorSettings {
  radarMode: MonitorRadarMode;
  radarProduct: MonitorRadarProduct;
  radarSite: string;
  radarOpacity: number;
  satelliteProduct: MonitorSatelliteProduct;
  satelliteOpacity: number;
  outlookSource: MonitorOutlookSourceSelection;
  mapView: MonitorMapView;
  animationEnabled: boolean;
  animationSpeedMs: number;
}

export const DEFAULT_MONITOR_SETTINGS: MonitorSettings = {
  radarMode: 'none',
  radarProduct: 'bref-qcd',
  radarSite: 'KTLX',
  radarOpacity: 0.72,
  satelliteProduct: 'none',
  satelliteOpacity: 0.68,
  outlookSource: {
    kind: 'current',
    id: 'current',
  },
  mapView: {
    center: [39.8283, -98.5795],
    zoom: 4,
  },
  animationEnabled: false,
  animationSpeedMs: 400,
};

const RADAR_MODES: MonitorRadarMode[] = ['none', 'mrms-conus', 'site'];
const RADAR_PRODUCTS: MonitorRadarProduct[] = ['bref-qcd', 'cref-qcd', 'sr-bref', 'sr-bvel'];
const SATELLITE_PRODUCTS: MonitorSatelliteProduct[] = ['none', 'goes-visible', 'goes-longwave', 'goes-water-vapor', 'goes-shortwave'];
const OUTLOOK_KINDS: MonitorOutlookSourceKind[] = ['current', 'local-cycle', 'cloud-cycle'];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === 'object' && !Array.isArray(value));

const readEnum = <T extends string>(value: unknown, allowed: readonly T[], fallback: T): T =>
  typeof value === 'string' && allowed.includes(value as T) ? (value as T) : fallback;

const readNumber = (value: unknown, fallback: number, min: number, max: number): number => {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, value));
};

const readSite = (value: unknown, fallback: string): string => {
  if (typeof value !== 'string') {
    return fallback;
  }

  const normalized = value.trim().toUpperCase();
  return /^K[A-Z0-9]{3}$/.test(normalized) ? normalized : fallback;
};

const readMapView = (value: unknown): MonitorMapView => {
  if (!isRecord(value)) {
    return DEFAULT_MONITOR_SETTINGS.mapView;
  }

  const center = value.center;
  const zoom = value.zoom;
  if (
    Array.isArray(center) &&
    center.length === 2 &&
    typeof center[0] === 'number' &&
    typeof center[1] === 'number' &&
    typeof zoom === 'number'
  ) {
    return {
      center: [
        readNumber(center[0], DEFAULT_MONITOR_SETTINGS.mapView.center[0], -90, 90),
        readNumber(center[1], DEFAULT_MONITOR_SETTINGS.mapView.center[1], -180, 180),
      ],
      zoom: readNumber(zoom, DEFAULT_MONITOR_SETTINGS.mapView.zoom, 2, 14),
    };
  }

  return DEFAULT_MONITOR_SETTINGS.mapView;
};

const readOutlookSource = (value: unknown): MonitorOutlookSourceSelection => {
  if (!isRecord(value)) {
    return DEFAULT_MONITOR_SETTINGS.outlookSource;
  }

  const kind = readEnum(value.kind, OUTLOOK_KINDS, DEFAULT_MONITOR_SETTINGS.outlookSource.kind);
  const id = typeof value.id === 'string' && value.id.trim() ? value.id : DEFAULT_MONITOR_SETTINGS.outlookSource.id;
  return { kind, id };
};

export const normalizeMonitorSettings = (value: unknown): MonitorSettings => {
  if (!isRecord(value)) {
    return DEFAULT_MONITOR_SETTINGS;
  }

  return {
    radarMode: readEnum(value.radarMode, RADAR_MODES, DEFAULT_MONITOR_SETTINGS.radarMode),
    radarProduct: readEnum(value.radarProduct, RADAR_PRODUCTS, DEFAULT_MONITOR_SETTINGS.radarProduct),
    radarSite: readSite(value.radarSite, DEFAULT_MONITOR_SETTINGS.radarSite),
    radarOpacity: readNumber(value.radarOpacity, DEFAULT_MONITOR_SETTINGS.radarOpacity, 0, 1),
    satelliteProduct: readEnum(value.satelliteProduct, SATELLITE_PRODUCTS, DEFAULT_MONITOR_SETTINGS.satelliteProduct),
    satelliteOpacity: readNumber(value.satelliteOpacity, DEFAULT_MONITOR_SETTINGS.satelliteOpacity, 0, 1),
    outlookSource: readOutlookSource(value.outlookSource),
    mapView: readMapView(value.mapView),
    animationEnabled: typeof value.animationEnabled === 'boolean'
      ? value.animationEnabled
      : DEFAULT_MONITOR_SETTINGS.animationEnabled,
    animationSpeedMs: readNumber(value.animationSpeedMs, DEFAULT_MONITOR_SETTINGS.animationSpeedMs, 150, 2000),
  };
};

export const areMonitorSettingsEqual = (left: MonitorSettings, right: MonitorSettings): boolean =>
  JSON.stringify(left) === JSON.stringify(right);
