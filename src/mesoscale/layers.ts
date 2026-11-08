import TileLayer from 'ol/layer/Tile';
import XYZ from 'ol/source/XYZ';
import type OLMap from 'ol/Map';
import { transformExtent } from 'ol/proj';
import type { MesoscaleCatalogParameter } from './catalogContracts';

export interface MesoscaleLayerSpec {
  id: string;
  parameter: MesoscaleCatalogParameter;
  opacity: number;
  visible?: boolean;
}

export type MesoscaleTileLayer = TileLayer<XYZ>;
export interface MesoscaleLayerRegistry {
  layers: globalThis.Map<string, MesoscaleTileLayer>;
  orderedIds: string[];
}

const toExtent = (bounds?: [number, number, number, number]) => bounds
  ? transformExtent([bounds[0], bounds[1], bounds[2], bounds[3]], 'EPSG:4326', 'EPSG:3857')
  : undefined;

const sourceFor = (parameter: MesoscaleCatalogParameter) => new XYZ({
  url: parameter.data.urlTemplate,
  projection: parameter.data.projection,
  minZoom: parameter.data.minZoom,
  maxZoom: parameter.data.maxZoom,
  crossOrigin: 'anonymous',
  attributions: parameter.source?.attribution ?? '',
});

export const createMesoscaleTileLayer = (spec: MesoscaleLayerSpec): MesoscaleTileLayer => {
  const { data } = spec.parameter;
  return new TileLayer({
    source: sourceFor(spec.parameter),
    opacity: spec.opacity,
    visible: spec.visible ?? true,
    extent: toExtent(data.bounds),
    minZoom: data.minZoom,
    maxZoom: data.maxZoom,
    properties: { mesoscaleLayerId: spec.id, parameter: spec.parameter.id, units: spec.parameter.units, legend: spec.parameter.legend, source: spec.parameter.source },
  });
};

const layerSignature = (spec: MesoscaleLayerSpec) => JSON.stringify({
  url: spec.parameter.data.urlTemplate,
  projection: spec.parameter.data.projection,
  minZoom: spec.parameter.data.minZoom,
  maxZoom: spec.parameter.data.maxZoom,
  bounds: spec.parameter.data.bounds,
  displayName: spec.parameter.displayName,
  units: spec.parameter.units,
  legend: spec.parameter.legend,
  source: spec.parameter.source,
  attribution: spec.parameter.source?.attribution ?? '',
});

export interface SyncMesoscaleLayersOptions {
  map: OLMap;
  specs: MesoscaleLayerSpec[];
  registry: MesoscaleLayerRegistry;
}

/** Reuses managed layer instances while applying the requested order and appearance. */
export const syncMesoscaleLayers = ({ map, specs, registry }: SyncMesoscaleLayersOptions): void => {
  const collection = map.getLayers();
  const nextIds = specs.map(spec => spec.id);
  registry.layers.forEach((layer, id) => {
    if (!nextIds.includes(id)) {
      collection.remove(layer);
      layer.dispose();
      registry.layers.delete(id);
    }
  });
  specs.forEach((spec, index) => {
    const existing = registry.layers.get(spec.id);
    const previousSignature = existing?.get('mesoscaleSignature');
    const layer = existing && previousSignature === layerSignature(spec) ? existing : createMesoscaleTileLayer(spec);
    layer.set('mesoscaleSignature', layerSignature(spec));
    layer.setOpacity(spec.opacity);
    layer.setVisible(spec.visible ?? true);
    layer.setZIndex(index);
    if (existing && layer !== existing) {
      collection.remove(existing);
      existing.dispose();
    }
    if (!collection.getArray().includes(layer)) collection.push(layer);
    registry.layers.set(spec.id, layer);
  });
  registry.orderedIds = nextIds;
};

export const createMesoscaleLayerRegistry = (): MesoscaleLayerRegistry => ({ layers: new globalThis.Map(), orderedIds: [] });
