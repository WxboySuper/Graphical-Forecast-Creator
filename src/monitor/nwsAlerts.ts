import type { FeatureCollection, Geometry } from 'geojson';
import { Fill, Stroke, Style } from 'ol/style';

export const NWS_ACTIVE_ALERTS_URL = 'https://api.weather.gov/alerts/active?status=actual';
export const NWS_API_USER_AGENT = 'GraphicalForecastCreator/1.6 (monitor)';

export type NwsAlertCategory = 'watch' | 'warning' | 'advisory' | 'statement' | 'other';

export interface NwsAlertFeatureCollection extends FeatureCollection {
  features: Array<FeatureCollection['features'][number] & {
    properties: Record<string, unknown>;
  }>;
}

export const classifyNwsAlert = (event: string): NwsAlertCategory => {
  const normalized = event.trim().toLowerCase();
  if (normalized.includes('watch')) {
    return 'watch';
  }
  if (normalized.includes('warning')) {
    return 'warning';
  }
  if (normalized.includes('advisory')) {
    return 'advisory';
  }
  if (normalized.includes('statement')) {
    return 'statement';
  }
  return 'other';
};

export const filterNwsAlertCollection = (
  collection: NwsAlertFeatureCollection,
  options: {
    showWatches: boolean;
    showWarnings: boolean;
    showAdvisories: boolean;
  },
): NwsAlertFeatureCollection => {
  const features = collection.features.filter((feature) => {
    if (!feature.geometry) {
      return false;
    }

    const event = typeof feature.properties?.event === 'string' ? feature.properties.event : '';
    const category = classifyNwsAlert(event);

    if (category === 'watch') {
      return options.showWatches;
    }
    if (category === 'warning') {
      return options.showWarnings;
    }
    if (category === 'advisory') {
      return options.showAdvisories;
    }

    return options.showAdvisories;
  });

  return {
    type: 'FeatureCollection',
    features,
  };
};

const alertColors: Record<NwsAlertCategory, { fill: string; stroke: string }> = {
  watch: { fill: 'rgba(255, 235, 59, 0.28)', stroke: 'rgba(251, 192, 45, 0.95)' },
  warning: { fill: 'rgba(239, 68, 68, 0.32)', stroke: 'rgba(185, 28, 28, 0.95)' },
  advisory: { fill: 'rgba(96, 165, 250, 0.26)', stroke: 'rgba(37, 99, 235, 0.9)' },
  statement: { fill: 'rgba(148, 163, 184, 0.2)', stroke: 'rgba(100, 116, 139, 0.85)' },
  other: { fill: 'rgba(148, 163, 184, 0.18)', stroke: 'rgba(71, 85, 105, 0.85)' },
};

export const buildNwsAlertStyle = (event: string): Style => {
  const category = classifyNwsAlert(event);
  const colors = alertColors[category];

  return new Style({
    fill: new Fill({ color: colors.fill }),
    stroke: new Stroke({ color: colors.stroke, width: 2 }),
  });
};

export const fetchActiveNwsAlerts = async (): Promise<NwsAlertFeatureCollection> => {
  const response = await fetch(NWS_ACTIVE_ALERTS_URL, {
    headers: {
      Accept: 'application/geo+json',
      'User-Agent': NWS_API_USER_AGENT,
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch NWS alerts: ${response.statusText}`);
  }

  const payload = await response.json() as NwsAlertFeatureCollection;
  return {
    type: 'FeatureCollection',
    features: Array.isArray(payload.features) ? payload.features : [],
  };
};

export const collectionHasGeometry = (collection: NwsAlertFeatureCollection): boolean =>
  collection.features.some((feature) => Boolean(feature.geometry));

export const snapshotCollectionKey = (collection: NwsAlertFeatureCollection): string =>
  collection.features
    .map((feature) => {
      const id = feature.id ?? feature.properties?.id ?? '';
      const updated = feature.properties?.updated ?? '';
      return `${String(id)}:${String(updated)}`;
    })
    .sort()
    .join('|');

export const isPolygonalGeometry = (geometry: Geometry | null | undefined): geometry is Geometry =>
  Boolean(
    geometry &&
    (geometry.type === 'Polygon' ||
      geometry.type === 'MultiPolygon' ||
      geometry.type === 'GeometryCollection'),
  );
