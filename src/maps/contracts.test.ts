import type {
  MapEngine,
  MapViewState,
  MapAdapterHandle,
  MapFeatureCreateEvent,
} from '../contracts';

describe('maps/contracts', () => {
  describe('MapEngine', () => {
    it('accepts valid engine values', () => {
      const engine: MapEngine = 'openlayers';
      expect(engine).toBe('openlayers');
      const engine2: MapEngine = 'leaflet';
      expect(engine2).toBe('leaflet');
    });
  });

  describe('MapViewState', () => {
    it('accepts valid map view state', () => {
      const view: MapViewState = {
        center: [40, -95],
        zoom: 5,
      };
      expect(view.center).toEqual([40, -95]);
      expect(view.zoom).toBe(5);
    });
  });

  describe('MapAdapterHandle', () => {
    it('accepts a valid adapter handle', () => {
      const handle: MapAdapterHandle = {
        getMap: () => null,
        getEngine: () => 'openlayers',
        getView: () => ({ center: [0, 0], zoom: 1 }),
      };
      expect(handle.getEngine()).toBe('openlayers');
      expect(handle.getView().zoom).toBe(1);
    });
  });

  describe('MapFeatureCreateEvent', () => {
    it('accepts valid feature create event', () => {
      const event: MapFeatureCreateEvent = {
        featureId: 'fid-1',
        outlookType: 'tornado',
        probability: '30%',
      };
      expect(event.featureId).toBe('fid-1');
      expect(event.outlookType).toBe('tornado');
      expect(event.probability).toBe('30%');
    });
  });
});