import type { Feature, Polygon } from 'geojson';
import { produce } from 'immer';
import reducer, {
  addFeature,
  markAsSaved,
  startBlankCycle,
} from './forecastSlice';
import { applyCreateOutlookUpdate } from './forecastVersioning';
import type { WorkflowMetadata } from '../types/workflow';
import { CUSTOM_PRODUCTS_SCHEMA_VERSION, type CustomLayerCollection } from '../types/customProducts';
import { asCustomLayerId } from '../lib/customProducts';

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

const createCustomLayersFixture = (): CustomLayerCollection => ({
  schemaVersion: CUSTOM_PRODUCTS_SCHEMA_VERSION,
  layers: [
    {
      schemaVersion: CUSTOM_PRODUCTS_SCHEMA_VERSION,
      id: asCustomLayerId('seam-custom-layer'),
      label: 'Seam custom',
      order: 0,
      categories: [
        {
          id: 'seam-category' as never,
          label: 'Seam category',
          order: 0,
          style: {
            fillColor: '#22c55e',
            fillOpacity: 0.5,
            strokeColor: '#111827',
            strokeOpacity: 1,
            strokeWidth: 2,
            hatch: 'none',
          },
        },
      ],
      features: [],
      createdAt: '2026-07-04T12:00:00.000Z',
      updatedAt: '2026-07-04T12:00:00.000Z',
    },
  ],
});

const withCustomLayers = (state: SeamState, customLayers: CustomLayerCollection): SeamState =>
  produce(state, (draft) => {
    draft.forecastCycle.days[1]!.customLayers = customLayers;
  });

const getLiveCustomLayers = (state: SeamState): CustomLayerCollection =>
  state.forecastCycle.days[1]!.customLayers!;

const getSnapshotCustomLayers = (state: SeamState): CustomLayerCollection =>
  state.outlookVersionSnapshots[0]!.days[1]!.customLayers!;

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

  it('stores snapshot content and metadata', () => {
    const next = runSeamUpdate(withAcknowledgement(startPopulatedCycle()), seamNow);
    const snapshot = next.outlookVersionSnapshots[0] as NonNullable<typeof next.outlookVersionSnapshots[0]>;
    const snapshotDay = snapshot.days[1] as NonNullable<ReturnType<typeof startPopulatedCycle>['forecastCycle']['days'][1]>;
    const snapshotFeatures = snapshotDay.data.tornado as NonNullable<typeof snapshotDay.data.tornado>;
    const snapshotFeature = (snapshotFeatures.get('2%') as NonNullable<ReturnType<typeof snapshotFeatures.get>>)[0] as Feature;

    expect(next.outlookVersionSnapshots).toHaveLength(1);
    expect(snapshot).toMatchObject({ version: 1, createdAt: seamNow });
    expect(snapshotFeature.id).toBe('day-1-feature');
  });

  it('isolates snapshot from live state', () => {
    const next = runSeamUpdate(withAcknowledgement(startPopulatedCycle()), seamNow);
    const liveDay = next.forecastCycle.days[1] as NonNullable<ReturnType<typeof startPopulatedCycle>['forecastCycle']['days'][1]>;
    const liveFeatures = liveDay.data.tornado as NonNullable<typeof liveDay.data.tornado>;
    const liveFeature = (liveFeatures.get('2%') as NonNullable<ReturnType<typeof liveFeatures.get>>)[0] as Feature;
    const snapshotDay = next.outlookVersionSnapshots[0] as NonNullable<typeof next.outlookVersionSnapshots[0]>;
    const snapshotDayData = snapshotDay.days[1] as NonNullable<typeof snapshotDay.days[1]>;
    const snapshotFeatures = snapshotDayData.data.tornado as NonNullable<typeof snapshotDayData.data.tornado>;
    const snapshotFeature = (snapshotFeatures.get('2%') as NonNullable<ReturnType<typeof snapshotFeatures.get>>)[0] as Feature;

    expect(snapshotFeature).not.toBe(liveFeature);
    expect(snapshotFeature).toEqual(liveFeature);
  });

  it('clones customLayers into snapshots', () => {
    const customLayers = createCustomLayersFixture();
    const base = withCustomLayers(withAcknowledgement(startPopulatedCycle()), customLayers);
    const next = runSeamUpdate(base, seamNow);
    const live = getLiveCustomLayers(next);
    const snapshot = getSnapshotCustomLayers(next);

    expect(snapshot).toEqual(live);
    expect(snapshot).not.toBe(live);
    expect(snapshot.layers).toEqual(live.layers);
    expect(snapshot.layers).not.toBe(live.layers);
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
