export interface RadarSiteOption {
  id: string;
  name: string;
  label: string;
  wfoId?: string;
}

const RADAR_SITES_WFS_URL =
  'https://opengeo.ncep.noaa.gov/geoserver/nws/ows?service=WFS&version=1.0.0&request=GetFeature&typeName=nws:radar_sites&outputFormat=application/json';

let cachedRadarSites: RadarSiteOption[] | null = null;

/** Clears the in-memory site list (test-only). */
export const resetRadarSiteCacheForTests = (): void => {
  cachedRadarSites = null;
};

const parseRadarSiteFeature = (feature: unknown): RadarSiteOption | null => {
  if (!feature || typeof feature !== 'object' || !('properties' in feature)) {
    return null;
  }

  const properties = (feature as { properties?: Record<string, unknown> }).properties ?? {};
  const id = typeof properties.rda_id === 'string' ? properties.rda_id.trim().toUpperCase() : '';
  const name = typeof properties.name === 'string' ? properties.name.trim() : '';
  const wfoId = typeof properties.wfo_id === 'string' ? properties.wfo_id.trim() : undefined;

  if (!/^K[A-Z0-9]{3}$/.test(id)) {
    return null;
  }

  return {
    id,
    name: name || id,
    label: name ? `${id} — ${name}` : id,
    wfoId,
  };
};

const parseRadarSites = (payload: unknown): RadarSiteOption[] => {
  if (!payload || typeof payload !== 'object' || !('features' in payload)) {
    return [];
  }

  const features = (payload as { features?: unknown[] }).features ?? [];

  return features
    .map(parseRadarSiteFeature)
    .filter((site): site is RadarSiteOption => Boolean(site))
    .sort((left, right) => left.id.localeCompare(right.id));
};

export const fetchRadarSiteOptions = async (): Promise<RadarSiteOption[]> => {
  if (cachedRadarSites) {
    return cachedRadarSites;
  }

  const response = await fetch(RADAR_SITES_WFS_URL);
  if (!response.ok) {
    throw new Error('Unable to load radar site list.');
  }

  cachedRadarSites = parseRadarSites(await response.json());
  return cachedRadarSites;
};
