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
    const firstClone = clonedFirst!.get('2%')![0];
    const secondClone = clonedSecond!.get('2%')![0];

    expect(firstClone).toEqual(secondClone);
    expect(firstClone).not.toBe(secondClone);
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
  type OutlookMapKey = 'tornado' | 'wind' | 'hail' | 'totalSevere' | 'categorical' | 'day4-8';

  const outlookCloneCases: { key: OutlookMapKey; probability: string; id: string; offset: number }[] = [
    { key: 'tornado', probability: '2%', id: 'tornado-1', offset: 0 },
    { key: 'wind', probability: '5%', id: 'wind-1', offset: 1 },
    { key: 'hail', probability: '5%', id: 'hail-1', offset: 2 },
    { key: 'totalSevere', probability: '15%', id: 'severe-1', offset: 3 },
    { key: 'categorical', probability: 'MRGL', id: 'cat-1', offset: 4 },
    { key: 'day4-8', probability: '15%', id: 'day48-1', offset: 5 },
  ];

  const createSingleMapData = (
    key: OutlookMapKey,
    probability: string,
    id: string,
    offset: number,
  ): OutlookData => {
    const data: OutlookData = {};
    data[key] = new Map([[probability, [createFeature(id, offset)]]]);
    return data;
  };

  test.each(outlookCloneCases)('clones the $key map', ({ key, probability, id, offset }) => {
    const data = createSingleMapData(key, probability, id, offset);
    const cloned = cloneOutlookData(data);
    const sourceFeature = data[key]!.get(probability)![0];
    const clonedFeature = cloned[key]!.get(probability)![0];

    expect(clonedFeature).toEqual(sourceFeature);
    expect(clonedFeature).not.toBe(sourceFeature);
  });

  test('preserves missing maps and isolates live edits', () => {
    const feature = createFeature('tornado-1', 0);
    const data: OutlookData = { tornado: new Map([['2%', [feature]]]) };

    const cloned = cloneOutlookData(data);

    for (const key of ['wind', 'hail', 'totalSevere', 'categorical', 'day4-8'] as const) {
      expect(cloned[key]).toBeUndefined();
    }

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
