/**
 * Demo catalogs: realistic, always-fresh catalog data for local development of the
 * Mesoscale workspace. Cycle times are derived from the current clock so the data
 * reads as current, the HRRR catalog carries f00-f06, and each field has its own
 * placeholder tile image. Demo data is never real model output and is only served
 * when the local-only demo flag is on.
 */
import type { MesoscaleCatalog, MesoscaleCatalogFrame, MesoscaleCatalogParameter, MesoscaleLatestPointer } from '../catalogContracts';
import type { MesoscaleModelId } from '../contracts';
import { resolveCycleId } from '../catalogRequestValidation';

type Stop = [value: number, color: string];
interface DemoField { id: string; name: string; units: string; levelLabel: string; stops: Stop[] }

const DEMO_FIELDS: DemoField[] = [
  { id: 'cape-surface', name: 'CAPE (surface)', units: 'J kg⁻¹', levelLabel: 'surface', stops: [[0, '#fff7bc'], [500, '#fec44f'], [1500, '#fe9929'], [3000, '#cc4c02'], [5000, '#7f0000']] },
  { id: 'cin-surface', name: 'CIN (surface)', units: 'J kg⁻¹', levelLabel: 'surface', stops: [[-300, '#542788'], [-150, '#998ec3'], [-50, '#d8daeb'], [0, '#f7f7f7']] },
  { id: 'srh-0-1km', name: 'Storm-relative helicity, 0-1 km', units: 'm² s⁻²', levelLabel: '0-1 km above ground', stops: [[0, '#ffffcc'], [100, '#a1dab4'], [200, '#41b6c4'], [300, '#2c7fb8'], [500, '#253494']] },
  { id: 'srh-0-3km', name: 'Storm-relative helicity, 0-3 km', units: 'm² s⁻²', levelLabel: '0-3 km above ground', stops: [[0, '#ffffcc'], [100, '#a1dab4'], [200, '#41b6c4'], [300, '#2c7fb8'], [500, '#253494']] },
  { id: 'wind-speed-10m', name: '10 m wind speed', units: 'm s⁻¹', levelLabel: '10 m above ground', stops: [[0, '#f7fbff'], [5, '#c6dbef'], [10, '#6baed6'], [20, '#2171b5'], [35, '#08306b']] },
  { id: 'temperature-2m', name: '2 m temperature', units: '°C', levelLabel: '2 m above ground', stops: [[-40, '#313695'], [-20, '#4575b4'], [0, '#abd9e9'], [15, '#ffffbf'], [30, '#fdae61'], [45, '#a50026']] },
  { id: 'dewpoint-2m', name: '2 m dewpoint', units: '°C', levelLabel: '2 m above ground', stops: [[-40, '#542788'], [-20, '#998ec3'], [0, '#f7f7f7'], [15, '#7fbf7b'], [25, '#1b7837']] },
  { id: 'surface-lcl', name: 'LCL height (surface-based parcel)', units: 'm', levelLabel: 'surface-based parcel LCL', stops: [[0, '#edf8fb'], [500, '#b2e2e2'], [1000, '#66c2a4'], [2000, '#2ca25f'], [3000, '#006d2c']] },
  { id: 'pwat', name: 'Precipitable water', units: 'kg m⁻²', levelLabel: 'entire atmosphere', stops: [[0, '#fff7fb'], [10, '#ece7f2'], [25, '#a6bddb'], [40, '#2b8cbe'], [60, '#045a8d']] },
  { id: 'mslp', name: 'Mean sea level pressure', units: 'hPa', levelLabel: 'mean sea level', stops: [[960, '#313695'], [980, '#74add1'], [1000, '#ffffbf'], [1020, '#fdae61'], [1040, '#a50026']] },
  { id: 'reflectivity', name: 'Composite reflectivity', units: 'dBZ', levelLabel: 'entire atmosphere', stops: [[5, '#04e9e7'], [20, '#019ff4'], [35, '#0300f4'], [45, '#02fd02'], [55, '#fdf802'], [65, '#fd0100'], [75, '#a80000']] },
];

const MODEL_NAMES: Record<MesoscaleModelId, string> = {
  hrrr: 'High-Resolution Rapid Refresh',
  rap: 'Rapid Refresh',
  rrfs: 'Rapid Refresh Forecast System',
};

/** Forecast hours each demo model publishes, matching the ingest. */
const DEMO_HOURS: Record<MesoscaleModelId, number[]> = { hrrr: [0, 1, 2, 3, 4, 5, 6], rap: [0], rrfs: [0] };
/** How far behind the clock each model's latest cycle runs, in hours. */
const DEMO_LAG_HOURS: Record<MesoscaleModelId, number> = { hrrr: 1, rap: 1, rrfs: 2 };

const HOUR_MS = 3_600_000;

const cycleTimeFor = (model: MesoscaleModelId, now: number): string =>
  new Date(Math.floor(now / HOUR_MS) * HOUR_MS - DEMO_LAG_HOURS[model] * HOUR_MS).toISOString().replace('.000Z', 'Z');

const sourceFor = (model: MesoscaleModelId): MesoscaleCatalogParameter['source'] => ({
  providerId: 'demo-data',
  providerName: 'Demo data (not real model output)',
  datasetId: `demo-${model}`,
  attribution: `Demo placeholder imagery for ${model.toUpperCase()}. Not real model output.`,
  url: 'https://example.invalid/demo',
});

const parameterFor = (field: DemoField, model: MesoscaleModelId): MesoscaleCatalogParameter => ({
  id: field.id,
  displayName: field.name,
  units: field.units,
  level: { type: 'layer', label: field.levelLabel },
  legend: field.stops.map(([value, color]) => ({ value, label: String(value), color })),
  displayType: 'raster',
  data: {
    type: 'xyz-raster',
    urlTemplate: `/mesoscale-demo/${field.id}.png?z={z}&x={x}&y={y}`,
    format: 'image/png',
    projection: 'EPSG:3857',
    minZoom: 3,
    maxZoom: 6,
    bounds: [-125, 24, -66, 50],
  },
  source: sourceFor(model),
  status: 'complete',
});

const frameFor = (model: MesoscaleModelId, cycleTime: string, hour: number): MesoscaleCatalogFrame => ({
  forecastHour: hour,
  validTime: new Date(Date.parse(cycleTime) + hour * HOUR_MS).toISOString().replace('.000Z', 'Z'),
  frameType: hour === 0 ? 'analysis' : 'forecast',
  status: 'complete',
  parameters: DEMO_FIELDS.map(field => parameterFor(field, model)),
});

export const getDemoCatalog = (model: MesoscaleModelId, now = Date.now()): MesoscaleCatalog => {
  const cycleTime = cycleTimeFor(model, now);
  return {
    schemaVersion: 1,
    model: { id: model, name: MODEL_NAMES[model] },
    cycleTime,
    status: 'complete',
    ageMinutes: Math.max(0, Math.floor((now - Date.parse(cycleTime)) / 60_000)),
    domain: { id: 'conus', name: 'CONUS', projection: 'EPSG:3857', bounds: [-125, 24, -66, 50], minZoom: 3, maxZoom: 6 },
    source: sourceFor(model),
    frames: DEMO_HOURS[model].map(hour => frameFor(model, cycleTime, hour)),
  };
};

export const getDemoLatest = (model: MesoscaleModelId, now = Date.now()): MesoscaleLatestPointer => {
  const cycleTime = cycleTimeFor(model, now);
  return { schemaVersion: 1, modelId: model, cycleTime, catalogUrl: `/mesoscale-fixtures/catalog/${model}/${resolveCycleId(cycleTime)}.json`, publishedAt: cycleTime };
};

export const getDemoCatalogForCycle = (model: MesoscaleModelId, cycle: string, now = Date.now()): MesoscaleCatalog | null => {
  const catalog = getDemoCatalog(model, now);
  return resolveCycleId(catalog.cycleTime) === cycle ? catalog : null;
};
