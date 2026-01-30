import { validateForecastData } from './validationUtils';

describe('validateForecastData', () => {
  const validFeature = {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [0, 0] },
    properties: { some: 'prop' }
  };

  const validData = {
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

  it('should return true for valid data', () => {
    expect(validateForecastData(validData)).toBe(true);
  });

  it('should return true for valid data without mapView', () => {
    const data = { ...validData };
    delete (data as any).mapView;
    expect(validateForecastData(data)).toBe(true);
  });

  it('should return false for non-object data', () => {
    expect(validateForecastData(null)).toBe(false);
    expect(validateForecastData('string')).toBe(false);
    expect(validateForecastData(123)).toBe(false);
  });

  it('should return false if outlooks is missing', () => {
    const data = { ...validData };
    delete (data as any).outlooks;
    expect(validateForecastData(data)).toBe(false);
  });

  it('should return false if outlooks is not an object', () => {
    const data = { ...validData, outlooks: 'invalid' };
    expect(validateForecastData(data)).toBe(false);
  });

  it('should return false if a required outlook type is missing', () => {
    const data = JSON.parse(JSON.stringify(validData));
    delete data.outlooks.tornado;
    expect(validateForecastData(data)).toBe(false);
  });

  it('should return false if outlook entries are not an array', () => {
    const data = JSON.parse(JSON.stringify(validData));
    data.outlooks.tornado = 'invalid';
    expect(validateForecastData(data)).toBe(false);
  });

  it('should return false if an outlook entry is not a valid tuple', () => {
    const data = JSON.parse(JSON.stringify(validData));
    data.outlooks.tornado = [['2%', [validFeature], 'extra']]; // Length 3
    expect(validateForecastData(data)).toBe(false);

    data.outlooks.tornado = [['2%']]; // Length 1
    expect(validateForecastData(data)).toBe(false);

    data.outlooks.tornado = [[123, [validFeature]]]; // First element not string
    expect(validateForecastData(data)).toBe(false);

    data.outlooks.tornado = [['2%', 'invalid']]; // Second element not array
    expect(validateForecastData(data)).toBe(false);
  });

  it('should return false if feature is invalid', () => {
    const data = JSON.parse(JSON.stringify(validData));
    const invalidFeature = { ...validFeature, type: 'Invalid' };
    data.outlooks.tornado = [['2%', [invalidFeature]]];
    expect(validateForecastData(data)).toBe(false);

    const missingGeometry = { ...validFeature };
    delete (missingGeometry as any).geometry;
    data.outlooks.tornado = [['2%', [missingGeometry]]];
    expect(validateForecastData(data)).toBe(false);
  });

  it('should return false if mapView is invalid', () => {
    const data = JSON.parse(JSON.stringify(validData));
    data.mapView = 'invalid';
    expect(validateForecastData(data)).toBe(false);

    data.mapView = { center: [39], zoom: 4 }; // Invalid center length
    expect(validateForecastData(data)).toBe(false);

    data.mapView = { center: [39, -98], zoom: '4' }; // Invalid zoom type
    expect(validateForecastData(data)).toBe(false);
  });
});
