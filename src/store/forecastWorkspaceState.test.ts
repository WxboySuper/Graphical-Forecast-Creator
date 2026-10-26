import type { DiscussionData } from '../types/outlooks';
import { createSavedCycleId } from './forecastSliceWorkspaceHelpers';
import { getFirstExposedOutlookType } from '../config/productExposureSelectors';
import reducer, {
  createOutlookUpdate,
  deleteSavedCycle,
  loadCycleHistory,
  loadSavedCycle,
  resetForecasts,
  resumeIncompleteCycle,
  restoreForecastCycle,
  saveCurrentCycle,
  selectSavedCyclesForActiveWorkspace,
  selectCustomLayer,
  setActiveProbability,
  setCustomEditorMode,
  setForecastDay,
  setForecastWorkspace,
  setMapView,
  startBlankCycle,
  startFromPreviousCycle,
  toggleSignificant,
  updateDiscussionDraft,
  validateCompletion,
} from './forecastSlice';

describe('forecast workspace state', () => {
  test('creates cycle IDs when saved-cycle history contains null or is missing', () => {
    const state = reducer(undefined, { type: 'test/init' });

    expect(createSavedCycleId({ ...state, savedCycles: [null] as never }, '2026-10-26'))
      .toBe('cycle-2026-10-26-1');
    expect(createSavedCycleId({ ...state, savedCycles: undefined as never }, '2026-10-26'))
      .toBe('cycle-2026-10-26-1');
  });

  test('records the active workspace on saved cycles', () => {
    let state = reducer(undefined, setForecastWorkspace('custom'));
    state = reducer(state, saveCurrentCycle({ label: 'Custom cycle' }));

    expect(state.workspaceId).toBe('custom');
    expect(state.savedCycles[0]?.workspaceId).toBe('custom');
  });

  test('ignores an invalid workspace action and keeps Severe active', () => {
    const state = reducer(undefined, setForecastWorkspace('not-a-workspace' as never));

    expect(state.workspaceId).toBe('severe');
  });

  test('normalizes missing workspace ownership on history hydration to Severe', () => {
    let state = reducer(undefined, { type: 'test/init' });
    state = reducer(state, saveCurrentCycle({ label: 'Legacy cycle' }));
    const legacyCycle = { ...state.savedCycles[0] };
    delete (legacyCycle as { workspaceId?: string }).workspaceId;

    const hydrated = reducer(undefined, loadCycleHistory([legacyCycle]));
    expect(hydrated.savedCycles[0]?.workspaceId).toBe('severe');
  });

  test('normalizes malformed workspace ownership on history hydration to Severe', () => {
    let state = reducer(undefined, { type: 'test/init' });
    state = reducer(state, saveCurrentCycle({ label: 'Direct cycle' }));
    const malformedCycle = {
      ...state.savedCycles[0],
      workspaceId: 'not-a-workspace',
    };

    const hydratedArray = reducer(undefined, loadCycleHistory([malformedCycle as never]));
    expect(hydratedArray.savedCycles[0]?.workspaceId).toBe('severe');

    const hydratedSnapshot = reducer(undefined, loadCycleHistory({
      cycles: [malformedCycle as never],
      lifetimeCycleStats: { totalCyclesMade: 1, totalForecastsMade: 0 },
    }));
    expect(hydratedSnapshot.savedCycles[0]?.workspaceId).toBe('severe');
  });

  test('keeps the route-owned workspace when loading a cycle from another workspace', () => {
    let state = reducer(undefined, setForecastWorkspace('custom'));
    state = reducer(state, saveCurrentCycle({ label: 'Custom cycle' }));
    const customId = state.savedCycles[0]?.id as string;

    state = reducer(state, setForecastWorkspace('severe'));
    expect(state.workspaceId).toBe('severe');

    state = reducer(state, loadSavedCycle(customId));
    expect(state.workspaceId).toBe('severe');
    expect(state.savedCycles[0]?.workspaceId).toBe('custom');
  });

  test('loading a cycle with missing or malformed ownership leaves the active workspace unchanged', () => {
    let state = reducer(undefined, setForecastWorkspace('custom'));
    state = reducer(state, saveCurrentCycle({ label: 'Legacy load' }));
    const legacyId = state.savedCycles[0]?.id as string;

    const missingOwner = {
      ...state.savedCycles[0],
    };
    delete (missingOwner as { workspaceId?: string }).workspaceId;
    const withMissing = {
      ...state,
      savedCycles: [missingOwner],
    };
    expect(reducer(withMissing, loadSavedCycle(legacyId)).workspaceId).toBe('custom');

    const withMalformed = {
      ...state,
      savedCycles: [{ ...state.savedCycles[0], workspaceId: 'not-a-workspace' } as never],
    };
    expect(reducer(withMalformed, loadSavedCycle(legacyId)).workspaceId).toBe('custom');
  });

  test('resets the stale document when the route switches workspaces', () => {
    let state = reducer(undefined, saveCurrentCycle({ label: 'Severe cycle' }));
    const severeCycle = state.forecastCycle;
    const previousGeneration = state.cycleGeneration;
    state = reducer(state, setForecastWorkspace('custom'));

    expect(state.workspaceId).toBe('custom');
    expect(state.cycleGeneration).toBe(previousGeneration + 1);
    expect(state.forecastCycle).not.toBe(severeCycle);
    expect(state.savedCycles).toHaveLength(1);
    expect(state.isSaved).toBe(false);

    // Re-dispatching the active workspace is a no-op and keeps the document.
    const beforeNoop = state.forecastCycle;
    state = reducer(state, setForecastWorkspace('custom'));
    expect(state.forecastCycle).toBe(beforeNoop);
  });

  test('resets editor, map, and completion state when the route switches workspaces', () => {
    let state = reducer(undefined, setMapView({ center: [10, 20], zoom: 9 }));
    state = reducer(state, setActiveProbability('15%'));
    state = reducer(state, toggleSignificant());
    state = reducer(state, setCustomEditorMode('custom'));
    state = reducer(state, selectCustomLayer('layer-1'));
    state = reducer(state, validateCompletion());

    expect(state.currentMapView).toEqual({ center: [10, 20], zoom: 9 });
    expect(state.drawingState).toEqual({ activeOutlookType: 'tornado', activeProbability: '15%', isSignificant: true });
    expect(state.customEditor.mode).toBe('custom');
    expect(state.completionValidation.showCompletionModal).toBe(true);

    state = reducer(state, setForecastWorkspace('custom'));

    expect(state.currentMapView).toEqual({ center: [39.8283, -98.5795], zoom: 4 });
    expect(state.drawingState).toEqual({ activeOutlookType: getFirstExposedOutlookType(), activeProbability: '2%', isSignificant: false });
    // The Custom workspace opens in its own editor instead of Severe's defaults.
    expect(state.customEditor).toEqual({ mode: 'custom', activeLayerId: null, activeCategoryId: null });
    expect(state.completionValidation).toEqual({ lastResult: null, showCompletionModal: false, omittedDays: {} });

    state = reducer(state, setForecastWorkspace('severe'));

    expect(state.customEditor).toEqual({ mode: 'severe', activeLayerId: null, activeCategoryId: null });
    expect(state.drawingState).toEqual({ activeOutlookType: getFirstExposedOutlookType(), activeProbability: '2%', isSignificant: false });
  });

  test('does not alias active discussion drafts with the parked workspace copy', () => {
    const severeDraft = { mode: 'diy' as const, diyContent: 'Severe draft' } as DiscussionData;
    const customDraft = { mode: 'diy' as const, diyContent: 'Custom draft' } as DiscussionData;

    let state = reducer(undefined, updateDiscussionDraft({ scopeId: 'day1', draft: severeDraft }));
    state = reducer(state, setForecastWorkspace('custom'));
    state = reducer(state, updateDiscussionDraft({ scopeId: 'day1', draft: customDraft }));
    state = reducer(state, setForecastWorkspace('severe'));

    const parkedSevereDrafts = state.discussionDraftsByWorkspace.severe;
    expect(state.discussionDraftsByScope).not.toBe(parkedSevereDrafts);
    expect(state.discussionDraftsByScope.day1).not.toBe(parkedSevereDrafts?.day1);

    state = reducer(state, updateDiscussionDraft({
      scopeId: 'day1',
      draft: { ...state.discussionDraftsByScope.day1!, diyContent: 'Edited severe draft' },
    }));

    expect(state.discussionDraftsByWorkspace.severe?.day1?.diyContent).toBe('Severe draft');
    state = reducer(state, setForecastWorkspace('custom'));
    expect(state.discussionDraftsByScope.day1?.diyContent).toBe('Custom draft');
  });

  test('keeps discussion drafts with their own workspace across switches', () => {
    const severeDraft = { mode: 'diy' as const, diyContent: 'Severe draft' } as DiscussionData;
    const customDraft = { mode: 'diy' as const, diyContent: 'Custom draft' } as DiscussionData;

    let state = reducer(undefined, updateDiscussionDraft({ scopeId: 'day1', draft: severeDraft }));
    expect(state.discussionDraftsByScope.day1).toEqual(severeDraft);

    // Switching away parks the drafts instead of dropping them, and the new
    // workspace starts with no draft of its own.
    state = reducer(state, setForecastWorkspace('custom'));
    expect(state.discussionDraftsByScope).toEqual({});

    state = reducer(state, updateDiscussionDraft({ scopeId: 'day1', draft: customDraft }));
    expect(state.discussionDraftsByScope.day1).toEqual(customDraft);

    // Switching back hands Severe its draft, and Custom keeps its own on the
    // next round trip.
    state = reducer(state, setForecastWorkspace('severe'));
    expect(state.discussionDraftsByScope.day1).toEqual(severeDraft);

    state = reducer(state, setForecastWorkspace('custom'));
    expect(state.discussionDraftsByScope.day1).toEqual(customDraft);
  });

  test('memoizes workspace cycle selection across unrelated state changes', () => {
    const state = { forecast: reducer(undefined, { type: '@@INIT' }) } as Parameters<typeof selectSavedCyclesForActiveWorkspace>[0];
    const first = selectSavedCyclesForActiveWorkspace(state);
    const second = selectSavedCyclesForActiveWorkspace({
      ...state,
      forecast: { ...state.forecast, isSaved: !state.forecast.isSaved },
    });

    expect(second).toBe(first);
  });

  test('does not load or delete a cycle owned by another workspace', () => {
    let severeState = reducer(undefined, saveCurrentCycle({ label: 'Severe cycle' }));
    const severeCycle = severeState.savedCycles[0]!;
    severeState = reducer(severeState, setForecastWorkspace('custom'));
    severeState = reducer(severeState, saveCurrentCycle({ label: 'Custom cycle' }));
    const beforeLoad = severeState.forecastCycle;

    const afterLoad = reducer(severeState, loadSavedCycle(severeCycle.id));
    const afterDelete = reducer(afterLoad, deleteSavedCycle(severeCycle.id));
    const afterResume = reducer(afterDelete, resumeIncompleteCycle({ cycleId: severeCycle.id }));
    const afterStart = reducer(afterResume, startFromPreviousCycle({ sourceCycleId: severeCycle.id }));

    expect(afterLoad.forecastCycle).toBe(beforeLoad);
    expect(afterDelete.savedCycles.some((cycle) => cycle.id === severeCycle.id)).toBe(true);
    expect(afterResume.forecastCycle).toBe(beforeLoad);
    expect(afterStart.forecastCycle).toBe(beforeLoad);
  });


  describe('cycle session identity', () => {
    it('tracks cycle generation across replacements, edits, and saved-cycle loads', () => {
      const first = reducer(undefined, createOutlookUpdate());
      const restored = reducer(first, restoreForecastCycle(first.forecastCycle));
      const imported = reducer(restored, resetForecasts());
      const started = reducer(imported, startBlankCycle({}));

      expect(restored.cycleGeneration).toBe(2);
      expect(imported.cycleGeneration).toBe(3);
      expect(started.cycleGeneration).toBe(4);

      let state = reducer(undefined, resetForecasts());
      state = reducer(state, setForecastDay(1));
      const generation = state.cycleGeneration;
      state = reducer(state, setForecastDay(2));

      expect(state.cycleGeneration).toBe(generation);

      let savedCycleState = reducer(undefined, setForecastDay(1));
      savedCycleState = reducer(savedCycleState, resetForecasts());
      savedCycleState = reducer(savedCycleState, saveCurrentCycle({}));
      const savedGeneration = savedCycleState.cycleGeneration;
      savedCycleState = reducer(savedCycleState, resumeIncompleteCycle({ cycleId: savedCycleState.savedCycles[0].id }));

      expect(savedCycleState.cycleGeneration).toBe(savedGeneration + 1);
    });
  });

});
