import type { Feature, Polygon } from 'geojson';
import { produce } from 'immer';
import reducer, {
  addFeature,
  markAsSaved,
  startBlankCycle,
} from './forecastSlice';
import { applyCreateOutlookUpdate } from './forecastVersioning';
import type { WorkflowMetadata } from '../types/workflow';

const seamWorkflowTemplate: WorkflowMetadata = {
  id: 'severe-day1',
  label: 'Severe Convective Day 1',
  groupings: ['day1'],
};

const seamNow = '2026-07-04T13:00:00.000Z';

const createSeamPolygon = (offset: number): Polygon => ({
  type: 'Polygon',
  coordinates: [[
    [offset, offset],
    [offset + 1, offset],
    [offset + 1, offset + 1],
    [offset, offset + 1],
    [offset, offset],
  ]],
});

const createSeamFeature = (id: string, offset: number): Feature => ({
  type: 'Feature',
  id,
  geometry: createSeamPolygon(offset),
  properties: {
    outlookType: 'tornado',
    probability: '2%',
    isSignificant: false,
  },
});

type SeamState = ReturnType<typeof reducer>;

const startPopulatedCycle = (): SeamState => {
  let state = reducer(undefined, startBlankCycle({
    workflowTemplate: seamWorkflowTemplate,
    cycleDate: '2026-07-04',
  }));
  state = reducer(state, addFeature({ feature: createSeamFeature('day-1-feature', 0) }));
  return reducer(state, markAsSaved());
};

const withAcknowledgement = (state: SeamState): SeamState =>
  produce(state, (draft) => {
    draft.forecastCycle.completionAcknowledgedAt = '2026-07-04T12:00:00.000Z';
  });

const runSeamUpdate = (state: SeamState, now: string): SeamState =>
  produce(state, (draft) => {
    applyCreateOutlookUpdate(draft, now);
  });

describe('applyCreateOutlookUpdate seam', () => {
  it('transitions version, status, and timestamps', () => {
    const next = runSeamUpdate(withAcknowledgement(startPopulatedCycle()), seamNow);

    expect(next.workflowMetadata?.outlookVersions).toHaveLength(2);
    expect(next.workflowMetadata?.outlookVersions[0].status).toBe('completed');
    expect(next.workflowMetadata?.outlookVersions[1]).toMatchObject({
      version: 2,
      status: 'in-progress',
      derivedFrom: 1,
      createdAt: seamNow,
    });
    expect(next.workflowMetadata?.status).toBe('in-progress');
    expect(next.forecastCycle.updateInProgressVersion).toBe(2);
    expect(next.isSaved).toBe(false);
  });

  it('clones the snapshot with isolation from live state', () => {
    const next = runSeamUpdate(withAcknowledgement(startPopulatedCycle()), seamNow);
    const liveFeature = next.forecastCycle.days[1]?.data.tornado?.get('2%')?.[0];
    const snapshotFeature = next.outlookVersionSnapshots[0]?.days[1]?.data.tornado?.get('2%')?.[0];

    expect(next.outlookVersionSnapshots).toHaveLength(1);
    expect(next.outlookVersionSnapshots[0]).toMatchObject({ version: 1, createdAt: seamNow });
    expect(snapshotFeature?.id).toBe('day-1-feature');
    expect(snapshotFeature).not.toBe(liveFeature);
    expect(snapshotFeature).toEqual(liveFeature);
  });

  it('invalidates completion acknowledgement', () => {
    const next = runSeamUpdate(withAcknowledgement(startPopulatedCycle()), seamNow);

    expect(next.forecastCycle.completionAcknowledgedAt).toBeUndefined();
    expect(next.completionValidation.lastResult).toBeNull();
  });

  it('advances without workflow metadata', () => {
    const base = reducer(undefined, startBlankCycle({}));
    expect(base.workflowMetadata).toBeUndefined();

    const next = runSeamUpdate(base, seamNow);

    expect(next.workflowMetadata).toBeUndefined();
    expect(next.forecastCycle.updateInProgressVersion).toBe(1);
    expect(next.isSaved).toBe(false);
    expect(next.outlookVersionSnapshots).toHaveLength(1);
    expect(next.outlookVersionSnapshots[0]).toMatchObject({ version: 0, createdAt: seamNow });
  });

  it('skips the snapshot when no day is populated', () => {
    const base = reducer(undefined, startBlankCycle({
      workflowTemplate: seamWorkflowTemplate,
      cycleDate: '2026-07-04',
    }));
    const emptied = produce(base, (draft) => {
      draft.forecastCycle.days = {};
    });

    const next = runSeamUpdate(emptied, seamNow);

    expect(next.outlookVersionSnapshots).toHaveLength(0);
    expect(next.workflowMetadata?.outlookVersions).toHaveLength(2);
    expect(next.workflowMetadata?.outlookVersions[1]).toMatchObject({
      version: 2,
      status: 'in-progress',
      derivedFrom: 1,
      createdAt: seamNow,
    });
    expect(next.forecastCycle.updateInProgressVersion).toBe(2);
    expect(next.isSaved).toBe(false);
  });
});
