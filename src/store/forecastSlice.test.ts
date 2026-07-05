import type { Feature, Polygon } from 'geojson';
import type { DayType } from '../types/outlooks';
import type { WorkflowMetadata } from '../types/workflow';
import reducer, {
  addFeature,
  applyAutoCategoricalSync,
  copyFeaturesFromPrevious,
  importForecastCycle,
  redoLastEdit,
  replaceTstmFeatures,
  resetForecasts,
  selectCanRedo,
  selectCanUndo,
  setForecastDay,
  toggleLowProbability,
  undoLastEdit,
  updateFeature,
  removeFeature,
  completeCycle,
  completeWithOmissions,
  markAsSaved,
  omitDay,
  validateCompletion,
  startBlankCycle,
  resumeIncompleteCycle,
  createOutlookUpdate,
  startFromPreviousCycle,
  saveCurrentCycle,
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

const createTstmFeature = (id: string, offset: number): Feature =>
  createBaseFeature(id, offset, {
    outlookType: 'categorical',
    probability: 'TSTM',
  });

const createStateWithCategoricalFeatures = () => {
  let state = reducer(undefined, setForecastDay(1));
  state = reducer(
    state,
    applyAutoCategoricalSync({
      map: new Map([
        ['TSTM', [createTstmFeature('old-tstm', 0)]],
        ['ENH', [createCategoricalFeature('enh', 2)]],
      ]),
    })
  );
  return state;
};

const getCategoricalFeatureId = (
  state: ReturnType<typeof reducer>,
  probability: string
) => state.forecastCycle.days[1]?.data.categorical?.get(probability)?.[0].id;

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

interface CopyVerificationInput {
  state: ReturnType<typeof reducer>;
  sourceState: ReturnType<typeof reducer>;
  targetDay: DayType;
  expectedTornadoId: string;
  expectedCategoricalId: string;
}

const expectCopyVerification = ({
  state,
  sourceState,
  targetDay,
  expectedTornadoId,
  expectedCategoricalId,
}: CopyVerificationInput) => {
  const copiedTornado = state.forecastCycle.days[targetDay]?.data.tornado?.get('2%')?.[0];
  const copiedCategorical = state.forecastCycle.days[targetDay]?.data.categorical?.get('ENH')?.[0];
  const sourceTornado = sourceState.forecastCycle.days[1]?.data.tornado?.get('2%')?.[0];

  expect(copiedTornado?.id).toBe(expectedTornadoId);
  expect(copiedCategorical?.id).toBe(expectedCategoricalId);
  expect(state.forecastCycle.days[targetDay]?.data.tornado?.get('2%')).toHaveLength(1);
  expectDeepCloned({ copiedFeature: copiedTornado, sourceFeature: sourceTornado });
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

  test('replaces only TSTM features and keeps generated categorical risks', () => {
    const state = reducer(
      createStateWithCategoricalFeatures(),
      replaceTstmFeatures({ features: [createTstmFeature('new-tstm', 4)] })
    );

    expect(getCategoricalFeatureId(state, 'TSTM')).toBe('new-tstm');
    expect(getCategoricalFeatureId(state, 'ENH')).toBe('enh');
  });

  test('records generated TSTM replacement as one undoable edit', () => {
    const replacedState = reducer(
      createStateWithCategoricalFeatures(),
      replaceTstmFeatures({ features: [createTstmFeature('new-tstm', 4)] })
    );

    expect(selectCanUndo({ forecast: replacedState } as never)).toBe(true);

    const restoredState = reducer(replacedState, undoLastEdit());
    expect(getCategoricalFeatureId(restoredState, 'TSTM')).toBe('old-tstm');
    expect(getCategoricalFeatureId(restoredState, 'ENH')).toBe('enh');
  });

  test('does not add an undo entry for logically identical TSTM features', () => {
    const firstFeature = createTstmFeature('generated-tstm', 0);
    const secondFeature = createTstmFeature('generated-tstm', 0);
    secondFeature.properties = {
      originalProbability: 'TSTM',
      derivedFrom: 'categorical',
      probability: 'TSTM',
      outlookType: 'categorical',
      isSignificant: false,
    };

    let state = reducer(
      reducer(undefined, setForecastDay(1)),
      replaceTstmFeatures({ features: [firstFeature] })
    );
    state = reducer(state, replaceTstmFeatures({ features: [secondFeature] }));

    state = reducer(state, undoLastEdit());
    expect(selectCanUndo({ forecast: state } as never)).toBe(false);
    expect(getCategoricalFeatureId(state, 'TSTM')).toBeUndefined();
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

    expectCopyVerification({
      state: nextState,
      sourceState,
      targetDay: 2,
      expectedTornadoId: 'source-day1',
      expectedCategoricalId: 'source-categorical',
    });
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

  it('completeCycle persists acknowledgement metadata without omission reasons', () => {
    let state = reducer(undefined, markAsSaved());
    state = reducer(state, validateCompletion());

    const nextState = reducer(state, completeCycle());

    expect(nextState.forecastCycle.completionAcknowledgedAt).toEqual(expect.any(String));
    expect(nextState.forecastCycle.omittedDayReasons).toBeUndefined();
    expect(nextState.isSaved).toBe(false);
  });

  it('completeWithOmissions persists acknowledgement metadata and marks the forecast unsaved', () => {
    let state = reducer(undefined, markAsSaved());
    state = reducer(state, validateCompletion());
    state = reducer(state, omitDay({ day: 3, reason: 'No severe weather expected' }));

    expect(state.completionValidation.showCompletionModal).toBe(true);

    const nextState = reducer(state, completeWithOmissions());

    expect(nextState.completionValidation.showCompletionModal).toBe(false);
    expect(nextState.completionValidation.lastResult).toBeNull();
    expect(nextState.forecastCycle.completionAcknowledgedAt).toEqual(expect.any(String));
    expect(nextState.forecastCycle.omittedDayReasons).toEqual({ 3: 'No severe weather expected' });
    expect(nextState.isSaved).toBe(false);
    expect(nextState.completionValidation.omittedDays).toEqual({});
  });

  describe('WF-04: Workflow entry, resume, update, and base-cycle actions', () => {
    const testWorkflowTemplate: WorkflowMetadata = {
      id: 'severe-day1',
      label: 'Severe Convective Day 1',
      groupings: ['day1'],
    };

    describe('startBlankCycle', () => {
      it('starts a blank cycle without workflow metadata', () => {
        const state = reducer(undefined, startBlankCycle({}));
        
        expect(state.forecastCycle.days[1]).toBeDefined();
        expect(state.forecastCycle.currentDay).toBe(1);
        expect(state.isSaved).toBe(false);
        expect(state.outlookVersionSnapshots).toEqual([]);
        expect(state.workflowMetadata).toBeUndefined();
        expect(state.workflowTemplate).toBeUndefined();
      });

      it('starts a blank cycle with workflow metadata', () => {
        const state = reducer(undefined, startBlankCycle({ 
          workflowTemplate: testWorkflowTemplate,
          cycleDate: '2026-07-04',
        }));
        
        expect(state.forecastCycle.cycleDate).toBe('2026-07-04');
        expect(state.workflowTemplate).toEqual(testWorkflowTemplate);
        expect(state.workflowMetadata).toBeDefined();
        expect(state.workflowMetadata?.workflowId).toBe('severe-day1');
        expect(state.workflowMetadata?.cycleDate).toBe('2026-07-04');
        expect(state.workflowMetadata?.status).toBe('in-progress');
        expect(state.workflowMetadata?.outlookVersions).toHaveLength(1);
        expect(state.workflowMetadata?.outlookVersions[0].version).toBe(1);
        expect(state.workflowMetadata?.outlookVersions[0].status).toBe('in-progress');
      });
    });

    describe('resumeIncompleteCycle', () => {
      it('resumes a saved cycle and restores workflow metadata', () => {
        // First create a saved cycle with workflow metadata
        let state = reducer(undefined, startBlankCycle({ 
          workflowTemplate: testWorkflowTemplate,
        }));
        state = reducer(state, markAsSaved());
        state = reducer(state, saveCurrentCycle({ label: 'Test Cycle' }));
        
        const savedCycleId = state.savedCycles[0].id;
        
        // Reset to a new cycle
        state = reducer(state, resetForecasts());
        expect(state.workflowMetadata).toBeUndefined();
        
        // Resume the saved cycle
        state = reducer(state, resumeIncompleteCycle({ cycleId: savedCycleId }));
        
        expect(state.workflowMetadata).toBeDefined();
        expect(state.workflowMetadata?.workflowId).toBe('severe-day1');
        expect(state.isSaved).toBe(true);
        expect(state.outlookVersionSnapshots).toEqual([]);
      });

      it('does nothing if cycle ID is not found', () => {
        const initialState = reducer(undefined, startBlankCycle({}));
        const state = reducer(initialState, resumeIncompleteCycle({ cycleId: 'nonexistent' }));
        
        expect(state).toEqual(initialState);
      });
    });

    describe('createOutlookUpdate', () => {
      it('creates a new outlook version within the current cycle', () => {
        // Start a workflow cycle
        let state = reducer(undefined, startBlankCycle({ 
          workflowTemplate: testWorkflowTemplate,
        }));
        
        expect(state.workflowMetadata?.outlookVersions).toHaveLength(1);
        expect(state.workflowMetadata?.outlookVersions[0].version).toBe(1);
        
        // Create an update
        state = reducer(state, createOutlookUpdate({}));
        
        expect(state.workflowMetadata?.outlookVersions).toHaveLength(2);
        expect(state.workflowMetadata?.outlookVersions[0].status).toBe('completed');
        expect(state.workflowMetadata?.outlookVersions[1].version).toBe(2);
        expect(state.workflowMetadata?.outlookVersions[1].status).toBe('in-progress');
        expect(state.workflowMetadata?.outlookVersions[1].derivedFrom).toBe(1);
        expect(state.isSaved).toBe(false);
      });

      it('creates multiple updates incrementing version numbers', () => {
        let state = reducer(undefined, startBlankCycle({ 
          workflowTemplate: testWorkflowTemplate,
        }));
        
        state = reducer(state, createOutlookUpdate({}));
        state = reducer(state, createOutlookUpdate({}));
        state = reducer(state, createOutlookUpdate({}));
        
        expect(state.workflowMetadata?.outlookVersions).toHaveLength(4);
        expect(state.workflowMetadata?.outlookVersions[3].version).toBe(4);
        expect(state.workflowMetadata?.outlookVersions[3].derivedFrom).toBe(3);
      });
    });

    describe('startFromPreviousCycle', () => {
      it('creates a new cycle derived from a previous cycle', () => {
        // Create and save a cycle with workflow metadata
        let state = reducer(undefined, startBlankCycle({ 
          workflowTemplate: testWorkflowTemplate,
        }));
        state = reducer(state, markAsSaved());
        state = reducer(state, saveCurrentCycle({ label: 'Previous Cycle' }));
        
        const previousCycleId = state.savedCycles[0].id;
        
        // Start a new cycle from the previous one
        state = reducer(state, startFromPreviousCycle({
          sourceCycleId: previousCycleId,
          newCycleDate: '2026-07-05',
          workflowTemplate: testWorkflowTemplate,
        }));
        
        expect(state.forecastCycle.cycleDate).toBe('2026-07-05');
        expect(state.forecastCycle.currentDay).toBe(1);
        expect(state.workflowMetadata).toBeDefined();
        expect(state.workflowMetadata?.workflowId).toBe('severe-day1');
        expect(state.workflowMetadata?.cycleDate).toBe('2026-07-05');
        expect(state.workflowMetadata?.status).toBe('in-progress');
        expect(state.isSaved).toBe(false);
        expect(state.outlookVersionSnapshots).toEqual([]);
      });

      it('does nothing if source cycle ID is not found', () => {
        const initialState = reducer(undefined, startBlankCycle({}));
        const state = reducer(initialState, startFromPreviousCycle({
          sourceCycleId: 'nonexistent',
        }));
        
        expect(state).toEqual(initialState);
      });
    });
  });
});
