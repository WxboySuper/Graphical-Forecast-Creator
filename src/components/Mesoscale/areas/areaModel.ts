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

export const createArea = (geometry: Polygon, now = new Date(), id = crypto.randomUUID(), title = 'Area 1'): MesoscaleArea => {
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
  if (!geometry) return null;
  const polygon = JSON.parse(geoJson.writeGeometry(geometry)) as unknown;
  return isMesoscalePolygon(polygon) ? polygon : null;
};

export const polygonToGeometry = (polygon: Polygon): Geometry => geoJson.readGeometry(polygon) as Geometry;

/** A stable color per hazard label, so any weather type gets a consistent hue. */
export const hazardHue = (hazard: string): number => {
  let hash = 0;
  for (const char of hazard.trim().toLowerCase()) hash = (hash * 31 + char.charCodeAt(0)) % 360;
  return hash;
};

const pad = (value: number): string => String(value).padStart(2, '0');

/** Formats an ISO time for a `datetime-local` input, shown in UTC. */
export const isoToUtcInput = (iso: string): string => {
  const date = new Date(iso);
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}T${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}`;
};

/** Parses a UTC `datetime-local` value; returns null when it is empty or invalid. */
export const utcInputToIso = (value: string): string | null => {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;
  const date = new Date(`${value}:00Z`);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
};

export type AreaFieldErrors = Partial<Record<'title' | 'hazard' | 'window' | 'confidence', string>>;

/** Validates editable area fields with messages worded for the form. */
export const validateAreaFields = (area: Pick<MesoscaleArea, 'title' | 'hazard' | 'confidence' | 'validStart' | 'validEnd'>): AreaFieldErrors => {
  const errors: AreaFieldErrors = {};
  if (!area.title.trim()) errors.title = 'Give the area a title.';
  if (!area.hazard.trim()) errors.hazard = 'Describe the hazard or theme.';
  if (Date.parse(area.validStart) > Date.parse(area.validEnd)) errors.window = 'The end must be after the start.';
  if (area.confidence !== undefined && !(area.confidence >= 0 && area.confidence <= 100)) errors.confidence = 'Use a value from 0 to 100.';
  return errors;
};
