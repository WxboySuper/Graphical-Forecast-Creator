import Collection from 'ol/Collection';
import type OLMap from 'ol/Map';
import TileLayer from 'ol/layer/Tile';
import XYZ from 'ol/source/XYZ';
import type { MesoscaleLayerSpec } from '../../mesoscale';
import { createMonitorMesoscaleLayerRegistry, syncMonitorMesoscaleLayers } from './monitorMesoscaleLayerSync';

const parameter = (id: string) => ({
  id,
  displayName: id,
  units: 'unit',
  level: { type: 'surface' as const, label: 'Surface' },
  legend: [],
  displayType: 'raster' as const,
  data: { type: 'xyz-raster' as const, urlTemplate: `https://tiles.test/${id}/{z}/{x}/{y}.png`, format: 'image/png' as const, projection: 'EPSG:3857' as const, minZoom: 0, maxZoom: 8 },
  source: { providerId: 'test', providerName: 'Test', datasetId: 'test', attribution: 'Test' },
  status: 'complete' as const,
});

const spec = (id: string, opacity = 0.7): MesoscaleLayerSpec => ({ id, parameter: parameter(id), opacity });
const fakeMap = (layers: TileLayer[] = []) => {
  const collection = new Collection(layers);
  return { getLayers: () => collection } as unknown as OLMap;
};

describe('monitor mesoscale layer synchronization', () => {
  it('adds selected catalog layers without replacing other Monitor layers', () => {
    const existing = new TileLayer({ source: new XYZ({ url: 'https://base.test/{z}/{x}/{y}.png' }) });
    const map = fakeMap([existing]);
    const registry = createMonitorMesoscaleLayerRegistry();
    syncMonitorMesoscaleLayers(map, [spec('cape'), spec('shear', 0.35)], registry);
    expect(map.getLayers().getArray()).toHaveLength(3);
    expect(map.getLayers().getArray()[0]).toBe(existing);
    expect(registry.layers.get('shear')?.getOpacity()).toBe(0.35);
    expect(registry.layers.get('cape')?.getZIndex()).toBe(25);
    expect(registry.layers.get('shear')?.getZIndex()).toBe(26);
  });

  it('reuses unchanged layers, updates opacity, and removes deselected fields', () => {
    const map = fakeMap();
    const registry = createMonitorMesoscaleLayerRegistry();
    syncMonitorMesoscaleLayers(map, [spec('cape')], registry);
    const first = registry.layers.get('cape');
    syncMonitorMesoscaleLayers(map, [spec('cape', 0.25)], registry);
    expect(registry.layers.get('cape')).toBe(first);
    expect(first?.getOpacity()).toBe(0.25);
    syncMonitorMesoscaleLayers(map, [], registry);
    expect(registry.layers.size).toBe(0);
    expect(map.getLayers().getLength()).toBe(0);
  });
});
