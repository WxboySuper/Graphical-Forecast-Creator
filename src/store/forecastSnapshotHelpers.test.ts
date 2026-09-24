import { produce } from 'immer';
import type { Feature, Polygon } from 'geojson';
import { CUSTOM_PRODUCTS_SCHEMA_VERSION } from '../types/customProducts';
import type { CustomLayerCollection } from '../types/customProducts';
import type { OutlookData } from '../types/outlooks';
import { asCustomLayerId } from '../lib/customProducts';
import {
  cloneCustomLayers,
  cloneEntries,
  cloneIntegratedCustomLayers,
  cloneOutlookData,
} from './forecastSnapshotHelpers';

const createPolygon = (offset: number): Polygon => ({
  type: 'Polygon',
  coordinates: [[
    [offset, offset],
    [offset + 1, offset],
    [offset + 1, offset + 1],
    [offset, offset + 1],
    [offset, offset],
  ]],
});

const createFeature = (id: string, offset: number): Feature => ({
  type: 'Feature',
  id,
  geometry: createPolygon(offset),
  properties: { outlookType: 'tornado', probability: '2%' },
});

const createCustomLayers = (): CustomLayerCollection => ({
  schemaVersion: CUSTOM_PRODUCTS_SCHEMA_VERSION,
  layers: [
    {
      schemaVersion: CUSTOM_PRODUCTS_SCHEMA_VERSION,
      id: asCustomLayerId('layer-1'),
      label: 'Layer 1',
      order: 0,
      categories: [],
      features: [],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
  ],
});

describe('cloneEntries', () => {
  test('returns undefined when the map is missing', () => {
    expect(cloneEntries(undefined)).toBeUndefined();
  });

  test('clones maps without sharing arrays or features', () => {
    const feature = createFeature('tornado-1', 0);
    const cloned = cloneEntries(new Map([['2%', [feature]]]));

    expect(cloned).not.toBeUndefined();
    expect(cloned?.get('2%')).not.toBeUndefined();
    expect(cloned?.get('2%')?.[0]).not.toBe(feature);
    expect(cloned?.get('2%')?.[0]).toEqual(feature);

    feature.properties = { ...feature.properties, probability: '5%' };
    expect(cloned?.get('2%')?.[0].properties).toMatchObject({ probability: '2%' });
  });

  test('reuses the cached clone for a repeated source identity', () => {
    const feature = createFeature('tornado-cache', 1);
    const first = cloneEntries(new Map([['2%', [feature]]]));
    const second = cloneEntries(new Map([['2%', [feature]]]));

    expect(second?.get('2%')?.[0]).toBe(first?.get('2%')?.[0]);
  });

  test('keeps distinct source objects isolated from each other', () => {
    const first = createFeature('same-id', 2);
    const second = createFeature('same-id', 2);
    const clonedFirst = cloneEntries(new Map([['2%', [first]]]));
    const clonedSecond = cloneEntries(new Map([['2%', [second]]]));

    expect(clonedFirst?.get('2%')?.[0]).toEqual(clonedSecond?.get('2%')?.[0]);
    expect(clonedFirst?.get('2%')?.[0]).not.toBe(clonedSecond?.get('2%')?.[0]);
  });

  test('keys Immer drafts by the stable base object', () => {
    const baseFeature = createFeature('draft-cache', 3);
    const holder = { feature: baseFeature };
    const clones: Feature[] = [];

    produce(holder, (draft) => {
      clones.push(cloneEntries(new Map([['2%', [draft.feature]]]))?.get('2%')?.[0] as Feature);
    });
    produce(holder, (draft) => {
      clones.push(cloneEntries(new Map([['2%', [draft.feature]]]))?.get('2%')?.[0] as Feature);
    });

    expect(clones).toHaveLength(2);
    expect(clones[0]).toEqual(baseFeature);
    expect(clones[0]).not.toBe(baseFeature);
    expect(clones[1]).toBe(clones[0]);
  });
});

describe('cloneOutlookData', () => {
  const createOutlookData = (): OutlookData => ({
    tornado: new Map([['2%', [createFeature('tornado-1', 0)]]]),
    wind: new Map([['5%', [createFeature('wind-1', 1)]]]),
    hail: new Map([['5%', [createFeature('hail-1', 2)]]]),
    totalSevere: new Map([['15%', [createFeature('severe-1', 3)]]]),
    categorical: new Map([['MRGL', [createFeature('cat-1', 4)]]]),
    'day4-8': new Map([['15%', [createFeature('day48-1', 5)]]]),
  });

  test('clones the tornado map', () => {
    const data = createOutlookData();
    const cloned = cloneOutlookData(data);

    expect(cloned.tornado?.get('2%')?.[0]).toEqual(data.tornado?.get('2%')?.[0]);
    expect(cloned.tornado?.get('2%')?.[0]).not.toBe(data.tornado?.get('2%')?.[0]);
  });

  test('clones the wind map', () => {
    const data = createOutlookData();
    const cloned = cloneOutlookData(data);

    expect(cloned.wind?.get('5%')?.[0]).toEqual(data.wind?.get('5%')?.[0]);
    expect(cloned.wind?.get('5%')?.[0]).not.toBe(data.wind?.get('5%')?.[0]);
  });

  test('clones the hail map', () => {
    const data = createOutlookData();
    const cloned = cloneOutlookData(data);

    expect(cloned.hail?.get('5%')?.[0]).toEqual(data.hail?.get('5%')?.[0]);
    expect(cloned.hail?.get('5%')?.[0]).not.toBe(data.hail?.get('5%')?.[0]);
  });

  test('clones the total severe map', () => {
    const data = createOutlookData();
    const cloned = cloneOutlookData(data);

    expect(cloned.totalSevere?.get('15%')?.[0]).toEqual(data.totalSevere?.get('15%')?.[0]);
    expect(cloned.totalSevere?.get('15%')?.[0]).not.toBe(data.totalSevere?.get('15%')?.[0]);
  });

  test('clones the categorical map', () => {
    const data = createOutlookData();
    const cloned = cloneOutlookData(data);

    expect(cloned.categorical?.get('MRGL')?.[0]).toEqual(data.categorical?.get('MRGL')?.[0]);
    expect(cloned.categorical?.get('MRGL')?.[0]).not.toBe(data.categorical?.get('MRGL')?.[0]);
  });

  test('clones the day4-8 map', () => {
    const data = createOutlookData();
    const cloned = cloneOutlookData(data);

    expect(cloned['day4-8']?.get('15%')?.[0]).toEqual(data['day4-8']?.get('15%')?.[0]);
    expect(cloned['day4-8']?.get('15%')?.[0]).not.toBe(data['day4-8']?.get('15%')?.[0]);
  });

  test('preserves missing maps and isolates live edits', () => {
    const feature = createFeature('tornado-1', 0);
    const data: OutlookData = { tornado: new Map([['2%', [feature]]]) };

    const cloned = cloneOutlookData(data);

    expect(cloned.wind).toBeUndefined();
    expect(cloned.hail).toBeUndefined();
    expect(cloned.totalSevere).toBeUndefined();
    expect(cloned.categorical).toBeUndefined();
    expect(cloned['day4-8']).toBeUndefined();

    feature.properties = { ...feature.properties, probability: '10%' };
    expect(cloned.tornado?.get('2%')?.[0].properties).toMatchObject({ probability: '2%' });
  });
});

describe('cloneCustomLayers', () => {
  test('returns undefined when custom layers are missing', () => {
    expect(cloneCustomLayers(undefined)).toBeUndefined();
  });

  test('deep-clones custom layer metadata', () => {
    const customLayers = createCustomLayers();

    const cloned = cloneCustomLayers(customLayers);

    expect(cloned).toEqual(customLayers);
    expect(cloned).not.toBe(customLayers);
    expect(cloned?.layers).not.toBe(customLayers.layers);

    customLayers.layers[0].label = 'Changed';
    expect(cloned?.layers[0].label).toBe('Layer 1');
  });
});

describe('cloneIntegratedCustomLayers', () => {
  test('returns undefined when custom layers are missing', () => {
    expect(cloneIntegratedCustomLayers(undefined)).toBeUndefined();
  });

  test('preserves stored custom content across transitions', () => {
    const customLayers = createCustomLayers();

    const cloned = cloneIntegratedCustomLayers(customLayers);

    expect(cloned).toEqual(customLayers);
    expect(cloned).not.toBe(customLayers);

    customLayers.layers[0].label = 'Changed';
    expect(cloned?.layers[0].label).toBe('Layer 1');
  });
});
