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

  // geometry must be object or null (though typically object for us)
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
 * Validates the full forecast data structure from localStorage or file
 */
export const validateForecastData = (data: unknown): data is SavedData => {
  if (typeof data !== 'object' || data === null) return false;

  const savedData = data as Record<string, unknown>;

  // Validate outlooks
  if (typeof savedData.outlooks !== 'object' || savedData.outlooks === null) return false;

  const outlooks = savedData.outlooks as Record<string, unknown>;
  const requiredOutlookTypes = ['tornado', 'wind', 'hail', 'categorical'];

  for (const type of requiredOutlookTypes) {
    if (!Object.prototype.hasOwnProperty.call(outlooks, type)) return false;
    if (!isValidOutlookEntries(outlooks[type])) return false;
  }

  // Validate mapView if present (it's optional)
  if (Object.prototype.hasOwnProperty.call(savedData, 'mapView')) {
    const mapView = savedData.mapView as Record<string, unknown>;

    if (typeof mapView !== 'object' || mapView === null) return false;

    if (!Array.isArray(mapView.center) || mapView.center.length !== 2) return false;
    if (typeof mapView.center[0] !== 'number' || typeof mapView.center[1] !== 'number') return false;

    if (typeof mapView.zoom !== 'number') return false;
  }

  return true;
};
