import type { Feature, Polygon } from 'geojson';
import type { DayType } from '../types/outlooks';
import reducer, {
  addFeature,
  applyAutoCategoricalSync,
  importForecastCycle,
  redoLastEdit,
  resetForecasts,
  selectCanRedo,
  selectCanUndo,
  setForecastDay,
  toggleLowProbability,
  undoLastEdit,
  updateFeature,
  removeFeature,
} from './forecastSlice';

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
  properties: {
    outlookType: 'tornado',
    probability: '2%',
    isSignificant: false,
  },
});

const createCategoricalFeature = (id: string, offset: number): Feature => ({
  type: 'Feature',
  id,
  geometry: createPolygon(offset),
  properties: {
    outlookType: 'categorical',
    probability: 'ENH',
    isSignificant: false,
    derivedFrom: 'auto-generated',
  },
});

const getTornadoFeatures = (state: ReturnType<typeof reducer>) =>
  state.forecastCycle.days[state.forecastCycle.currentDay]?.data.tornado?.get('2%') || [];

const getUndoStack = (state: ReturnType<typeof reducer>, day: DayType) =>
  state.historyByDay[day]?.undoStack || [];

const getRedoStack = (state: ReturnType<typeof reducer>, day: DayType) =>
  state.historyByDay[day]?.redoStack || [];

describe('forecastSlice undo/redo', () => {
  test('undoes and redoes added features', () => {
    let state = reducer(undefined, addFeature({ feature: createFeature('one', 0) }));

    expect(getTornadoFeatures(state)).toHaveLength(1);
    expect(selectCanUndo({ forecast: state } as never)).toBe(true);

    state = reducer(state, undoLastEdit());
    expect(getTornadoFeatures(state)).toHaveLength(0);
    expect(selectCanRedo({ forecast: state } as never)).toBe(true);

    state = reducer(state, redoLastEdit());
    expect(getTornadoFeatures(state)).toHaveLength(1);
  });

  test('undoes and redoes feature modifications', () => {
    let state = reducer(undefined, addFeature({ feature: createFeature('feature-1', 0) }));

    state = reducer(state, updateFeature({
      feature: {
        ...createFeature('feature-1', 3),
        properties: {
          outlookType: 'tornado',
          probability: '2%',
          isSignificant: false,
        },
      },
    }));

    expect((getTornadoFeatures(state)[0].geometry as Polygon).coordinates[0][0]).toEqual([3, 3]);

    state = reducer(state, undoLastEdit());
    expect((getTornadoFeatures(state)[0].geometry as Polygon).coordinates[0][0]).toEqual([0, 0]);

    state = reducer(state, redoLastEdit());
    expect((getTornadoFeatures(state)[0].geometry as Polygon).coordinates[0][0]).toEqual([3, 3]);
  });

  test('undo restores deleted features', () => {
    let state = reducer(undefined, addFeature({ feature: createFeature('feature-1', 0) }));

    state = reducer(state, removeFeature({
      outlookType: 'tornado',
      probability: '2%',
      featureId: 'feature-1',
    }));

    expect(getTornadoFeatures(state)).toHaveLength(0);

    state = reducer(state, undoLastEdit());
    expect(getTornadoFeatures(state)).toHaveLength(1);
  });

  test('undo and redo restore low probability metadata and features', () => {
    let state = reducer(undefined, addFeature({ feature: createFeature('feature-1', 0) }));

    state = reducer(state, toggleLowProbability());
    expect(getTornadoFeatures(state)).toHaveLength(0);
    expect(state.forecastCycle.days[1]?.metadata.lowProbabilityOutlooks).toContain('tornado');

    state = reducer(state, undoLastEdit());
    expect(getTornadoFeatures(state)).toHaveLength(1);
    expect(state.forecastCycle.days[1]?.metadata.lowProbabilityOutlooks).not.toContain('tornado');

    state = reducer(state, redoLastEdit());
    expect(getTornadoFeatures(state)).toHaveLength(0);
    expect(state.forecastCycle.days[1]?.metadata.lowProbabilityOutlooks).toContain('tornado');
  });

  test('new edits clear redo history', () => {
    let state = reducer(undefined, addFeature({ feature: createFeature('feature-1', 0) }));
    state = reducer(state, undoLastEdit());

    expect(selectCanRedo({ forecast: state } as never)).toBe(true);

    state = reducer(state, addFeature({ feature: createFeature('feature-2', 2) }));
    expect(selectCanRedo({ forecast: state } as never)).toBe(false);
  });

  test('history stack is capped at 50 entries', () => {
    let state = reducer(undefined, { type: '@@INIT' });

    for (let index = 0; index < 55; index += 1) {
      state = reducer(state, addFeature({ feature: createFeature(`feature-${index}`, index) }));
    }

    expect(getUndoStack(state, 1)).toHaveLength(50);
  });

  test('history stays with each day when switching days', () => {
    let state = reducer(undefined, addFeature({ feature: createFeature('feature-1', 0) }));
    expect(selectCanUndo({ forecast: state } as never)).toBe(true);

    state = reducer(state, setForecastDay(2));
    expect(selectCanUndo({ forecast: state } as never)).toBe(false);

    state = reducer(state, addFeature({ feature: createFeature('feature-2', 1) }));
    expect(selectCanUndo({ forecast: state } as never)).toBe(true);
    expect(getUndoStack(state, 1)).toHaveLength(1);
    expect(getUndoStack(state, 2)).toHaveLength(1);

    state = reducer(state, undoLastEdit());
    expect(getTornadoFeatures(state)).toHaveLength(0);
    expect(selectCanUndo({ forecast: state } as never)).toBe(false);
    expect(selectCanRedo({ forecast: state } as never)).toBe(true);

    state = reducer(state, setForecastDay(1));
    expect(selectCanUndo({ forecast: state } as never)).toBe(true);
    state = reducer(state, undoLastEdit());
    expect(getTornadoFeatures(state)).toHaveLength(0);
    expect(selectCanRedo({ forecast: state } as never)).toBe(true);
  });

  test('auto categorical sync updates state without adding its own undo entry', () => {
    let state = reducer(undefined, addFeature({ feature: createFeature('feature-1', 0) }));
    expect(getUndoStack(state, 1)).toHaveLength(1);

    state = reducer(
      state,
      applyAutoCategoricalSync({
        map: new Map([['ENH', [createCategoricalFeature('categorical-1', 5)]]]),
      })
    );

    expect(getUndoStack(state, 1)).toHaveLength(1);
    expect(state.forecastCycle.days[1]?.data.categorical?.get('ENH')).toHaveLength(1);

    state = reducer(state, undoLastEdit());

    expect(getTornadoFeatures(state)).toHaveLength(0);
    expect(state.forecastCycle.days[1]?.data.categorical?.size ?? 0).toBe(0);
  });

  test('importing and resetting clear all per-day history', () => {
    let state = reducer(undefined, addFeature({ feature: createFeature('feature-1', 0) }));
    state = reducer(state, setForecastDay(2));
    state = reducer(state, addFeature({ feature: createFeature('feature-2', 1) }));

    state = reducer(state, importForecastCycle(state.forecastCycle));
    expect(selectCanUndo({ forecast: state } as never)).toBe(false);
    expect(getUndoStack(state, 1)).toHaveLength(0);
    expect(getUndoStack(state, 2)).toHaveLength(0);
    expect(getRedoStack(state, 1)).toHaveLength(0);
    expect(getRedoStack(state, 2)).toHaveLength(0);

    state = reducer(state, addFeature({ feature: createFeature('feature-3', 2) }));
    state = reducer(state, resetForecasts());
    expect(selectCanUndo({ forecast: state } as never)).toBe(false);
    expect(selectCanRedo({ forecast: state } as never)).toBe(false);
  });
});
