import { OutlookData, SerializedOutlookData, GFCForecastSaveData } from '../types/outlooks';

const CURRENT_VERSION = '0.4.0';

// Helper to convert Map to Array for JSON serialization
const mapToArray = <K, V>(m: Map<K, V>): [K, V][] => Array.from(m.entries());

/**
 * Serializes the current Redux state into a JSON-compatible format.
 */
export const serializeForecast = (
  outlooks: OutlookData,
  mapView: { center: [number, number]; zoom: number }
): GFCForecastSaveData => {
  return {
    version: CURRENT_VERSION,
    timestamp: new Date().toISOString(),
    outlooks: {
      tornado: mapToArray(outlooks.tornado),
      wind: mapToArray(outlooks.wind),
      hail: mapToArray(outlooks.hail),
      categorical: mapToArray(outlooks.categorical),
    },
    mapView
  };
};

/**
 * Deserializes the saved JSON data back into OutlookData.
 */
export const deserializeForecast = (data: GFCForecastSaveData): OutlookData => {
  return {
    tornado: new Map(data.outlooks.tornado),
    wind: new Map(data.outlooks.wind),
    hail: new Map(data.outlooks.hail),
    categorical: new Map(data.outlooks.categorical),
  };
};

/**
 * Validates that the input data conforms to the GFCForecastSaveData schema.
 */
export const validateForecastData = (data: unknown): data is GFCForecastSaveData => {
  if (typeof data !== 'object' || data === null) return false;

  const d = data as Partial<GFCForecastSaveData>;

  // Check required top-level fields (version and timestamp optional for legacy compatibility, but preferred)
  // For strict validation of NEW exports, we'd check them. For loading, we might be lenient.
  // But roadmap asks for "Schema validation (ensure the JSON is valid GFC data)".
  
  if (!d.outlooks || typeof d.outlooks !== 'object') return false;
  if (!d.mapView || typeof d.mapView !== 'object') return false;

  // Validate outlooks structure
  const outlookKeys: (keyof SerializedOutlookData)[] = ['tornado', 'wind', 'hail', 'categorical'];
  for (const key of outlookKeys) {
    if (!Array.isArray(d.outlooks[key])) return false;
    // Optional: Deep check of array items? (Tuple of [string, Feature[]])
    // Basic check:
    const arr = d.outlooks[key];
    if (arr && arr.length > 0) {
      if (!Array.isArray(arr[0]) || arr[0].length !== 2) return false;
    }
  }

  // Validate mapView
  const mv = d.mapView;
  if (!Array.isArray(mv.center) || mv.center.length !== 2 || typeof mv.zoom !== 'number') return false;

  return true;
};

/**
 * Triggers a download of the serialized forecast data as a JSON file.
 */
export const exportForecastToJson = (
  outlooks: OutlookData,
  mapView: { center: [number, number]; zoom: number }
) => {
  const data = serializeForecast(outlooks, mapView);
  const jsonString = JSON.stringify(data, null, 2);
  const blob = new Blob([jsonString], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  
  const now = new Date();
  const timestamp = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const filename = `gfc-forecast-${timestamp}.json`;

  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};
