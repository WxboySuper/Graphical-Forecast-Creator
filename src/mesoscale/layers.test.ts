import OLMap from 'ol/Map';
import { createMesoscaleLayerRegistry, createMesoscaleTileLayer, syncMesoscaleLayers, type MesoscaleLayerSpec } from './layers';
import { getFixtureCatalog } from './fixtures/catalogs';

const spec = (id: string, opacity = 0.5): MesoscaleLayerSpec => {
  const parameter = getFixtureCatalog('hrrr')!.frames[0].parameters[0];
  return { id, parameter, opacity };
};

describe('mesoscale OpenLayers layers', () => {
  it('builds a raster layer with catalog zooms, bounds, attribution, and opacity', () => {
    const layer = createMesoscaleTileLayer(spec('temperature'));
    expect(layer.getOpacity()).toBe(0.5);
    // Tile availability is a source property; the layer itself must never be hidden by zoom.
    expect(layer.getMinZoom()).toBe(-Infinity);
    expect(layer.getMaxZoom()).toBe(Infinity);
    expect(layer.getSource()?.getTileGrid()?.getMinZoom()).toBe(3);
    expect(layer.getSource()?.getTileGrid()?.getMaxZoom()).toBe(6);
    expect(layer.getExtent()).toBeDefined();
    expect(layer.getSource()?.getAttributions()?.({} as never)).toContain('Data provided by Example Provider');
  });

  it('keeps a model-specific max zoom on the XYZ source only', () => {
    const initial = spec('temperature');
    const parameter = { ...initial.parameter, data: { ...initial.parameter.data, maxZoom: 5 } };
    const layer = createMesoscaleTileLayer({ ...initial, parameter });
    expect(layer.getMinZoom()).toBe(-Infinity);
    expect(layer.getMaxZoom()).toBe(Infinity);
    expect(layer.getSource()?.getTileGrid()?.getMaxZoom()).toBe(5);
  });

  it('handles a missing source attribution without crashing layer creation', () => {
    const parameter = { ...spec('broken').parameter, source: null } as unknown as MesoscaleLayerSpec['parameter'];
    expect(() => createMesoscaleTileLayer({ id: 'broken', parameter, opacity: 1 })).not.toThrow();
  });

  it('adds, removes, reorders, and updates opacity while retaining unchanged instances', () => {
    Object.defineProperty(globalThis, 'ResizeObserver', { configurable: true, value: class { observe() {} unobserve() {} disconnect() {} } });
    const map = new OLMap({ controls: [], interactions: [], layers: [] });
    const registry = createMesoscaleLayerRegistry();
    syncMesoscaleLayers({ map, specs: [spec('a'), spec('b')], registry });
    const retained = registry.layers.get('a');
    const removed = registry.layers.get('a');
    const dispose = jest.spyOn(removed!, 'dispose');
    const sourceDispose = jest.spyOn(removed!.getSource()!, 'dispose');
    syncMesoscaleLayers({ map, specs: [spec('b', 0.8), spec('a', 0.3)], registry });
    expect(registry.layers.get('a')).toBe(retained);
    expect(registry.layers.get('a')?.getOpacity()).toBe(0.3);
    expect(registry.layers.get('b')?.getOpacity()).toBe(0.8);
    expect(registry.orderedIds).toEqual(['b', 'a']);
    expect(registry.layers.get('b')?.getZIndex()).toBeLessThan(registry.layers.get('a')?.getZIndex() ?? 0);
    syncMesoscaleLayers({ map, specs: [spec('b')], registry });
    expect(registry.layers.has('a')).toBe(false);
    expect(dispose).toHaveBeenCalledTimes(1);
    expect(sourceDispose).toHaveBeenCalledTimes(1);
    expect(map.getLayers().getLength()).toBe(1);
    map.dispose();
  });

  it('disposes replaced sources when a catalog tile template changes', () => {
    Object.defineProperty(globalThis, 'ResizeObserver', { configurable: true, value: class { observe() {} unobserve() {} disconnect() {} } });
    const map = new OLMap({ controls: [], interactions: [], layers: [] });
    const registry = createMesoscaleLayerRegistry();
    const initial = spec('a');
    syncMesoscaleLayers({ map, specs: [initial], registry });
    const previous = registry.layers.get('a')!;
    const dispose = jest.spyOn(previous, 'dispose');
    const sourceDispose = jest.spyOn(previous.getSource()!, 'dispose');
    const replacement = {
      ...initial,
      parameter: { ...initial.parameter, data: { ...initial.parameter.data, urlTemplate: '/different/{z}/{x}/{y}.png' } },
    };
    syncMesoscaleLayers({ map, specs: [replacement], registry });
    expect(dispose).toHaveBeenCalledTimes(1);
    expect(sourceDispose).toHaveBeenCalledTimes(1);
    expect(registry.layers.get('a')).not.toBe(previous);
    map.dispose();
  });

  it('updates legend metadata without recreating unchanged tile sources', () => {
    Object.defineProperty(globalThis, 'ResizeObserver', { configurable: true, value: class { observe() {} unobserve() {} disconnect() {} } });
    const map = new OLMap({ controls: [], interactions: [], layers: [] });
    const registry = createMesoscaleLayerRegistry();
    const initial = spec('a');
    syncMesoscaleLayers({ map, specs: [initial], registry });
    const existing = registry.layers.get('a');
    const updated = { ...initial, parameter: { ...initial.parameter, units: 'updated units' } };
    syncMesoscaleLayers({ map, specs: [updated], registry });
    expect(registry.layers.get('a')).toBe(existing);
    expect(registry.layers.get('a')?.get('units')).toBe('updated units');
    map.dispose();
  });
});
