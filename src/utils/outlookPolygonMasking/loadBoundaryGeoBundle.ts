import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { FeatureCollection } from 'geojson';
import { getGeoBoundarySource } from '../../config/geoBoundarySources';
import type { BoundaryGeoBundle } from './types';

const ROOT = process.cwd();

const readVendoredGeoJson = (vendoredPath: string): FeatureCollection => {
  const absolutePath = resolve(ROOT, vendoredPath);
  return JSON.parse(readFileSync(absolutePath, 'utf8')) as FeatureCollection;
};

/** Loads the three vendored boundary datasets used by the blank basemap. */
export const loadVendoredBoundaryGeoBundle = (): BoundaryGeoBundle => ({
  states: readVendoredGeoJson(getGeoBoundarySource('usStates').vendoredPath),
  countries: readVendoredGeoJson(getGeoBoundarySource('worldCountries').vendoredPath),
  lakes: readVendoredGeoJson(getGeoBoundarySource('lakes').vendoredPath),
});

/** Browser-friendly loader that mirrors blank-basemap fetch semantics. */
export const fetchBoundaryGeoBundle = async (): Promise<BoundaryGeoBundle> => {
  const [states, countries, lakes] = await Promise.all([
    fetch(getGeoBoundarySource('usStates').url).then((response) => response.json()),
    fetch(getGeoBoundarySource('worldCountries').url).then((response) => response.json()),
    fetch(getGeoBoundarySource('lakes').url).then((response) => response.json()),
  ]);

  return {
    states: states as FeatureCollection,
    countries: countries as FeatureCollection,
    lakes: lakes as FeatureCollection,
  };
};
