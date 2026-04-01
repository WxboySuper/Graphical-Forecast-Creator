import type { BaseMapStyle } from '../store/overlaysSlice';

interface OpenFreeMapLayer {
  id: string;
  type?: string;
  [key: string]: unknown;
}

interface OpenFreeMapStyle {
  version: number;
  sources: Record<string, unknown>;
  layers: OpenFreeMapLayer[];
  sprite?: string;
  glyphs?: string;
  metadata?: Record<string, unknown>;
  [key: string]: unknown;
}

interface OpenFreeMapStyleSet {
  baseStyle: OpenFreeMapStyle;
  overlayStyle: OpenFreeMapStyle;
}

const OPEN_FREE_MAP_STYLE_URLS: Partial<Record<BaseMapStyle, string>> = {
  osm: 'https://tiles.openfreemap.org/styles/liberty',
  'carto-light': 'https://tiles.openfreemap.org/styles/positron',
};

const OVERLAY_LINE_PREFIXES = [
  'road_',
  'bridge_',
  'tunnel_',
  'boundary_',
  'aeroway_',
];

const OVERLAY_LINE_IDS = new Set([
  'road_area_pattern',
]);

const styleSetCache = new Map<BaseMapStyle, Promise<OpenFreeMapStyleSet>>();

/** True when the selected basemap style should render through OpenFreeMap vector tiles. */
export const isOpenFreeMapStyle = (style: BaseMapStyle): boolean => style in OPEN_FREE_MAP_STYLE_URLS;

/** Returns the hosted OpenFreeMap style URL for the requested basemap style. */
const getOpenFreeMapStyleUrl = (style: BaseMapStyle): string => {
  const styleUrl = OPEN_FREE_MAP_STYLE_URLS[style];
  if (!styleUrl) {
    throw new Error(`No OpenFreeMap style is configured for "${style}".`);
  }

  return styleUrl;
};

/** Deep-clones a style payload so the filtered variants can be mutated independently. */
const cloneStyle = (style: OpenFreeMapStyle): OpenFreeMapStyle =>
  JSON.parse(JSON.stringify(style)) as OpenFreeMapStyle;

/** True when a style layer should render above the forecast polygons as a reference overlay. */
const isOverlayLayer = (layer: OpenFreeMapLayer): boolean => {
  if (layer.type === 'symbol') {
    return true;
  }

  return OVERLAY_LINE_PREFIXES.some((prefix) => layer.id.startsWith(prefix)) || OVERLAY_LINE_IDS.has(layer.id);
};

/** Keeps only the requested layers while preserving the original style metadata and sources. */
const createFilteredStyle = (style: OpenFreeMapStyle, predicate: (layer: OpenFreeMapLayer) => boolean): OpenFreeMapStyle => {
  const clonedStyle = cloneStyle(style);
  clonedStyle.layers = clonedStyle.layers.filter(predicate);
  return clonedStyle;
};

/** Loads and splits one OpenFreeMap style into a base stack and a top reference overlay stack. */
const loadOpenFreeMapStyleSet = async (style: BaseMapStyle): Promise<OpenFreeMapStyleSet> => {
  const response = await fetch(getOpenFreeMapStyleUrl(style));
  if (!response.ok) {
    throw new Error(`Unable to load OpenFreeMap style for "${style}".`);
  }

  const fullStyle = await response.json() as OpenFreeMapStyle;
  return {
    baseStyle: createFilteredStyle(fullStyle, (layer) => !isOverlayLayer(layer)),
    overlayStyle: createFilteredStyle(fullStyle, isOverlayLayer),
  };
};

/** Returns the cached OpenFreeMap base/overlay styles for the requested basemap style. */
export const getOpenFreeMapStyleSet = (style: BaseMapStyle): Promise<OpenFreeMapStyleSet> => {
  if (!isOpenFreeMapStyle(style)) {
    return Promise.reject(new Error(`"${style}" does not use OpenFreeMap vector tiles.`));
  }

  const cached = styleSetCache.get(style);
  if (cached) {
    return cached;
  }

  const next = loadOpenFreeMapStyleSet(style).catch((error) => {
    styleSetCache.delete(style);
    throw error;
  });
  styleSetCache.set(style, next);
  return next;
};
