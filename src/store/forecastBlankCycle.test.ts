import { createInitialForecastState } from './forecastInitialState';
import { startBlankForecastCycle } from './forecastBlankCycle';
import type { WorkflowMetadata } from '../types/workflow';

describe('startBlankForecastCycle', () => {
  const timestamp = '2026-07-04T12:00:00.000Z';

  it('starts on day 3 for a day 3 workflow', () => {
    const state = createInitialForecastState();

    startBlankForecastCycle(state, {
      workflowTemplate: { id: 'day3', label: 'Day 3', groupings: ['day3'] },
      cycleDate: '2026-07-04',
      today: '2026-07-05',
      timestamp,
    });

    expect(state.forecastCycle.currentDay).toBe(3);
    expect(state.forecastCycle.days[3]?.day).toBe(3);
    expect(state.forecastCycle.days[1]).toBeUndefined();
  });

  it.each([
    { grouping: 'day2', day: 2 },
    { grouping: 'day4-8', day: 4 },
  ] as const)('starts on day $day for the $grouping grouping', ({ grouping, day }) => {
    const state = createInitialForecastState();

    startBlankForecastCycle(state, {
      workflowTemplate: { id: grouping, label: grouping, groupings: [grouping] },
      cycleDate: '2026-07-04',
      today: '2026-07-05',
      timestamp,
    });

    expect(state.forecastCycle.currentDay).toBe(day);
    expect(state.forecastCycle.days[day]?.day).toBe(day);
    expect(Object.keys(state.forecastCycle.days)).toEqual([String(day)]);
  });

  it('creates workflow metadata for the selected template and cycle date', () => {
    const state = createInitialForecastState();
    const workflowTemplate: WorkflowMetadata = { id: 'day3', label: 'Day 3', groupings: ['day3'] };

    startBlankForecastCycle(state, {
      workflowTemplate,
      cycleDate: '2026-07-04',
      today: '2026-07-05',
      timestamp,
    });

    expect(state.workflowTemplate).toBe(workflowTemplate);
    expect(state.workflowMetadata).toEqual({
      id: 'WF-day3-2026-07-04',
      workflowId: 'day3',
      cycleDate: '2026-07-04',
      status: 'in-progress',
      outlookVersions: [{ version: 1, status: 'in-progress', createdAt: timestamp }],
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    expect(state.isWorkflowActive).toBe(true);
  });

  it('clears history, discussion drafts, saved state, and version snapshots', () => {
    const state = createInitialForecastState();
    const history = { undoStack: [], redoStack: [] };
    state.historyByDay[1] = history;
    state.discussionDraftsByScope = { day1: { mode: 'diy', diyContent: 'Draft' } };
    state.isSaved = true;
    state.outlookVersionSnapshots = [{ version: 1, days: {}, createdAt: timestamp }];

    startBlankForecastCycle(state, { today: '2026-07-05', timestamp });

    expect(state.historyByDay).toEqual({});
    expect(state.discussionDraftsByScope).toEqual({});
    expect(state.isSaved).toBe(false);
    expect(state.outlookVersionSnapshots).toEqual([]);
  });

  it('uses today when no cycle date is provided', () => {
    const state = createInitialForecastState();

    startBlankForecastCycle(state, {
      today: '2026-07-05',
      timestamp,
    });

    expect(state.forecastCycle.cycleDate).toBe('2026-07-05');
  });

  it('falls back to day 1 when the template has no groupings', () => {
    const state = createInitialForecastState();

    startBlankForecastCycle(state, {
      workflowTemplate: { id: 'empty', label: 'Empty workflow', groupings: [] },
      cycleDate: '2026-07-04',
      today: '2026-07-05',
      timestamp,
    });

    expect(state.forecastCycle.currentDay).toBe(1);
    expect(state.forecastCycle.days[1]?.day).toBe(1);
    expect(state.forecastCycle.days[3]).toBeUndefined();
  });
});
