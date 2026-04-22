import { EventEmitter } from 'events';

jest.setTimeout(20000);

type MapInstanceStub = {
  _layer?: TileLayerStub;
  addLayer: (layer: TileLayerStub) => void;
};

type TileLayerStub = EventEmitter & {
  fire: (event: string, payload?: unknown) => boolean;
  addTo: (map: MapInstanceStub) => TileLayerStub;
};

afterEach(() => {
  jest.resetModules();
  jest.restoreAllMocks();
});

describe('addTilesAndWait', () => {
  test('resolves when tiles load', async () => {
    jest.resetModules();
    jest.doMock('../store', () => ({ store: { getState: () => ({ theme: { darkMode: false } }) } }));

    // Mock leaflet to provide a simple TileLayer implementation usable in node
    jest.doMock('leaflet', () => {
      class TileLayer extends EventEmitter {
        on(evt: string, cb: (...args: unknown[]) => void) { return this.addListener(evt, cb); }
        fire(evt: string, payload?: unknown) { return this.emit(evt, payload); }
        addTo(map: MapInstanceStub) { if (map && typeof map.addLayer === 'function') map.addLayer(this as unknown as TileLayerStub); return this as unknown as TileLayerStub; }
      }
      function tileLayer(_url: string, _opts: unknown) { return new TileLayer(); }
      return { TileLayer, tileLayer };
    });

    const leafletModule = await import('leaflet');
    const { addTilesAndWait } = await import('./exportUtils');

    const srcLayer = leafletModule.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }) as unknown as TileLayerStub;

    const sourceMap = { eachLayer: (cb: (layer: unknown) => void) => cb(srcLayer) };

    const mapInstance: MapInstanceStub = {
      addLayer(layer: TileLayerStub) { mapInstance._layer = layer; }
    };

    // Fire tile events after the layer is added to simulate network load
    setTimeout(() => {
      try {
        if (mapInstance._layer) {
          mapInstance._layer.fire('tileloadstart');
          setTimeout(() => mapInstance._layer?.fire('tileload'), 20);
        }
      } catch {
        void 0;
      }
    }, 20);

    const res = await addTilesAndWait(mapInstance as never, sourceMap as never, 1000);
    expect(res.timedOut).toBe(false);
    expect(res.remaining).toBe(0);
  });

  test('times out when tiles do not load', async () => {
    jest.resetModules();
    jest.doMock('../store', () => ({ store: { getState: () => ({ theme: { darkMode: false } }) } }));

    jest.doMock('leaflet', () => {
      class TileLayer extends EventEmitter {
        on(evt: string, cb: (...args: unknown[]) => void) { return this.addListener(evt, cb); }
        fire(evt: string, payload?: unknown) { return this.emit(evt, payload); }
        addTo(map: MapInstanceStub) { if (map && typeof map.addLayer === 'function') map.addLayer(this as unknown as TileLayerStub); return this as unknown as TileLayerStub; }
      }
      function tileLayer(_url: string, _opts: unknown) { return new TileLayer(); }
      return { TileLayer, tileLayer };
    });

    const leafletModule = await import('leaflet');
    const { addTilesAndWait } = await import('./exportUtils');

    const srcLayer = leafletModule.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }) as unknown as TileLayerStub;
    const sourceMap = { eachLayer: (cb: (layer: unknown) => void) => cb(srcLayer) };

    const mapInstance: MapInstanceStub = {
      addLayer(layer: TileLayerStub) { mapInstance._layer = layer; }
    };

    // Do not fire tileload events; expect timeout
    const res = await addTilesAndWait(mapInstance as never, sourceMap as never, 50);
    expect(res.timedOut).toBe(true);
    expect(res.remaining).toBeGreaterThanOrEqual(0);
  });
});
