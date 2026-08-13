import type { FeatureCollection } from 'geojson';
import { Fill, Stroke, Style } from 'ol/style';

export const NWS_ACTIVE_ALERTS_URL = 'https://api.weather.gov/alerts/active?status=actual&limit=500';
export const NWS_API_USER_AGENT = 'GraphicalForecastCreator/1.6 (monitor)';
export const MAX_ACTIVE_ALERTS = 500;

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

    // Statements and uncategorized alerts have no dedicated toggle.
    return true;
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
    features: Array.isArray(payload.features) ? payload.features.slice(0, MAX_ACTIVE_ALERTS) : [],
  };
};

/** Hash alert identities so frame comparisons do not retain a second full ID string. */
export const snapshotCollectionKey = (collection: NwsAlertFeatureCollection): string => {
  let hash = 2166136261;
  collection.features.forEach((feature) => {
      const id = feature.id ?? feature.properties?.id ?? '';
      const updated = feature.properties?.updated ?? '';
      for (const character of `${String(id)}:${String(updated)}|`) {
        hash ^= character.charCodeAt(0);
        hash = Math.imul(hash, 16777619);
      }
    });
  return `${collection.features.length}:${hash >>> 0}`;
};
