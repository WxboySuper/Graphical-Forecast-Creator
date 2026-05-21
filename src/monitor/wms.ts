import type { MonitorRadarMode, MonitorRadarProduct, MonitorSatelliteProduct } from './types';

export interface WmsLayerConfig {
  url: string;
  layer: string;
  latestTime?: string;
}

export interface WmsLayerTime {
  layerName: string;
  latestTime?: string;
  timeValues: string[];
}

/** Maximum WMS frames to loop during playback (keeps animation responsive). */
export const MAX_ANIMATION_FRAMES = 12;

export const MRMS_PRODUCTS: Array<{ value: MonitorRadarProduct; label: string; mode: MonitorRadarMode }> = [
  { value: 'bref-qcd', label: 'MRMS Base Reflectivity', mode: 'mrms-conus' },
  { value: 'cref-qcd', label: 'MRMS Composite Reflectivity', mode: 'mrms-conus' },
  { value: 'sr-bref', label: 'Site Base Reflectivity', mode: 'site' },
  { value: 'sr-bvel', label: 'Site Base Velocity', mode: 'site' },
];

export const SATELLITE_PRODUCTS: Array<{ value: MonitorSatelliteProduct; label: string }> = [
  { value: 'none', label: 'Off' },
  { value: 'goes-visible', label: 'GOES Visible' },
  { value: 'goes-longwave', label: 'GOES Longwave IR' },
  { value: 'goes-water-vapor', label: 'GOES Water Vapor' },
  { value: 'goes-shortwave', label: 'GOES Shortwave IR' },
];

const MRMS_LAYER_BY_PRODUCT: Record<Extract<MonitorRadarProduct, 'bref-qcd' | 'cref-qcd'>, WmsLayerConfig> = {
  'bref-qcd': {
    url: 'https://opengeo.ncep.noaa.gov/geoserver/conus/conus_bref_qcd/ows',
    layer: 'conus_bref_qcd',
  },
  'cref-qcd': {
    url: 'https://opengeo.ncep.noaa.gov/geoserver/conus/conus_cref_qcd/ows',
    layer: 'conus_cref_qcd',
  },
};

const SITE_LAYER_SUFFIX_BY_PRODUCT: Record<Extract<MonitorRadarProduct, 'sr-bref' | 'sr-bvel'>, string> = {
  'sr-bref': 'sr_bref',
  'sr-bvel': 'sr_bvel',
};

const SATELLITE_LAYER_BY_PRODUCT: Record<Exclude<MonitorSatelliteProduct, 'none'>, WmsLayerConfig> = {
  'goes-visible': {
    url: 'https://nowcoast.noaa.gov/geoserver/observations/satellite/ows',
    layer: 'goes_visible_imagery',
  },
  'goes-longwave': {
    url: 'https://nowcoast.noaa.gov/geoserver/observations/satellite/ows',
    layer: 'goes_longwave_imagery',
  },
  'goes-water-vapor': {
    url: 'https://nowcoast.noaa.gov/geoserver/observations/satellite/ows',
    layer: 'goes_water_vapor_imagery',
  },
  'goes-shortwave': {
    url: 'https://nowcoast.noaa.gov/geoserver/observations/satellite/ows',
    layer: 'goes_shortwave_imagery',
  },
};

export const buildRadarLayerConfig = ({
  radarMode,
  radarProduct,
  radarSite,
}: {
  radarMode: MonitorRadarMode;
  radarProduct: MonitorRadarProduct;
  radarSite: string;
}): WmsLayerConfig | null => {
  if (radarMode === 'none') {
    return null;
  }

  if (radarMode === 'mrms-conus') {
    return radarProduct === 'cref-qcd' ? MRMS_LAYER_BY_PRODUCT['cref-qcd'] : MRMS_LAYER_BY_PRODUCT['bref-qcd'];
  }

  const site = radarSite.trim().toLowerCase();
  const suffix = radarProduct === 'sr-bvel' ? SITE_LAYER_SUFFIX_BY_PRODUCT['sr-bvel'] : SITE_LAYER_SUFFIX_BY_PRODUCT['sr-bref'];
  return {
    url: `https://opengeo.ncep.noaa.gov/geoserver/${site}/ows`,
    layer: `${site}_${suffix}`,
  };
};

export const buildSatelliteLayerConfig = (product: MonitorSatelliteProduct): WmsLayerConfig | null => {
  if (product === 'none') {
    return null;
  }

  return SATELLITE_LAYER_BY_PRODUCT[product];
};

export const buildCapabilitiesUrl = (url: string): string =>
  `${url}?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetCapabilities`;

export const parseTimeDimensionValues = (dimension: Element | undefined): string[] => {
  if (!dimension) {
    return [];
  }

  const listed = (dimension.textContent ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  if (listed.length > 0) {
    return listed;
  }

  const fallback = dimension.getAttribute('default')?.trim();
  return fallback ? [fallback] : [];
};

export const parseWmsLayerTimes = (capabilitiesXml: string): WmsLayerTime[] => {
  const parser = new DOMParser();
  const documentXml = parser.parseFromString(capabilitiesXml, 'text/xml');
  const layers = Array.from(documentXml.getElementsByTagName('Layer'));

  return layers
    .map((layer): WmsLayerTime | null => {
      const name = layer.getElementsByTagName('Name')[0]?.textContent?.trim();
      if (!name) {
        return null;
      }

      const timeDimension = Array.from(layer.getElementsByTagName('Dimension'))
        .find((dimension) => dimension.getAttribute('name') === 'time');
      const timeValues = parseTimeDimensionValues(timeDimension);

      return {
        layerName: name,
        latestTime: timeDimension?.getAttribute('default') ?? timeValues[timeValues.length - 1],
        timeValues,
      };
    })
    .filter((entry): entry is WmsLayerTime => Boolean(entry));
};

export const findLayerTimeValues = (capabilitiesXml: string, layerName: string): string[] =>
  parseWmsLayerTimes(capabilitiesXml).find((entry) => entry.layerName === layerName)?.timeValues ?? [];

export const findLatestLayerTime = (capabilitiesXml: string, layerName: string): string | undefined =>
  parseWmsLayerTimes(capabilitiesXml).find((entry) => entry.layerName === layerName)?.latestTime;

/** Returns the trailing frames used for monitor playback loops. */
export const selectAnimationFrameTimes = (timeValues: string[], maxFrames = MAX_ANIMATION_FRAMES): string[] => {
  if (timeValues.length <= maxFrames) {
    return timeValues;
  }

  return timeValues.slice(-maxFrames);
};

export const fetchWmsCapabilities = async (url: string): Promise<string> => {
  const response = await fetch(buildCapabilitiesUrl(url));
  if (!response.ok) {
    throw new Error('Unable to fetch WMS capabilities.');
  }

  return response.text();
};

export const fetchLayerTimeValues = async (config: WmsLayerConfig): Promise<string[]> =>
  findLayerTimeValues(await fetchWmsCapabilities(config.url), config.layer);

export const fetchLatestLayerTime = async (config: WmsLayerConfig): Promise<string | undefined> => {
  const timeValues = await fetchLayerTimeValues(config);
  return timeValues[timeValues.length - 1];
};
