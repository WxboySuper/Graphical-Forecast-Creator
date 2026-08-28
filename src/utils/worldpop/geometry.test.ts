import { polygon } from '@turf/turf';
import { unionForecastPolygons } from './geometry';

describe('unionForecastPolygons', () => {
  test('returns null when no polygon features are present', () => {
    expect(unionForecastPolygons([{ type: 'Feature', properties: {}, geometry: null }])).toBeNull();
  });

  test('unions overlapping polygons into one geometry', () => {
    const result = unionForecastPolygons([
      polygon([[[-100, 35], [-99, 35], [-99, 36], [-100, 36], [-100, 35]]]),
      polygon([[[-99.5, 35], [-98.5, 35], [-98.5, 36], [-99.5, 36], [-99.5, 35]]]),
    ]);

    expect(result?.type).toBe('Polygon');
    expect(result && result.coordinates[0].length).toBeGreaterThan(4);
  });
});
