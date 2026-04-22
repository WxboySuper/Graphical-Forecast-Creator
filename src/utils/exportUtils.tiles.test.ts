import { EventEmitter } from 'events';

jest.setTimeout(20000);

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
        constructor() { super(); }
        on(evt: string, cb: (...args: unknown[]) => void) { return this.addListener(evt, cb); }
        fire(evt: string, payload?: unknown) { return this.emit(evt, payload); }
        addTo(map: unknown) { if (map && typeof (map as any).addLayer === 'function') (map as any).addLayer(this); return this; }
      }
      function tileLayer(url: string, opts: unknown) { return new TileLayer(); }
      return { TileLayer, tileLayer };
    });

    const L = await import('leaflet');
    const { addTilesAndWait } = await import('./exportUtils');

    const srcLayer = (L as any).tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 });

    const sourceMap = { eachLayer: (cb: (layer: unknown) => void) => cb(srcLayer) };

    const mapInstance = {
      addLayer(layer: unknown) { (this as any)._layer = layer; }
    };

    // Fire tile events after the layer is added to simulate network load
    setTimeout(() => {
      try {
        if ((mapInstance as any)._layer) {
          (mapInstance as any)._layer.fire('tileloadstart');
          setTimeout(() => (mapInstance as any)._layer.fire('tileload'), 20);
        }
      } catch (err) {
        // ignore
      }
    }, 20);

    const res = await addTilesAndWait(mapInstance as any, sourceMap as any, 1000);
    expect(res.timedOut).toBe(false);
    expect(res.remaining).toBe(0);
  });

  test('times out when tiles do not load', async () => {
    jest.resetModules();
    jest.doMock('../store', () => ({ store: { getState: () => ({ theme: { darkMode: false } }) } }));

    jest.doMock('leaflet', () => {
      class TileLayer extends EventEmitter { constructor() { super(); } on(evt: string, cb: (...args: unknown[]) => void) { return this.addListener(evt, cb); } fire(evt: string, payload?: unknown) { return this.emit(evt, payload); } addTo(map: unknown) { if (map && typeof (map as any).addLayer === 'function') (map as any).addLayer(this); return this; } }
      function tileLayer(url: string, opts: unknown) { return new TileLayer(); }
      return { TileLayer, tileLayer };
    });

    const L = await import('leaflet');
    const { addTilesAndWait } = await import('./exportUtils');

    const srcLayer = (L as any).tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 });
    const sourceMap = { eachLayer: (cb: (layer: unknown) => void) => cb(srcLayer) };

    const mapInstance = {
      addLayer(layer: unknown) { (this as any)._layer = layer; }
    };

    // Do not fire tileload events; expect timeout
    const res = await addTilesAndWait(mapInstance as any, sourceMap as any, 50);
    expect(res.timedOut).toBe(true);
    expect(res.remaining).toBeGreaterThanOrEqual(0);
  });
});
