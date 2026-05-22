export type MonitorRadarMode = 'none' | 'mrms-conus' | 'site';

export type MonitorRadarProduct = 'bref-qcd' | 'cref-qcd' | 'sr-bref' | 'sr-bvel';

export type MonitorSatelliteProduct = 'none' | 'goes-visible' | 'goes-longwave' | 'goes-water-vapor' | 'goes-shortwave';

export type MonitorOutlookSourceKind = 'current' | 'local-cycle' | 'cloud-cycle';

export const MONITOR_OUTLOOK_LAYER_TYPES = ['tornado', 'wind', 'hail', 'categorical'] as const;

export type MonitorOutlookLayerType = (typeof MONITOR_OUTLOOK_LAYER_TYPES)[number];

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
  outlookType: MonitorOutlookLayerType;
  mapView: MonitorMapView;
  animationEnabled: boolean;
  animationSpeedMs: number;
  stormReportsEnabled: boolean;
  stormReportsFilterTornado: boolean;
  stormReportsFilterWind: boolean;
  stormReportsFilterHail: boolean;
  stormReportsMatchOutlookType: boolean;
  alertsEnabled: boolean;
  alertsOpacity: number;
  alertsShowWatches: boolean;
  alertsShowWarnings: boolean;
  alertsShowAdvisories: boolean;
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
  outlookType: 'categorical',
  mapView: {
    center: [39.8283, -98.5795],
    zoom: 4,
  },
  animationEnabled: false,
  animationSpeedMs: 400,
  stormReportsEnabled: true,
  stormReportsFilterTornado: true,
  stormReportsFilterWind: true,
  stormReportsFilterHail: true,
  stormReportsMatchOutlookType: false,
  alertsEnabled: true,
  alertsOpacity: 0.55,
  alertsShowWatches: true,
  alertsShowWarnings: true,
  alertsShowAdvisories: false,
};

const RADAR_MODES: MonitorRadarMode[] = ['none', 'mrms-conus', 'site'];
const RADAR_PRODUCTS: MonitorRadarProduct[] = ['bref-qcd', 'cref-qcd', 'sr-bref', 'sr-bvel'];
const SATELLITE_PRODUCTS: MonitorSatelliteProduct[] = ['none', 'goes-visible', 'goes-longwave', 'goes-water-vapor', 'goes-shortwave'];
const OUTLOOK_KINDS: MonitorOutlookSourceKind[] = ['current', 'local-cycle', 'cloud-cycle'];
const OUTLOOK_LAYER_TYPES: MonitorOutlookLayerType[] = [...MONITOR_OUTLOOK_LAYER_TYPES];

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
    outlookType: readEnum(value.outlookType, OUTLOOK_LAYER_TYPES, DEFAULT_MONITOR_SETTINGS.outlookType),
    mapView: readMapView(value.mapView),
    animationEnabled: typeof value.animationEnabled === 'boolean'
      ? value.animationEnabled
      : DEFAULT_MONITOR_SETTINGS.animationEnabled,
    animationSpeedMs: readNumber(value.animationSpeedMs, DEFAULT_MONITOR_SETTINGS.animationSpeedMs, 150, 2000),
    stormReportsEnabled: typeof value.stormReportsEnabled === 'boolean'
      ? value.stormReportsEnabled
      : DEFAULT_MONITOR_SETTINGS.stormReportsEnabled,
    stormReportsFilterTornado: typeof value.stormReportsFilterTornado === 'boolean'
      ? value.stormReportsFilterTornado
      : DEFAULT_MONITOR_SETTINGS.stormReportsFilterTornado,
    stormReportsFilterWind: typeof value.stormReportsFilterWind === 'boolean'
      ? value.stormReportsFilterWind
      : DEFAULT_MONITOR_SETTINGS.stormReportsFilterWind,
    stormReportsFilterHail: typeof value.stormReportsFilterHail === 'boolean'
      ? value.stormReportsFilterHail
      : DEFAULT_MONITOR_SETTINGS.stormReportsFilterHail,
    stormReportsMatchOutlookType: typeof value.stormReportsMatchOutlookType === 'boolean'
      ? value.stormReportsMatchOutlookType
      : DEFAULT_MONITOR_SETTINGS.stormReportsMatchOutlookType,
    alertsEnabled: typeof value.alertsEnabled === 'boolean'
      ? value.alertsEnabled
      : DEFAULT_MONITOR_SETTINGS.alertsEnabled,
    alertsOpacity: readNumber(value.alertsOpacity, DEFAULT_MONITOR_SETTINGS.alertsOpacity, 0, 1),
    alertsShowWatches: typeof value.alertsShowWatches === 'boolean'
      ? value.alertsShowWatches
      : DEFAULT_MONITOR_SETTINGS.alertsShowWatches,
    alertsShowWarnings: typeof value.alertsShowWarnings === 'boolean'
      ? value.alertsShowWarnings
      : DEFAULT_MONITOR_SETTINGS.alertsShowWarnings,
    alertsShowAdvisories: typeof value.alertsShowAdvisories === 'boolean'
      ? value.alertsShowAdvisories
      : DEFAULT_MONITOR_SETTINGS.alertsShowAdvisories,
  };
};

export const areMonitorSettingsEqual = (left: MonitorSettings, right: MonitorSettings): boolean =>
  JSON.stringify(left) === JSON.stringify(right);
