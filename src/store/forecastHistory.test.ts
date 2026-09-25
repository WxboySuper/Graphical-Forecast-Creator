import type { Feature, Polygon } from 'geojson';
import type { DayType, OutlookDay } from '../types/outlooks';
import type { CustomLayerCollection } from '../types/customProducts';
import { CUSTOM_PRODUCTS_SCHEMA_VERSION } from '../types/customProducts';
import type { ForecastState } from './forecastSlice';
import reducer, { addFeature, redoLastEdit, undoLastEdit } from './forecastSlice';
import {
  applyDaySnapshot,
  clearHistory,
  getCurrentDaySnapshot,
  getOrCreateDayHistory,
  pushHistoryEntry,
  pushUndoSnapshot,
  restoreHistoryEntry,
  type ForecastDaySnapshot,
} from './forecastHistory';

const NOW = '2026-01-02T00:00:00.000Z';
const UNDO_NOW = '2026-01-03T12:00:00.000Z';
const REDO_NOW = '2026-01-03T13:00:00.000Z';

const makePolygon = (offset: number): Polygon => ({
  type: 'Polygon',
  coordinates: [
    [
      [offset, offset],
      [offset + 1, offset],
      [offset + 1, offset + 1],
      [offset, offset + 1],
      [offset, offset],
    ],
  ],
});

const makeFeature = (id: string, offset: number): Feature => ({
  type: 'Feature',
  id,
  geometry: makePolygon(offset),
  properties: { outlookType: 'tornado', probability: '2%', isSignificant: false },
});

const makeCustomLayers = (): CustomLayerCollection => ({
  schemaVersion: CUSTOM_PRODUCTS_SCHEMA_VERSION,
  layers: [
    {
      schemaVersion: CUSTOM_PRODUCTS_SCHEMA_VERSION,
      id: 'layer-1' as never,
      label: 'Custom',
      order: 0,
      categories: [],
      features: [
        {
          type: 'Feature',
          id: 'custom-1',
          geometry: makePolygon(9),
          properties: {
            customLayerId: 'layer-1' as never,
            categoryId: 'cat-1' as never,
            title: 'Custom feature',
          },
        },
      ],
      createdAt: NOW,
      updatedAt: NOW,
    },
  ],
});

const makeDay = (day: DayType, offset: number): OutlookDay => ({
  day,
  data: { tornado: new Map([['2%', [makeFeature(`feature-${day}`, offset)]]]) },
  customLayers: makeCustomLayers(),
  metadata: {
    issueDate: NOW,
    validDate: NOW,
    issuanceTime: '0600',
    createdAt: NOW,
    lastModified: NOW,
    lowProbabilityOutlooks: [],
    outlookOpacities: { tornado: 0.4 },
  },
});

const makeState = (days: Partial<Record<DayType, OutlookDay>>, currentDay: DayType): ForecastState =>
  ({
    forecastCycle: { days, currentDay, cycleDate: '2026-01-01' },
    historyByDay: {},
    isSaved: true,
  }) as unknown as ForecastState;

const makeEmptyDay =
  (day: DayType, timestamp: string): NonNullable<ForecastState['forecastCycle']['days'][DayType]> =>
    ({
      day,
      data: {},
      metadata: {
        issueDate: timestamp,
        validDate: timestamp,
        issuanceTime: '0600',
        createdAt: timestamp,
        lastModified: timestamp,
        lowProbabilityOutlooks: [],
      },
    }) as unknown as NonNullable<ForecastState['forecastCycle']['days'][DayType]>;

const makeSnapshot = (day: DayType, marker: string): ForecastDaySnapshot => ({
  day,
  data: { tornado: new Map([['2%', [makeFeature(marker, 0)]]]) },
  lowProbabilityOutlooks: [],
});

describe('forecastHistory helpers', () => {
  test('pushes undo snapshots into separate day stacks', () => {
    const state = makeState({ 1: makeDay(1, 0), 2: makeDay(2, 5) }, 1);

    pushUndoSnapshot(state, 1);
    expect(state.historyByDay[1]?.undoStack).toHaveLength(1);
    expect(state.historyByDay[2]?.undoStack ?? []).toHaveLength(0);

    pushUndoSnapshot(state, 2);
    expect(state.historyByDay[1]?.undoStack).toHaveLength(1);
    expect(state.historyByDay[2]?.undoStack).toHaveLength(1);
  });

  test('stores the matching forecast snapshot for each day', () => {
    const state = makeState({ 1: makeDay(1, 0), 2: makeDay(2, 5) }, 1);

    pushUndoSnapshot(state, 1);
    pushUndoSnapshot(state, 2);

    expect(state.historyByDay[1]?.undoStack[0].snapshot.data.tornado?.get('2%')?.[0].id).toBe(
      'feature-1',
    );
    expect(state.historyByDay[2]?.undoStack[0].snapshot.data.tornado?.get('2%')?.[0].id).toBe(
      'feature-2',
    );
  });

  test('reuses one history record per day', () => {
    const state = makeState({ 1: makeDay(1, 0), 2: makeDay(2, 5) }, 1);
    const firstCall = getOrCreateDayHistory(state, 1);

    expect(getOrCreateDayHistory(state, 1)).toBe(firstCall);
    expect(getOrCreateDayHistory(state, 2)).not.toBe(firstCall);
  });

  test('caps a history stack at 50 entries and drops the oldest', () => {
    const state = makeState({ 1: makeDay(1, 0) }, 1);
    const stacks = getOrCreateDayHistory(state, 1);

    for (let index = 0; index < 55; index += 1) {
      pushHistoryEntry(stacks.undoStack, makeSnapshot(1, `marker-${index}`));
    }

    expect(stacks.undoStack).toHaveLength(50);
    expect(stacks.undoStack[0].snapshot.data.tornado?.get('2%')?.[0].id).toBe('marker-5');
    expect(stacks.undoStack[49].snapshot.data.tornado?.get('2%')?.[0].id).toBe('marker-54');
  });

  test('clears only the edited day redo stack after a new edit', () => {
    const state = makeState({ 1: makeDay(1, 0), 2: makeDay(2, 5) }, 1);
    const dayOne = getOrCreateDayHistory(state, 1);
    const dayTwo = getOrCreateDayHistory(state, 2);
    dayOne.redoStack[0] = { day: 1, snapshot: makeSnapshot(1, 'redo-1') };
    dayTwo.redoStack[0] = { day: 2, snapshot: makeSnapshot(2, 'redo-2') };

    pushUndoSnapshot(state, 1);

    expect(state.historyByDay[1]?.undoStack).toHaveLength(1);
    expect(state.historyByDay[1]?.redoStack).toHaveLength(0);
    expect(state.historyByDay[2]?.redoStack).toHaveLength(1);
  });

  test('leaves state untouched when restoring from an empty stack', () => {
    const day = makeDay(1, 0);
    const state = makeState({ 1: day }, 1);
    const stacks = getOrCreateDayHistory(state, 1);
    const beforeData = day.data.tornado?.get('2%')?.[0].id;

    restoreHistoryEntry({
      sourceStack: stacks.undoStack,
      targetStack: stacks.redoStack,
      state,
      now: NOW,
      createEmptyDay: makeEmptyDay,
    });

    expect(stacks.undoStack).toHaveLength(0);
    expect(stacks.redoStack).toHaveLength(0);
    expect(state.forecastCycle.currentDay).toBe(1);
    expect(state.isSaved).toBe(true);
    expect(state.forecastCycle.days[1]?.data.tornado?.get('2%')?.[0].id).toBe(beforeData);
  });

  test('returns null and skips history when the day has no data', () => {
    const state = makeState({}, 1);

    expect(getCurrentDaySnapshot(state, 1)).toBeNull();

    pushUndoSnapshot(state, 1);
    expect(state.historyByDay[1]?.undoStack ?? []).toHaveLength(0);
  });

  test('creates the missing day when applying a snapshot', () => {
    const state = makeState({}, 2);
    const snapshot = getCurrentDaySnapshot(makeState({ 1: makeDay(1, 0) }, 1), 1);
    expect(snapshot).not.toBeNull();

    applyDaySnapshot(state, snapshot as ForecastDaySnapshot, NOW, makeEmptyDay);

    expect(state.forecastCycle.days[1]?.data.tornado?.get('2%')?.[0].id).toBe('feature-1');
    expect(state.forecastCycle.days[1]?.metadata.lastModified).toBe(NOW);
  });

  test('restores a snapshot even when the current day entry is missing', () => {
    const state = makeState({}, 1);
    const stored = makeSnapshot(2, 'stored-day-2');
    const source = [{ day: 2 as DayType, snapshot: stored }];
    const target: typeof source = [];

    restoreHistoryEntry({
      sourceStack: source,
      targetStack: target,
      state,
      now: NOW,
      createEmptyDay: makeEmptyDay,
    });

    expect(source).toHaveLength(0);
    expect(target).toHaveLength(0);
    expect(state.forecastCycle.currentDay).toBe(2);
    expect(state.isSaved).toBe(false);
    expect(state.forecastCycle.days[2]?.data.tornado?.get('2%')?.[0].id).toBe('stored-day-2');
  });

  test('clones opacities, custom layers, and low-probability lists without aliasing', () => {
    const day = makeDay(1, 0);
    day.metadata.lowProbabilityOutlooks = ['tornado'];
    const state = makeState({ 1: day }, 1);
    const snapshot = getCurrentDaySnapshot(state, 1);
    expect(snapshot).not.toBeNull();
    const snap = snapshot as ForecastDaySnapshot;

    expect(snap.outlookOpacities).not.toBe(day.metadata.outlookOpacities);
    expect(snap.outlookOpacities).toEqual({ tornado: 0.4 });
    expect(snap.customLayers).not.toBe(day.customLayers);
    expect(snap.customLayers).toEqual(day.customLayers);
    expect(snap.lowProbabilityOutlooks).not.toBe(day.metadata.lowProbabilityOutlooks);
    expect(snap.data.tornado).not.toBe(day.data.tornado);

    snap.outlookOpacities = { tornado: 0.9 };
    snap.lowProbabilityOutlooks.push('wind' as never);
    snap.customLayers?.layers[0].features.pop();
    snap.data.tornado?.get('2%')?.pop();

    expect(day.metadata.outlookOpacities).toEqual({ tornado: 0.4 });
    expect(day.metadata.lowProbabilityOutlooks).toEqual(['tornado']);
    expect(day.customLayers?.layers[0].features).toHaveLength(1);
    expect(day.data.tornado?.get('2%')).toHaveLength(1);
  });

  test('keeps stored snapshots separate from later live edits', () => {
    const live = makeDay(1, 0);
    const state = makeState({ 1: live }, 1);
    pushUndoSnapshot(state, 1);
    const stored = state.historyByDay[1]?.undoStack[0].snapshot as ForecastDaySnapshot;

    live.data.tornado?.get('2%')?.push(makeFeature('live-new', 7));
    live.metadata.outlookOpacities!.tornado = 0.1;
    live.metadata.lowProbabilityOutlooks = ['wind'];
    live.customLayers!.layers[0].features.pop();

    expect(stored.data.tornado?.get('2%')).toHaveLength(1);
    expect(stored.outlookOpacities).toEqual({ tornado: 0.4 });
    expect(stored.lowProbabilityOutlooks).toEqual([]);
    expect(stored.customLayers?.layers[0].features).toHaveLength(1);
  });

  test('restores a copy that leaves the stored snapshot alone', () => {
    const live = makeDay(1, 0);
    const state = makeState({ 1: live }, 1);
    pushUndoSnapshot(state, 1);
    const stacks = getOrCreateDayHistory(state, 1);
    const stored = stacks.undoStack[0].snapshot;

    live.data.tornado?.get('2%')?.push(makeFeature('live-new', 7));
    live.metadata.outlookOpacities!.tornado = 0.1;
    live.metadata.lowProbabilityOutlooks = ['wind'];
    live.customLayers!.layers[0].features.pop();

    restoreHistoryEntry({
      sourceStack: stacks.undoStack,
      targetStack: stacks.redoStack,
      state,
      now: NOW,
      createEmptyDay: makeEmptyDay,
    });

    const restored = state.forecastCycle.days[1] as OutlookDay;
    expect(restored.data.tornado?.get('2%')).toHaveLength(1);

    restored.data.tornado?.get('2%')?.pop();
    restored.metadata.lowProbabilityOutlooks?.push('hail' as never);
    restored.metadata.outlookOpacities!.tornado = 0.2;
    restored.customLayers!.layers[0].features.pop();

    expect(stored.data.tornado?.get('2%')).toHaveLength(1);
    expect(stored.lowProbabilityOutlooks).toEqual([]);
    expect(stored.outlookOpacities).toEqual({ tornado: 0.4 });
    expect(stored.customLayers?.layers[0].features).toHaveLength(1);
  });

  test('clears every per-day stack', () => {
    const state = makeState({ 1: makeDay(1, 0) }, 1);
    pushUndoSnapshot(state, 1);
    expect(state.historyByDay[1]?.undoStack).toHaveLength(1);

    clearHistory(state);

    expect(state.historyByDay).toEqual({});
  });
});

describe('forecast history reducer wiring', () => {
  const expectUndoResult = (undone: ForecastState) => {
    expect(undone.forecastCycle.days[1]?.data.tornado?.get('2%') ?? []).toHaveLength(0);
    expect(undone.historyByDay[1]?.undoStack).toHaveLength(0);
    expect(undone.historyByDay[1]?.redoStack).toHaveLength(1);
    expect(undone.historyByDay[1]?.redoStack[0].snapshot.data.tornado?.get('2%')?.[0].id).toBe(
      'wiring-1',
    );
    expect(undone.forecastCycle.currentDay).toBe(1);
    expect(undone.forecastCycle.days[1]?.metadata.lastModified).toBe(UNDO_NOW);
    expect(undone.isSaved).toBe(false);
  };

  const expectRedoResult = (redone: ForecastState) => {
    expect(redone.forecastCycle.days[1]?.data.tornado?.get('2%')?.[0].id).toBe('wiring-1');
    expect(redone.historyByDay[1]?.redoStack).toHaveLength(0);
    expect(redone.historyByDay[1]?.undoStack).toHaveLength(1);
    expect(redone.historyByDay[1]?.undoStack[0].snapshot.data.tornado?.get('2%') ?? []).toHaveLength(
      0,
    );
    expect(redone.forecastCycle.currentDay).toBe(1);
    expect(redone.forecastCycle.days[1]?.metadata.lastModified).toBe(REDO_NOW);
    expect(redone.isSaved).toBe(false);
  };

  test('undoLastEdit drains undo into redo and stamps the action timestamp', () => {
    const added = reducer(undefined, addFeature({ feature: makeFeature('wiring-1', 1) }));
    expect(added.historyByDay[1]?.undoStack).toHaveLength(1);
    expect(added.historyByDay[1]?.redoStack ?? []).toHaveLength(0);

    const undone = reducer(added, { ...undoLastEdit(), meta: { timestamp: UNDO_NOW } });

    expectUndoResult(undone);
  });

  test('redoLastEdit drains redo into undo and stamps the action timestamp', () => {
    const added = reducer(undefined, addFeature({ feature: makeFeature('wiring-1', 1) }));
    const undone = reducer(added, { ...undoLastEdit(), meta: { timestamp: UNDO_NOW } });
    expect(undone.historyByDay[1]?.redoStack).toHaveLength(1);

    const redone = reducer(undone, { ...redoLastEdit(), meta: { timestamp: REDO_NOW } });

    expectRedoResult(redone);
  });
});
