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
      const EventEmitter = require('events');
      class TileLayer extends EventEmitter {
        constructor() { super(); }
        on(evt: string, cb: (...args: any[]) => void) { return this.addListener(evt, cb); }
        fire(evt: string, payload?: any) { return this.emit(evt, payload); }
        addTo(map: any) { if (map && typeof map.addLayer === 'function') map.addLayer(this); return this; }
      }
      function tileLayer(url: string, opts: any) { return new TileLayer(); }
      return { TileLayer, tileLayer };
    });

    const L = await import('leaflet');
    const { addTilesAndWait } = await import('./exportUtils');

    const srcLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 });

    const sourceMap: any = { eachLayer: (cb: (layer: any) => void) => cb(srcLayer) };

    const mapInstance: any = {
      addLayer(layer: any) { this._layer = layer; }
    };

    // Fire tile events after the layer is added to simulate network load
    setTimeout(() => {
      try {
        if (mapInstance._layer) {
          mapInstance._layer.fire('tileloadstart');
          setTimeout(() => mapInstance._layer.fire('tileload'), 20);
        }
      } catch (err) {
        // ignore
      }
    }, 20);

    const res = await addTilesAndWait(mapInstance, sourceMap, 1000);
    expect(res.timedOut).toBe(false);
    expect(res.remaining).toBe(0);
  });

  test('times out when tiles do not load', async () => {
    jest.resetModules();
    jest.doMock('../store', () => ({ store: { getState: () => ({ theme: { darkMode: false } }) } }));

    jest.doMock('leaflet', () => {
      const EventEmitter = require('events');
      class TileLayer extends EventEmitter { constructor() { super(); } on(evt: string, cb: (...args: any[]) => void) { return this.addListener(evt, cb); } fire(evt: string, payload?: any) { return this.emit(evt, payload); } addTo(map: any) { if (map && typeof map.addLayer === 'function') map.addLayer(this); return this; } }
      function tileLayer(url: string, opts: any) { return new TileLayer(); }
      return { TileLayer, tileLayer };
    });

    const L = await import('leaflet');
    const { addTilesAndWait } = await import('./exportUtils');

    const srcLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 });
    const sourceMap: any = { eachLayer: (cb: (layer: any) => void) => cb(srcLayer) };

    const mapInstance: any = {
      addLayer(layer: any) { this._layer = layer; }
    };

    // Do not fire tileload events; expect timeout
    const res = await addTilesAndWait(mapInstance, sourceMap, 50);
    expect(res.timedOut).toBe(true);
    expect(res.remaining).toBeGreaterThanOrEqual(0);
  });
});
