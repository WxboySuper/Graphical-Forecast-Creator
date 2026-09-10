/**
 * National Weather Service alert helpers for Monitor. It defines alert data
 * types and converts NWS feature collections into normalized monitor records.
 */
import type { FeatureCollection } from 'geojson';
import { Fill, Stroke, Style } from 'ol/style';

export const NWS_API_USER_AGENT = 'GraphicalForecastCreator/1.6 (monitor)';
export const MAX_ACTIVE_ALERTS = 500;
export const NWS_ACTIVE_ALERTS_URL =
  `https://api.weather.gov/alerts/active?status=actual&limit=${MAX_ACTIVE_ALERTS}`;

export type NwsAlertCategory = 'watch' | 'warning' | 'advisory' | 'statement' | 'other';

export interface NwsAlertFeatureCollection extends FeatureCollection {
  features: Array<FeatureCollection['features'][number] & {
    properties: Record<string, unknown>;
  }>;
}

/** Classifies an NWS event label for display filtering and styling. */
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

/** Filters alert polygons according to the Monitor category toggles. */
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

/** Builds the OpenLayers style associated with an NWS event category. */
export const buildNwsAlertStyle = (event: string): Style => {
  const category = classifyNwsAlert(event);
  const colors = alertColors[category];

  return new Style({
    fill: new Fill({ color: colors.fill }),
    stroke: new Stroke({ color: colors.stroke, width: 2 }),
  });
};

/** Fetches and bounds the active NWS alert collection. */
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

/** Extracts stable identity/version tokens for alert snapshot comparisons. */
const alertSnapshotTokens = (collection: NwsAlertFeatureCollection): string[] =>
  collection.features.map((feature) => {
    const id = feature.id ?? feature.properties?.id ?? '';
    const updated = feature.properties?.updated ?? '';
    return `${String(id)}:${String(updated)}|`;
  });

/** Hash alert identities so frame comparisons do not retain a second full ID string. */
export const snapshotCollectionKey = (collection: NwsAlertFeatureCollection): string => {
  let firstHash = 0;
  let secondHash = 0;
  for (const token of alertSnapshotTokens(collection)) {
    let firstTokenHash = 2166136261;
    let secondTokenHash = 2246822519;
    for (const character of token) {
      const code = character.charCodeAt(0);
      firstTokenHash = Math.imul(firstTokenHash ^ code, 16777619);
      secondTokenHash = Math.imul(secondTokenHash ^ code, 3266489917);
    }
    firstHash = (firstHash + firstTokenHash) >>> 0;
    secondHash ^= secondTokenHash;
  }
  return `${collection.features.length}:${firstHash >>> 0}:${secondHash >>> 0}`;
};

/** Compares alert snapshots exactly after the bounded digest passes. */
export const snapshotCollectionsEqual = (
  left: NwsAlertFeatureCollection,
  right: NwsAlertFeatureCollection,
): boolean => {
  if (left.features.length !== right.features.length
    || snapshotCollectionKey(left) !== snapshotCollectionKey(right)) {
    return false;
  }

  const rightCounts = new Map<string, number>();
  alertSnapshotTokens(right).forEach((token) => {
    rightCounts.set(token, (rightCounts.get(token) ?? 0) + 1);
  });
  return alertSnapshotTokens(left).every((token) => {
    const count = rightCounts.get(token) ?? 0;
    if (count === 0) {
      return false;
    }
    rightCounts.set(token, count - 1);
    return true;
  });
};

/** Appends a changed alert snapshot while retaining only the animation frame window. */
export const appendAlertSnapshotFrame = (
  current: NwsAlertFeatureCollection[],
  collection: NwsAlertFeatureCollection,
  maxFrames: number,
): NwsAlertFeatureCollection[] => {
  const last = current[current.length - 1];
  if (last && snapshotCollectionsEqual(last, collection)) return current;
  return [...current, collection].slice(-maxFrames);
};
