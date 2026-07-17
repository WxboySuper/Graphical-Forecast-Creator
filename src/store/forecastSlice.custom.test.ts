import type { Polygon } from 'geojson';
import type { OneOffCustomLayer, CustomPolygonFeature } from '../types/customProducts';
import { CUSTOM_PRODUCTS_SCHEMA_VERSION } from '../types/customProducts';
import { asCustomLayerId } from '../lib/customProducts';
import reducer, {
  addCustomFeature,
  addCustomLayer,
  moveCustomCategory,
  removeCustomFeature,
  redoLastEdit,
  undoLastEdit,
  updateCustomCategory,
} from './forecastSlice';

const layer = (): OneOffCustomLayer => ({
  schemaVersion: CUSTOM_PRODUCTS_SCHEMA_VERSION,
  id: asCustomLayerId('layer-1'),
  label: 'Winter impacts',
  order: 0,
  categories: [
    { id: 'cat-1' as never, label: 'Minor', order: 0, style: { fillColor: '#22c55e', fillOpacity: .5, strokeColor: '#111827', strokeOpacity: 1, strokeWidth: 2, hatch: 'none' } },
    { id: 'cat-2' as never, label: 'Major', order: 1, style: { fillColor: '#ef4444', fillOpacity: .7, strokeColor: '#111827', strokeOpacity: 1, strokeWidth: 2, hatch: 'crosshatch' } },
  ],
  features: [],
  createdAt: '2026-07-17T12:00:00.000Z',
  updatedAt: '2026-07-17T12:00:00.000Z',
});

const feature = (): CustomPolygonFeature => ({
  type: 'Feature', id: 'custom-1',
  geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] } as Polygon,
  properties: { customLayerId: asCustomLayerId('layer-1'), categoryId: 'cat-1' as never, title: 'Minor' },
});

describe('custom layer forecast state', () => {
  test('stores custom geometry outside severe outlook maps and supports undo/redo', () => {
    let state = reducer(undefined, addCustomLayer(layer()));
    state = reducer(state, addCustomFeature(feature()));
    expect(state.forecastCycle.days[1]?.customLayers?.layers[0].features).toHaveLength(1);
    expect(state.forecastCycle.days[1]?.data.tornado?.size).toBe(0);

    state = reducer(state, undoLastEdit());
    expect(state.forecastCycle.days[1]?.customLayers?.layers[0].features).toHaveLength(0);
    state = reducer(state, redoLastEdit());
    expect(state.forecastCycle.days[1]?.customLayers?.layers[0].features).toHaveLength(1);

    state = reducer(state, removeCustomFeature({ layerId: 'layer-1', featureId: 'custom-1' }));
    expect(state.forecastCycle.days[1]?.customLayers?.layers[0].features).toHaveLength(0);
  });

  test('reorders categories and propagates edited labels to existing polygon titles', () => {
    let state = reducer(undefined, addCustomLayer(layer()));
    state = reducer(state, addCustomFeature(feature()));
    state = reducer(state, moveCustomCategory({ layerId: 'layer-1', categoryId: 'cat-2', direction: -1 }));
    expect(state.forecastCycle.days[1]?.customLayers?.layers[0].categories.map(({ id, order }) => [id, order])).toEqual([['cat-2', 0], ['cat-1', 1]]);

    const edited = { ...layer().categories[0], label: 'Elevated icing' };
    state = reducer(state, updateCustomCategory({ layerId: 'layer-1', category: edited }));
    expect(state.forecastCycle.days[1]?.customLayers?.layers[0].features[0].properties.title).toBe('Elevated icing');
  });
});
