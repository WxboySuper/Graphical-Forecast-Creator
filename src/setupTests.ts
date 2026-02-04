// jest-dom adds custom jest matchers for asserting on DOM nodes.
// allows you to do things like:
// expect(element).toHaveTextContent(/react/i)
// learn more: https://github.com/testing-library/jest-dom
import '@testing-library/jest-dom';

// Mock Leaflet
jest.mock('leaflet', () => {
  const L = {
    divIcon: jest.fn(() => ({})),
    icon: jest.fn(() => ({})),
    point: jest.fn(() => ({})),
    latLng: jest.fn((lat, lng) => ({ lat, lng })),
    extend: jest.fn(),
    Map: jest.fn(() => ({
      addLayer: jest.fn(),
      removeLayer: jest.fn(),
      setView: jest.fn(),
      on: jest.fn(),
      off: jest.fn(),
      fitBounds: jest.fn(),
    })),
    Layer: jest.fn(),
    TileLayer: jest.fn(),
    GeoJSON: jest.fn(() => ({
      addTo: jest.fn(),
      clearLayers: jest.fn(),
      addData: jest.fn(),
    })),
    featureGroup: jest.fn(() => ({
      addTo: jest.fn(),
      getLayers: jest.fn(() => []),
      getBounds: jest.fn(),
      clearLayers: jest.fn(),
    })),
    marker: jest.fn(() => ({
      addTo: jest.fn(),
    })),
    Marker: {
      prototype: {
        options: {
          icon: {}
        }
      }
    },
  };
  return L;
});
