// jest-dom adds custom jest matchers for asserting on DOM nodes.
// allows you to do things like:
// expect(element).toHaveTextContent(/react/i)
// learn more: https://github.com/testing-library/jest-dom
import '@testing-library/jest-dom';
import { TextDecoder, TextEncoder } from 'util';

if (!global.TextEncoder) {
  global.TextEncoder = TextEncoder as typeof global.TextEncoder;
}

if (!global.TextDecoder) {
  global.TextDecoder = TextDecoder as typeof global.TextDecoder;
}

if (typeof global.__GFC_COMING_SOON__ === 'undefined') {
  global.__GFC_COMING_SOON__ = false;
}

if (!global.fetch) {
  /** Builds a minimal Response-like object for tests that depend on common fetch response fields. */
  const createMockResponse = () => {
    const headers = new Headers();

    return {
      ok: false,
      status: 500,
      statusText: 'Mock fetch not implemented',
      headers,
      redirected: false,
      type: 'basic' as ResponseType,
      url: '',
      json: () => Promise.resolve({}),
      text: () => Promise.resolve(''),
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
      blob: () => Promise.resolve(new Blob()),
      clone() {
        return createMockResponse();
      },
    };
  };

  global.fetch = jest.fn().mockResolvedValue({
    ...createMockResponse(),
  }) as unknown as typeof global.fetch;
}

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
