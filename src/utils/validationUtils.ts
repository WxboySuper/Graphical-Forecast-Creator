import { Feature, Geometry, GeoJsonProperties } from 'geojson';

// Define the shape of the data we expect to load
interface SavedData {
  outlooks: {
    tornado: [string, Feature<Geometry, GeoJsonProperties>[]][];
    wind: [string, Feature<Geometry, GeoJsonProperties>[]][];
    hail: [string, Feature<Geometry, GeoJsonProperties>[]][];
    categorical: [string, Feature<Geometry, GeoJsonProperties>[]][];
  };
  mapView?: {
    center: [number, number];
    zoom: number;
  };
}

/**
 * Validates if a value is a valid GeoJSON Feature
 */
const isValidFeature = (value: unknown): value is Feature<Geometry, GeoJsonProperties> => {
  if (typeof value !== 'object' || value === null) return false;

  const feature = value as Record<string, unknown>;

  if (feature.type !== 'Feature') return false;

  // geometry must be object or null
  if (!Object.prototype.hasOwnProperty.call(feature, 'geometry')) return false;
  if (feature.geometry !== null && typeof feature.geometry !== 'object') return false;

  // properties must be object or null
  if (!Object.prototype.hasOwnProperty.call(feature, 'properties')) return false;
  if (feature.properties !== null && typeof feature.properties !== 'object') return false;

  return true;
};

/**
 * Validates if a value is a valid array of [string, Feature[]] entries
 */
const isValidOutlookEntries = (value: unknown): value is [string, Feature<Geometry, GeoJsonProperties>[]][] => {
  if (!Array.isArray(value)) return false;

  return value.every(entry => {
    // Must be array of length 2
    if (!Array.isArray(entry) || entry.length !== 2) return false;

    const [probability, features] = entry;

    // First element must be string (probability/risk)
    if (typeof probability !== 'string') return false;

    // Second element must be array of features
    if (!Array.isArray(features)) return false;

    return features.every(isValidFeature);
  });
};

/**
 * Validates the outlooks object structure
 */
const isValidOutlooksObject = (outlooks: unknown): boolean => {
  if (typeof outlooks !== 'object' || outlooks === null) return false;

  const outlooksRecord = outlooks as Record<string, unknown>;
  const requiredOutlookTypes = ['tornado', 'wind', 'hail', 'categorical'];

  for (const type of requiredOutlookTypes) {
    if (!Object.prototype.hasOwnProperty.call(outlooksRecord, type)) return false;
    if (!isValidOutlookEntries(outlooksRecord[type])) return false;
  }

  return true;
};

/**
 * Validates the mapView object structure
 */
const isValidMapView = (mapView: unknown): boolean => {
  if (typeof mapView !== 'object' || mapView === null) return false;

  const view = mapView as { center?: unknown; zoom?: unknown };

  // Validate center
  if (!Array.isArray(view.center) || view.center.length !== 2) return false;
  if (typeof view.center[0] !== 'number' || typeof view.center[1] !== 'number') return false;

  // Validate zoom
  if (typeof view.zoom !== 'number') return false;

  return true;
};

/**
 * Validates the full forecast data structure from localStorage or file
 */
export const validateForecastData = (data: unknown): data is SavedData => {
  if (typeof data !== 'object' || data === null) return false;

  const savedData = data as Record<string, unknown>;

  if (!isValidOutlooksObject(savedData.outlooks)) return false;

  if (Object.prototype.hasOwnProperty.call(savedData, 'mapView')) {
    if (!isValidMapView(savedData.mapView)) return false;
  }

  return true;
};
