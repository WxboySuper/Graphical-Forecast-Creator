/**
 * Cities-affected helpers. Loads the vendored US places dataset and finds the
 * places whose reference point falls inside an outlook geometry.
 */
import { bbox, booleanPointInPolygon, point } from '@turf/turf';
import type { MultiPolygon, Polygon } from 'geojson';
import { getGeoBoundarySource } from '../../config/geoBoundarySources';

export interface Place {
  name: string;
  state: string;
  lon: number;
  lat: number;
  /** Approximate urban-area population from Natural Earth (not a city-limits count). */
  population: number;
}

type PlaceRow = [string, string, number, number, number];
interface PlacesFile { places: PlaceRow[] }

let placesPromise: Promise<Place[]> | null = null;

/** Loads (once) the vendored US places dataset. */
export const loadPlaces = (fetchImpl: typeof fetch = fetch): Promise<Place[]> => {
  if (!placesPromise) {
    placesPromise = fetchImpl(getGeoBoundarySource('usPlaces').url)
      .then((response) => {
        if (!response.ok) throw new Error(`Places dataset failed with HTTP ${response.status}.`);
        return response.json() as Promise<PlacesFile>;
      })
      .then((file) => file.places.map(([name, state, lon, lat, population]) => ({ name, state, lon, lat, population })))
      .catch((error) => {
        placesPromise = null;
        throw error;
      });
  }
  return placesPromise;
};

/** Returns places inside the geometry, largest first. */
export const findPlacesInGeometry = (
  geometry: Polygon | MultiPolygon,
  places: Place[],
): Place[] => {
  const [minX, minY, maxX, maxY] = bbox(geometry);
  return places
    .filter((place) => place.lon >= minX && place.lon <= maxX && place.lat >= minY && place.lat <= maxY)
    .filter((place) => booleanPointInPolygon(point([place.lon, place.lat]), geometry))
    .sort((a, b) => b.population - a.population);
};
