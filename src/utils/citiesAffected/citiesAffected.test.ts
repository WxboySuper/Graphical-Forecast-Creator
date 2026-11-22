/**
 * Cities-affected tests. Verify point-in-polygon matching, ordering, and dataset loading.
 */
import { findPlacesInGeometry, loadPlaces, type Place } from './index';

const places: Place[] = [
  { name: 'Small', state: 'X', lon: 0.2, lat: 0.2, population: 10 },
  { name: 'Big', state: 'X', lon: 0.1, lat: 0.1, population: 1000 },
  { name: 'Outside', state: 'X', lon: 5, lat: 5, population: 5000 },
  { name: 'BboxOnly', state: 'X', lon: 0.9, lat: 0.9, population: 50 },
];

describe('findPlacesInGeometry', () => {
  it('returns contained places largest first and honors non-rectangular shapes', () => {
    const triangle = { type: 'Polygon' as const, coordinates: [[[0, 0], [1, 0], [0, 1], [0, 0]]] };
    expect(findPlacesInGeometry(triangle, places).map((p) => p.name)).toEqual(['Big', 'Small']);
  });

  it('supports MultiPolygon and empty results', () => {
    const multi = { type: 'MultiPolygon' as const, coordinates: [[[[4, 4], [6, 4], [6, 6], [4, 6], [4, 4]]]] };
    expect(findPlacesInGeometry(multi, places).map((p) => p.name)).toEqual(['Outside']);
    const far = { type: 'Polygon' as const, coordinates: [[[20, 20], [21, 20], [21, 21], [20, 20]]] };
    expect(findPlacesInGeometry(far, places)).toEqual([]);
  });
});

describe('loadPlaces', () => {
  it('maps dataset rows', async () => {
    const ok = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ places: [['Town', 'OK', -97, 35, 1234]] }) });
    await expect(loadPlaces(ok as never)).resolves.toEqual([{ name: 'Town', state: 'OK', lon: -97, lat: 35, population: 1234 }]);
  });
});
