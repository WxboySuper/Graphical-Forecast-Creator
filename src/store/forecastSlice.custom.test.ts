import type { Polygon } from 'geojson';
import type { OneOffCustomLayer, CustomPolygonFeature } from '../types/customProducts';
import { CUSTOM_PRODUCTS_SCHEMA_VERSION } from '../types/customProducts';
import { asCustomLayerId } from '../lib/customProducts';
import reducer, {
  addCustomFeature,
  addCustomLayer,
  copyFeaturesFromPrevious,
  createOutlookUpdate,
  moveCustomCategory,
  removeCustomFeature,
  redoLastEdit,
  undoLastEdit,
  updateCustomCategory,
  startBlankCycle,
} from './forecastSlice';
import { processOutlooksToCategorical } from '../hooks/useAutoCategorical';

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
  afterEach(() => jest.restoreAllMocks());

  test('stores custom geometry outside severe outlook maps', () => {
    let state = reducer(undefined, addCustomLayer(layer()));
    state = reducer(state, addCustomFeature(feature()));
    expect(state.forecastCycle.days[1]?.customLayers?.layers[0].features).toHaveLength(1);
    expect(state.forecastCycle.days[1]?.data.tornado?.size).toBe(0);
  });

  test('includes custom geometry in day-scoped undo and redo history', () => {
    let state = reducer(undefined, addCustomLayer(layer()));
    state = reducer(state, addCustomFeature(feature()));
    state = reducer(state, undoLastEdit());
    expect(state.forecastCycle.days[1]?.customLayers?.layers[0].features).toHaveLength(0);
    state = reducer(state, redoLastEdit());
    expect(state.forecastCycle.days[1]?.customLayers?.layers[0].features).toHaveLength(1);
  });

  test('removes a custom feature without changing severe outlook maps', () => {
    let state = reducer(undefined, addCustomLayer(layer()));
    state = reducer(state, addCustomFeature(feature()));
    state = reducer(state, removeCustomFeature({ layerId: 'layer-1', featureId: 'custom-1' }));
    expect(state.forecastCycle.days[1]?.customLayers?.layers[0].features).toHaveLength(0);
    expect(state.forecastCycle.days[1]?.data.tornado?.size).toBe(0);
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

  test('copies a grouping as a detached replacement while leaving severe conversion independent', () => {
    let source = reducer(undefined, addCustomLayer(layer()));
    source = reducer(source, addCustomFeature(feature()));
    const copied = reducer(undefined, copyFeaturesFromPrevious({
      sourceCycle: source.forecastCycle,
      sourceDay: 1,
      targetDay: 2,
    }));

    expect(copied.forecastCycle.days[2]?.customLayers).toEqual(source.forecastCycle.days[1]?.customLayers);
    expect(copied.forecastCycle.days[2]?.customLayers).not.toBe(source.forecastCycle.days[1]?.customLayers);
    expect(copied.forecastCycle.days[2]?.customLayers?.layers[0].features[0].geometry).not
      .toBe(source.forecastCycle.days[1]?.customLayers?.layers[0].features[0].geometry);
    expect(processOutlooksToCategorical(copied.forecastCycle.days[2]!.data, 2)).toEqual([]);
    expect(copied.forecastCycle.days[2]?.data.categorical?.size).toBe(0);
  });

  test('deep-snapshots custom geometry and appearance before a same-cycle update', () => {
    let state = reducer(undefined, startBlankCycle({
      workflowTemplate: { id: 'severe-day1', label: 'Day 1', groupings: ['day1'] },
      cycleDate: '2026-07-17',
    }));
    state = reducer(state, addCustomLayer(layer()));
    state = reducer(state, addCustomFeature(feature()));
    state = reducer(state, createOutlookUpdate());

    const revised = {
      ...state.forecastCycle.days[1]!.customLayers!.layers[0].categories[0],
      label: 'Revised minor',
      style: { ...state.forecastCycle.days[1]!.customLayers!.layers[0].categories[0].style, strokeWidth: 7 },
    };
    state = reducer(state, updateCustomCategory({ layerId: 'layer-1', category: revised }));

    expect(state.outlookVersionSnapshots[0].days[1]?.customLayers?.layers[0].categories[0]).toEqual(
      expect.objectContaining({ label: 'Minor', style: expect.objectContaining({ strokeWidth: 2 }) }),
    );
    expect(state.outlookVersionSnapshots[0].days[1]?.customLayers?.layers[0].features[0].properties.title).toBe('Minor');
    expect(state.forecastCycle.days[1]?.customLayers?.layers[0].features[0].properties.title).toBe('Revised minor');
  });

  test('keeps copy integration inert when the custom feature is not exposed', () => {
    jest.spyOn(require('../config/featureExposure'), 'isFeatureExposed').mockReturnValue(false);
    const source = reducer(undefined, addCustomLayer(layer()));
    const copied = reducer(undefined, copyFeaturesFromPrevious({
      sourceCycle: source.forecastCycle,
      sourceDay: 1,
      targetDay: 2,
    }));

    expect(copied.forecastCycle.days[2]?.customLayers).toBeUndefined();
  });
});
