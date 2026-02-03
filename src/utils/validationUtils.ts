import { Feature, Geometry, GeoJsonProperties } from 'geojson';
import { GFCForecastSaveData } from '../types/outlooks';

/**
 * Validates if a value is a plain object
 */
const isObject = (val: unknown): val is Record<string, unknown> => 
  typeof val === 'object' && val !== null && !Array.isArray(val);

/**
 * Validates GeoJSON Geometry
 */
const isValidGeometry = (geometry: unknown): geometry is Geometry => {
  if (geometry === null) return true;
  if (!isObject(geometry)) return false;

  const type = geometry.type as string;
  const validTypes = [
    'Point', 'MultiPoint', 'LineString', 'MultiLineString', 
    'Polygon', 'MultiPolygon', 'GeometryCollection'
  ];

  if (!validTypes.includes(type)) return false;

  if (type === 'GeometryCollection') {
    const geometries = geometry.geometries;
    return Array.isArray(geometries) && geometries.every(isValidGeometry);
  }

  // Most geometries should have coordinates
  const coordinates = geometry.coordinates;
  return Array.isArray(coordinates);
};

/**
 * Validates if a value is a valid GeoJSON Feature
 */
const isValidFeature = (value: unknown): value is Feature<Geometry, GeoJsonProperties> => {
  if (!isObject(value)) return false;

  return value.type === 'Feature' &&
         isValidGeometry(value.geometry) &&
         isObject(value.properties);
};

/**
 * Validates if a value is a valid array of [string, Feature[]] entries
 */
const isValidOutlookEntries = (value: unknown): value is [string, Feature<Geometry, GeoJsonProperties>[]][] => {
  if (!Array.isArray(value)) return false;

  return value.every(entry => {
    if (!Array.isArray(entry) || entry.length !== 2) return false;

    const [probability, features] = entry;

    // Reject empty or non-string probabilities
    if (typeof probability !== 'string' || probability.trim() === '') return false;

    if (!Array.isArray(features)) return false;

    return features.every(isValidFeature);
  });
};

/**
 * Validates the legacy outlooks object structure (v0.4.0)
 */
const isValidLegacyOutlooks = (outlooks: unknown): boolean => {
  if (!isObject(outlooks)) return false;

  const types = ['tornado', 'wind', 'hail', 'categorical'];
  for (const t of types) {
    if (outlooks[t] !== undefined && !isValidOutlookEntries(outlooks[t])) return false;
  }
  return true;
};

/**
 * Validates the new forecastCycle structure (v0.5.0)
 */
const isValidForecastCycle = (cycle: unknown): boolean => {
  if (!isObject(cycle)) return false;

  if (typeof cycle.currentDay !== 'number') return false;
  if (!isObject(cycle.days)) return false;

  const days = cycle.days as Record<string, unknown>;
  for (const day of Object.values(days)) {
    if (!isObject(day)) return false;
    if (!isObject(day.data)) return false;
    
    // Validate each outlook map in the day's data
    for (const outlookEntries of Object.values(day.data as Record<string, unknown>)) {
      if (!isValidOutlookEntries(outlookEntries)) return false;
    }
  }

  return true;
};

/**
 * Validates the mapView object structure
 */
const isValidMapView = (mapView: unknown): boolean => {
  if (!isObject(mapView)) return false;

  if (!Array.isArray(mapView.center) || mapView.center.length !== 2) return false;
  if (typeof mapView.center[0] !== 'number' || typeof mapView.center[1] !== 'number') return false;
  if (typeof mapView.zoom !== 'number') return false;

  return true;
};

/**
 * Validates the full forecast data structure
 */
export const validateForecastData = (data: unknown): data is GFCForecastSaveData => {
  if (!isObject(data)) return false;

  const d = data as Record<string, unknown>;

  // Must have either forecastCycle or outlooks
  if (!d.forecastCycle && !d.outlooks) return false;

  if (d.forecastCycle && !isValidForecastCycle(d.forecastCycle)) return false;
  if (d.outlooks && !isValidLegacyOutlooks(d.outlooks)) return false;

  if (d.mapView !== undefined && !isValidMapView(d.mapView)) return false;

  return true;
};
