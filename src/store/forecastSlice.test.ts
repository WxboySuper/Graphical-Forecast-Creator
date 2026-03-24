import type { Feature, Polygon } from 'geojson';
import type { DayType } from '../types/outlooks';
import reducer, {
  addFeature,
  applyAutoCategoricalSync,
  copyFeaturesFromPrevious,
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

interface FeatureOptions {
  outlookType: string;
  probability: string;
  extras?: Record<string, unknown>;
}

const createBaseFeature = (
  id: string,
  offset: number,
  options: FeatureOptions
): Feature => ({
  type: 'Feature',
  id,
  geometry: createPolygon(offset),
  properties: {
    ...options,
    isSignificant: false,
    ...options.extras,
  },
});

const createFeature = (id: string, offset: number): Feature =>
  createBaseFeature(id, offset, { outlookType: 'tornado', probability: '2%' });

const createCategoricalFeature = (id: string, offset: number): Feature =>
  createBaseFeature(id, offset, {
    outlookType: 'categorical',
    probability: 'ENH',
    extras: { derivedFrom: 'auto-generated' },
  });

const createOutlookFeature = (
  id: string,
  offset: number,
  outlookType: 'tornado' | 'totalSevere' | 'day4-8',
  probability: '2%' | '15%' | '30%'
): Feature => createBaseFeature(id, offset, { outlookType, probability });

interface CopyTestSetup {
  sourceDay: DayType;
  sourceType: string;
  sourceProb: string;
  targetDay: DayType;
  targetType: string;
  targetProb: string;
}

interface CopyExpectations {
  state: ReturnType<typeof reducer>;
  day: DayType;
  outlookType: string;
  probability: string;
  expectedLength: number;
  expectedId?: string;
}

const createCopyTestSetup = ({
  sourceDay,
  sourceType,
  sourceProb,
  targetDay,
  targetType,
  targetProb,
}: CopyTestSetup) => {
  let sourceState = reducer(undefined, setForecastDay(sourceDay));
  sourceState = reducer(
    sourceState,
    addFeature({ feature: createOutlookFeature('source', sourceDay, sourceType as never, sourceProb as never) })
  );

  let targetState = reducer(undefined, setForecastDay(targetDay));
  targetState = reducer(
    targetState,
    addFeature({ feature: createOutlookFeature('stale', targetDay + 5, targetType as never, targetProb as never) })
  );

  return { sourceState, targetState };
};

const expectCopyResult = ({
  state,
  day,
  outlookType,
  probability,
  expectedLength,
  expectedId,
}: CopyExpectations) => {
  const data = state.forecastCycle.days[day]?.data as Record<string, Map<string, Feature[]> | undefined>;
  const features = data[outlookType]?.get(probability);
  expect(features).toHaveLength(expectedLength);
  if (expectedId) {
    expect(features?.[0].id).toBe(expectedId);
  }
};

const expectOutlookTypeEmpty = (
  state: ReturnType<typeof reducer>,
  day: DayType,
  outlookType: string
) => {
  const data = state.forecastCycle.days[day]?.data as Record<string, Map<string, Feature[]> | undefined>;
  expect(data[outlookType]?.size ?? 0).toBe(0);
};

interface DeepCloneCheck {
  copiedFeature: Feature | undefined;
  sourceFeature: Feature | undefined;
}

const expectDeepCloned = ({ copiedFeature, sourceFeature }: DeepCloneCheck) => {
  expect(copiedFeature).not.toBe(sourceFeature);
};

const createSourceWithFeatures = (id1: string, id2: string) => {
  let state = reducer(undefined, addFeature({ feature: createFeature(id1, 0) }));
  state = reducer(state, addFeature({ feature: createCategoricalFeature(id2, 1) }));
  return state;
};

const createTargetWithFeature = (day: DayType, id: string, offset: number) => {
  let state = reducer(undefined, setForecastDay(day));
  state = reducer(state, addFeature({ feature: createFeature(id, offset) }));
  return state;
};

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

  test('copies compatible day 4-8 features into day 3 total severe and clears old target data', () => {
    const { sourceState, targetState } = createCopyTestSetup({
      sourceDay: 4,
      sourceType: 'day4-8',
      sourceProb: '15%',
      targetDay: 3,
      targetType: 'totalSevere',
      targetProb: '30%',
    });

    const nextState = reducer(
      targetState,
      copyFeaturesFromPrevious({
        sourceCycle: sourceState.forecastCycle,
        sourceDay: 4,
        targetDay: 3,
      })
    );

    expectCopyResult({
      state: nextState,
      day: 3,
      outlookType: 'totalSevere',
      probability: '15%',
      expectedLength: 1,
      expectedId: 'source',
    });
    expect(nextState.forecastCycle.days[3]?.data.totalSevere?.get('30%') || []).toHaveLength(0);
  });

  test('copies direct day 1 outlooks into day 2 and deep-clones the features', () => {
    const sourceState = createSourceWithFeatures('source-day1', 'source-categorical');
    const targetState = createTargetWithFeature(2, 'stale-target', 5);

    const nextState = reducer(
      targetState,
      copyFeaturesFromPrevious({
        sourceCycle: sourceState.forecastCycle,
        sourceDay: 1,
        targetDay: 2,
      })
    );

    const copiedTornado = nextState.forecastCycle.days[2]?.data.tornado?.get('2%')?.[0];
    const copiedCategorical = nextState.forecastCycle.days[2]?.data.categorical?.get('ENH')?.[0];
    const sourceTornado = sourceState.forecastCycle.days[1]?.data.tornado?.get('2%')?.[0];

    expect(copiedTornado?.id).toBe('source-day1');
    expect(copiedCategorical?.id).toBe('source-categorical');
    expect(nextState.forecastCycle.days[2]?.data.tornado?.get('2%')).toHaveLength(1);
    expectDeepCloned({ copiedFeature: copiedTornado, sourceFeature: sourceTornado });
  });

  test('copies only categorical outlooks from day 3 into day 1', () => {
    let sourceState = reducer(undefined, setForecastDay(3));
    sourceState = reducer(
      sourceState,
      addFeature({ feature: createOutlookFeature('source-total-severe', 3, 'totalSevere', '15%') })
    );
    sourceState = reducer(
      sourceState,
      addFeature({ feature: createCategoricalFeature('source-categorical', 4) })
    );

    const targetState = reducer(undefined, addFeature({ feature: createFeature('stale-target', 8) }));

    const nextState = reducer(
      targetState,
      copyFeaturesFromPrevious({
        sourceCycle: sourceState.forecastCycle,
        sourceDay: 3,
        targetDay: 1,
      })
    );

    expectCopyResult({
      state: nextState,
      day: 1,
      outlookType: 'categorical',
      probability: 'ENH',
      expectedLength: 1,
      expectedId: 'source-categorical',
    });
    expectOutlookTypeEmpty(nextState, 1, 'tornado');
    expectOutlookTypeEmpty(nextState, 1, 'wind');
    expectOutlookTypeEmpty(nextState, 1, 'hail');
  });

  test('clears incompatible target data when copying from day 1 to day 4', () => {
    const sourceState = reducer(undefined, addFeature({ feature: createFeature('source-day1', 0) }));

    let targetState = reducer(undefined, setForecastDay(4));
    targetState = reducer(
      targetState,
      addFeature({ feature: createOutlookFeature('existing-day48', 6, 'day4-8', '15%') })
    );

    const nextState = reducer(
      targetState,
      copyFeaturesFromPrevious({
        sourceCycle: sourceState.forecastCycle,
        sourceDay: 1,
        targetDay: 4,
      })
    );

    expect(nextState.forecastCycle.days[4]?.data['day4-8']?.size ?? 0).toBe(0);
  });
});
