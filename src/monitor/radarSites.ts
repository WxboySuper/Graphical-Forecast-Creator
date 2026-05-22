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

import { readRadarSiteProperties } from './radarSiteProperties';

const parseRadarSiteFeature = (feature: unknown): RadarSiteOption | null => {
  const site = readRadarSiteProperties(feature);
  if (!site) {
    return null;
  }

  return {
    id: site.id,
    name: site.name || site.id,
    label: site.name ? `${site.id} — ${site.name}` : site.id,
    wfoId: site.wfoId,
  };
};

const isRadarFeatureCollection = (payload: unknown): payload is { features: unknown[] } =>
  typeof payload === 'object' &&
  payload !== null &&
  'features' in payload &&
  Array.isArray((payload as { features?: unknown[] }).features);

const parseRadarSites = (payload: unknown): RadarSiteOption[] => {
  if (!isRadarFeatureCollection(payload)) {
    return [];
  }

  return payload.features
    .map(parseRadarSiteFeature)
    .filter((site): site is RadarSiteOption => site !== null)
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
