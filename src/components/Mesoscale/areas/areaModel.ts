/**
 * Pure helpers for Mesoscale areas: building new areas, hazard colors, UTC time
 * inputs, and geometry conversion between OpenLayers features and the stored
 * GeoJSON polygons.
 */
import GeoJSON from 'ol/format/GeoJSON';
import type Feature from 'ol/Feature';
import type { Geometry } from 'ol/geom';
import type { Polygon } from 'geojson';
import type { MesoscaleArea } from '../../../store/mesoscaleSlice';
import { isMesoscalePolygon } from '../../../utils/mesoscaleGeometryValidation';

export const AREA_DEFAULT_HOURS = 3;
export const DEFAULT_HAZARD = 'Area of interest';
export const HAZARD_SUGGESTIONS = [
  'Severe thunderstorms', 'Tornado potential', 'Flash flooding', 'Heavy snow', 'Freezing rain', 'Wildfire weather', 'High wind', 'Dense fog',
];

const geoJson = new GeoJSON({ dataProjection: 'EPSG:4326', featureProjection: 'EPSG:3857' });
const HOUR_MS = 3_600_000;

/** Builds an area with a default valid window starting at the current hour. */
/** The first "Area N" title not already used, so new areas are told apart in the list and on the map. */
export const nextAreaTitle = (titles: string[]): string => {
  let n = titles.length + 1;
  while (titles.includes(`Area ${n}`)) n += 1;
  return `Area ${n}`;
};

/** Uses WebCrypto when available (it is missing on insecure origins and older browsers). */
export const newAreaId = (): string =>
  globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

interface CreateAreaOptions { now?: Date; id?: string; title?: string }

export const createArea = (geometry: Polygon, options: CreateAreaOptions = {}): MesoscaleArea => {
  const { now = new Date(), id = newAreaId(), title = 'Area 1' } = options;
  const start = new Date(Math.floor(now.getTime() / HOUR_MS) * HOUR_MS);
  const timestamp = now.toISOString();
  return {
    id,
    title,
    hazard: DEFAULT_HAZARD,
    validStart: start.toISOString(),
    validEnd: new Date(start.getTime() + AREA_DEFAULT_HOURS * HOUR_MS).toISOString(),
    geometry,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
};

/** Reads a drawn or modified feature back as a stored polygon, or null when it is not a valid polygon. */
export const featureToPolygon = (feature: Feature<Geometry>): Polygon | null => {
  const geometry = feature.getGeometry();
  return geometry ? geometryToPolygon(geometry) : null;
};

/** Writes an OpenLayers geometry as a stored polygon, or null when it is not a valid polygon. */
export const geometryToPolygon = (geometry: Geometry): Polygon | null => {
  const polygon = JSON.parse(geoJson.writeGeometry(geometry)) as unknown;
  return isMesoscalePolygon(polygon) ? polygon : null;
};

/** Reads a stored polygon for display; returns null instead of throwing so one bad area cannot blank the map. */
export const polygonToGeometry = (polygon: Polygon): Geometry | null => {
  try {
    return geoJson.readGeometry(polygon) as Geometry;
  } catch {
    return null;
  }
};

/** Fixed, well-separated hues for the suggested hazards; anything else gets a stable hash hue. */
const KNOWN_HAZARD_HUES: Record<string, number> = {
  'severe thunderstorms': 32,
  'tornado potential': 350,
  'flash flooding': 215,
  'heavy snow': 190,
  'freezing rain': 275,
  'wildfire weather': 12,
  'high wind': 135,
  'dense fog': 255,
  'area of interest': 160,
};

export const hazardHue = (hazard: string): number => {
  const key = hazard.trim().toLowerCase();
  if (Object.hasOwn(KNOWN_HAZARD_HUES, key)) return KNOWN_HAZARD_HUES[key];
  let hash = 2166136261;
  for (const char of key) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return Math.abs(hash) % 360;
};

const pad = (value: number): string => String(value).padStart(2, '0');

/** Formats an ISO time for a `datetime-local` input, shown in UTC. */
export const isoToUtcInput = (iso: string): string => {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return '';
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}T${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}`;
};

/** Parses a UTC `datetime-local` value; returns null when it is empty or invalid. */
export const utcInputToIso = (value: string): string | null => {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;
  const date = new Date(`${value}:00Z`);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
};

export type AreaFieldErrors = Partial<Record<'title' | 'hazard' | 'window' | 'confidence', string>>;
type EditableFields = Pick<MesoscaleArea, 'title' | 'hazard' | 'confidence' | 'validStart' | 'validEnd'>;

const isBlank = (value: string): boolean => value.trim().length === 0;
// Written as a negated <= so an unparsable time (NaN) is reported too.
const isReversedWindow = (area: EditableFields): boolean => !(Date.parse(area.validStart) <= Date.parse(area.validEnd));
const isBadConfidence = (value: number | undefined): boolean => value !== undefined && !(value >= 0 && value <= 100);

const FIELD_RULES: Array<[keyof AreaFieldErrors, (area: EditableFields) => boolean, string]> = [
  ['title', (area) => isBlank(area.title), 'Give the area a title.'],
  ['hazard', (area) => isBlank(area.hazard), 'Describe the hazard or theme.'],
  ['window', isReversedWindow, 'The end cannot be before the start.'],
  ['confidence', (area) => isBadConfidence(area.confidence), 'Use a value from 0 to 100.'],
];

/** Validates editable area fields with messages worded for the form. */
export const validateAreaFields = (area: EditableFields): AreaFieldErrors =>
  Object.fromEntries(FIELD_RULES.filter(([, failed]) => failed(area)).map(([field, , message]) => [field, message]));
