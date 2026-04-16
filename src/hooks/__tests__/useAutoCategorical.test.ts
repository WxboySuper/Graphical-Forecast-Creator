import React from 'react';
import { Provider } from 'react-redux';
import { act, render, waitFor } from '@testing-library/react';
import { configureStore } from '@reduxjs/toolkit';
import useAutoCategorical, { processOutlooksToCategorical } from '../useAutoCategorical';
import { OutlookData } from '../../types/outlooks';
import { Feature, Polygon } from 'geojson';
import forecastReducer, { addFeature, undoLastEdit, updateFeature } from '../../store/forecastSlice';

const mockUuid = jest.fn(() => 'mock-uuid');

jest.mock('uuid', () => ({
  v4: () => mockUuid(),
}));

const makeFeature = (id: string): Feature<Polygon> => ({
  type: 'Feature',
  id,
  geometry: { type: 'Polygon', coordinates: [[[0,0],[1,0],[1,1],[0,1],[0,0]]] },
  properties: {}
});

const makeProbabilisticFeature = (id: string, offset: number): Feature<Polygon> => ({
  type: 'Feature',
  id,
  geometry: {
    type: 'Polygon',
    coordinates: [[
      [offset, offset],
      [offset + 1, offset],
      [offset + 1, offset + 1],
      [offset, offset + 1],
      [offset, offset],
    ]]
  },
  properties: {
    outlookType: 'tornado',
    probability: '30%',
    isSignificant: false
  }
});

const createStore = () => configureStore({
  reducer: {
    forecast: forecastReducer
  },
  middleware: (getDefaultMiddleware) => getDefaultMiddleware({
    serializableCheck: false,
    immutableCheck: false
  })
});

const HookHarness = () => {
  useAutoCategorical();
  return null;
};

const getCategoricalFeatures = (store: ReturnType<typeof createStore>) =>
  store.getState().forecast.forecastCycle.days[1]?.data.categorical?.get('ENH') || [];

describe('processOutlooksToCategorical', () => {
  beforeEach(() => {
    mockUuid.mockReset();
    mockUuid.mockImplementation(() => 'mock-uuid');
  });

  test('returns empty array for empty outlooks', () => {
    const outlooks: OutlookData = {
      tornado: new Map(),
      wind: new Map(),
      hail: new Map(),
      categorical: new Map()
    };

    const result = processOutlooksToCategorical(outlooks);
    expect(result.length).toBe(0);
  });

  test('converts single tornado probability to categorical feature', () => {
    const feature = makeFeature('t1');
    const outlooks: OutlookData = {
      tornado: new Map([['30%', [feature]]]),
      wind: new Map(),
      hail: new Map(),
      categorical: new Map()
    };

    const result = processOutlooksToCategorical(outlooks);
    expect(result.length).toBeGreaterThan(0);
    expect(result.every((feature) => feature.properties?.outlookType === 'categorical')).toBe(true);
    expect(result.some((feature) => feature.properties?.probability === 'ENH')).toBe(true);
  });

  // Since we use turf intersection, robust testing requires valid geometries and turf mocking or integration.
  // The simple object identity checks are no longer valid as new features are created.

  test('undoing a probabilistic edit regenerates categorical output', async () => {
    const store = createStore();

    render(React.createElement(Provider, { store, children: React.createElement(HookHarness) }));

    act(() => {
      store.dispatch(addFeature({ feature: makeProbabilisticFeature('feature-1', 0) }));
    });

    await waitFor(() => {
      expect(getCategoricalFeatures(store).length).toBeGreaterThan(0);
      expect((getCategoricalFeatures(store)[0].geometry as Polygon).coordinates[0][0]).toEqual([0, 0]);
    });

    act(() => {
      store.dispatch(updateFeature({ feature: makeProbabilisticFeature('feature-1', 3) }));
    });

    await waitFor(() => {
      expect((getCategoricalFeatures(store)[0].geometry as Polygon).coordinates[0][0]).toEqual([3, 3]);
    });

    act(() => {
      store.dispatch(undoLastEdit());
    });

    await waitFor(() => {
      expect((getCategoricalFeatures(store)[0].geometry as Polygon).coordinates[0][0]).toEqual([0, 0]);
    });
  });
});
