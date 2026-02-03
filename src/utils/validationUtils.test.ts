import { validateForecastData } from './validationUtils';

describe('validateForecastData', () => {
  const validFeature = {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [0, 0] },
    properties: { some: 'prop' }
  };

  const validLegacyData = {
    outlooks: {
      tornado: [['2%', [validFeature]]],
      wind: [],
      hail: [],
      categorical: []
    },
    mapView: {
      center: [39, -98],
      zoom: 4
    }
  };

  const validCycleData = {
    forecastCycle: {
      days: {
        1: {
          day: 1,
          data: {
            tornado: [['5%', [validFeature]]],
            wind: [],
            hail: [],
            categorical: []
          }
        }
      },
      currentDay: 1,
      cycleDate: '2026-02-03'
    },
    mapView: {
      center: [39, -98],
      zoom: 4
    }
  };

  it('should return true for valid legacy data', () => {
    expect(validateForecastData(validLegacyData)).toBe(true);
  });

  it('should return true for valid cycle data', () => {
    expect(validateForecastData(validCycleData)).toBe(true);
  });

  it('should return false for non-object data', () => {
    expect(validateForecastData(null)).toBe(false);
    expect(validateForecastData('string')).toBe(false);
    expect(validateForecastData(123)).toBe(false);
  });

  it('should return false if both forecastCycle and outlooks are missing', () => {
    const data = { mapView: { center: [0,0], zoom: 4 } };
    expect(validateForecastData(data)).toBe(false);
  });

  it('should return false if probability is an empty string', () => {
    const data = JSON.parse(JSON.stringify(validLegacyData));
    data.outlooks.tornado = [[' ', [validFeature]]];
    expect(validateForecastData(data)).toBe(false);
  });

  it('should return false if geometry is invalid', () => {
    const data = JSON.parse(JSON.stringify(validLegacyData));
    const invalidFeature = { ...validFeature, geometry: { type: 'InvalidType' } };
    data.outlooks.tornado = [['2%', [invalidFeature]]];
    expect(validateForecastData(data)).toBe(false);
  });

  it('should return false if geometry is not an object', () => {
    const data = JSON.parse(JSON.stringify(validLegacyData));
    const invalidFeature = { ...validFeature, geometry: 'invalid' };
    data.outlooks.tornado = [['2%', [invalidFeature]]];
    expect(validateForecastData(data)).toBe(false);
  });

  it('should return false if cycle days is invalid', () => {
    const data = JSON.parse(JSON.stringify(validCycleData));
    data.forecastCycle.days[1].data.tornado = [['5%', 'not-an-array']];
    expect(validateForecastData(data)).toBe(false);
  });

  it('should return false if mapView is invalid', () => {
    const data = JSON.parse(JSON.stringify(validLegacyData));
    data.mapView = { center: [39], zoom: 4 }; // Invalid center length
    expect(validateForecastData(data)).toBe(false);
  });
});
