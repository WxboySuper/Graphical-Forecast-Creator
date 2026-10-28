import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { configureStore } from '@reduxjs/toolkit';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router';
import type { Feature, Polygon } from 'geojson';
import ForecastWorkflowPanel, {
  addWorkspaceToDiscussionPath,
  buildMonitorHandoffPath,
  findLatestWorkflowSavedCycle,
  getYesterdayLocalDate,
  resolveWorkflowWorkspaceId,
} from './ForecastWorkflowPanel';
import type { ForecastWorkspaceController } from '../ForecastWorkspace/useForecastWorkspaceController';
import forecastReducer, {
  addFeature,
  loadCycleHistory,
  saveCurrentCycle,
  setCycleDate,
  setForecastDay,
  setForecastWorkspace,
  completeCycle,
  startBlankCycle,
  updateDiscussion,
} from '../../store/forecastSlice';
import type { ForecastWorkspaceId } from '../../config/forecastWorkspaces';
import { getLocalCalendarDate } from '../../utils/localDate';
import * as fileUtils from '../../utils/fileUtils';

jest.mock('lucide-react', () => new Proxy({}, {
  get: () => (props: React.SVGProps<SVGSVGElement>) => <svg {...props} />,
}));

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

const createFeature = (id: string, offset: number, outlookType: string, probability: string): Feature => ({
  type: 'Feature',
  id,
  geometry: createPolygon(offset),
  properties: { outlookType, probability },
});

const createCompleteWorkflowStore = () => {
  const store = configureStore({
    reducer: { forecast: forecastReducer },
    middleware: (getDefaultMiddleware) => getDefaultMiddleware({ serializableCheck: false }),
  });
  store.dispatch(startBlankCycle({
    workflowTemplate: { id: 'severe-day1', label: 'Severe Convective Day 1', groupings: ['day1'] },
    cycleDate: '2026-08-12',
  }));
  store.dispatch(addFeature({ feature: createFeature('tornado-1', 0, 'tornado', '2%') }));
  store.dispatch(addFeature({ feature: createFeature('wind-1', 2, 'wind', '5%') }));
  store.dispatch(addFeature({ feature: createFeature('hail-1', 4, 'hail', '5%') }));
  store.dispatch(addFeature({ feature: createFeature('categorical-1', 6, 'categorical', 'SLGT') }));
  store.dispatch(updateDiscussion({
    day: 1,
    scopeId: 'day1',
    discussion: {
      mode: 'diy',
      validStart: '2026-08-12T12:00',
      validEnd: '2026-08-13T12:00',
      forecasterName: 'Test',
      diyContent: 'Severe storms are possible.',
      lastModified: '2026-08-12T12:00:00.000Z',
    },
  }));
  return store;
};

const renderPanel = (
  context: 'forecast' | 'discussion',
  controller?: ForecastWorkspaceController,
  initialEntry = '/',
) => {
  const store = createCompleteWorkflowStore();
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Provider store={store}>
        <ForecastWorkflowPanel context={context} controller={controller} />
      </Provider>
    </MemoryRouter>,
  );
};

describe('workflow panel workspace links', () => {
  test('adds workspace context to fallback and grouped discussion links', () => {
    expect(addWorkspaceToDiscussionPath('/discussion', 'custom')).toBe('/discussion?workspace=custom');
    expect(addWorkspaceToDiscussionPath('/discussion/day1?tab=notes#editor', 'custom'))
      .toBe('/discussion/day1?tab=notes&workspace=custom#editor');
  });

  test('preserves workspace context on Monitor handoffs', () => {
    expect(buildMonitorHandoffPath('custom', 'workflow-1')).toBe(
      '/monitor?workspace=custom&workflowId=workflow-1&sourceKind=current&sourceId=current',
    );
  });

  test('puts saved cycles with invalid timestamps after valid revisions', () => {
    type SavedCycle = Parameters<typeof findLatestWorkflowSavedCycle>[0][number];
    const invalid = {
      id: 'invalid',
      timestamp: 'bad-date',
      workflowMetadata: { id: 'workflow-1', updatedAt: 'bad-date' },
    } as unknown as SavedCycle;
    const valid = {
      id: 'valid',
      timestamp: '2026-10-01T00:00:00.000Z',
      workflowMetadata: { id: 'workflow-1', updatedAt: '2026-10-01T00:00:00.000Z' },
    } as unknown as SavedCycle;
    expect(findLatestWorkflowSavedCycle([invalid, valid], 'workflow-1')?.id).toBe('valid');
    expect(findLatestWorkflowSavedCycle([invalid], 'workflow-1')?.id).toBe('invalid');
  });

  test('prefers an exposed route workspace over stale Redux workspace state', () => {
    expect(resolveWorkflowWorkspaceId('/discussion', '?workspace=custom', 'severe')).toBe('custom');
    expect(resolveWorkflowWorkspaceId('/monitor', '?workspace=custom', 'severe')).toBe('custom');
    expect(resolveWorkflowWorkspaceId('/discussion', '?workspace=unknown', 'severe')).toBe('severe');
    expect(resolveWorkflowWorkspaceId('/discussion', '', 'invalid' as ForecastWorkspaceId)).toBe('severe');
  });

  test('hides workflow data until Redux matches the route workspace', () => {
    renderPanel('discussion', undefined, '/discussion?workspace=custom');

    expect(screen.queryByRole('region', { name: 'Forecast package workflow' })).not.toBeInTheDocument();
  });
});

const anyPreviousOutlookButtonName = /^Use .* Day 2$/;
const formatCycleLabel = (cycleDate: string): string =>
  new Date(`${cycleDate}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
const previousOutlookButtonName = (cycleDate: string): RegExp =>
  new RegExp(`^Use ${formatCycleLabel(cycleDate)} Day 2$`);

const withFrozenWorkflowDate = (run: () => void) => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date(2026, 7, 13, 12));
  try {
    run();
  } finally {
    jest.useRealTimers();
  }
};

const renderPanelWithMixedWorkspaceHistory = (
  activeWorkspace: ForecastWorkspaceId,
  cycleDate: string,
) => {
  const store = createCompleteWorkflowStore();
  const otherWorkspace: ForecastWorkspaceId = activeWorkspace === 'custom' ? 'severe' : 'custom';
  // The active workspace saves first, so the newest cycle belongs to the other
  // workspace and an unfiltered selector picks the wrong source either way.
  ([activeWorkspace, otherWorkspace] as const).forEach((sourceWorkspace) => {
    store.dispatch(setForecastWorkspace(sourceWorkspace));
    store.dispatch(setForecastDay(2));
    store.dispatch(addFeature({
      feature: createFeature(`${sourceWorkspace}-source`, sourceWorkspace === 'custom' ? 0 : 2, 'tornado', '2%'),
    }));
    store.dispatch(setCycleDate(cycleDate));
    store.dispatch(saveCurrentCycle({ label: `${sourceWorkspace} source` }));
  });
  store.dispatch(setForecastWorkspace(activeWorkspace));
  store.dispatch(startBlankCycle({
    workflowTemplate: { id: 'severe-day1', label: 'Severe Convective Day 1', groupings: ['day1'] },
    cycleDate: '2026-08-12',
  }));
  store.dispatch(setForecastDay(1));

  render(
    <MemoryRouter>
      <Provider store={store}>
        <ForecastWorkflowPanel context="forecast" />
      </Provider>
    </MemoryRouter>,
  );
  return store;
};

const renderPanelWithLegacyWorkspaceHistory = (
  activeWorkspace: ForecastWorkspaceId,
  legacyKind: 'missing' | 'malformed',
  cycleDate: string,
) => {
  const store = createCompleteWorkflowStore();
  store.dispatch(setForecastWorkspace('severe'));
  store.dispatch(setForecastDay(2));
  store.dispatch(addFeature({
    feature: createFeature('legacy-source', 2, 'tornado', '2%'),
  }));
  store.dispatch(setCycleDate(cycleDate));
  store.dispatch(saveCurrentCycle({ label: 'legacy source' }));

  const [saved] = store.getState().forecast.savedCycles.slice(-1);
  const legacyCycle = { ...saved! };
  if (legacyKind === 'missing') {
    delete legacyCycle.workspaceId;
  } else {
    legacyCycle.workspaceId = 'not-a-workspace' as never;
  }
  store.dispatch(loadCycleHistory([legacyCycle as never]));

  store.dispatch(setForecastWorkspace(activeWorkspace));
  store.dispatch(startBlankCycle({
    workflowTemplate: { id: 'severe-day1', label: 'Severe Convective Day 1', groupings: ['day1'] },
    cycleDate: '2026-08-12',
  }));
  store.dispatch(setForecastDay(1));

  render(
    <MemoryRouter>
      <Provider store={store}>
        <ForecastWorkflowPanel context="forecast" />
      </Provider>
    </MemoryRouter>,
  );
  return store;
};

interface SeededPreviousOutlook {
  sourceWorkspace: ForecastWorkspaceId;
  activeWorkspace?: ForecastWorkspaceId;
  sourceFeatureId: string;
  sourceLabel: string;
}

/**
 * Seeds exactly one saved cycle in `sourceWorkspace`, then opens a blank cycle in
 * `activeWorkspace`. Unlike the mixed-history helper this can produce a state
 * where the active workspace has no candidate at all, which is the case the
 * suggestion gating has to get right.
 */
const renderPanelWithSeededPreviousOutlook = ({
  sourceWorkspace,
  activeWorkspace = 'severe',
  sourceFeatureId,
  sourceLabel,
}: SeededPreviousOutlook): void => {
  const store = createCompleteWorkflowStore();
  store.dispatch(setForecastWorkspace(sourceWorkspace));
  store.dispatch(setForecastDay(2));
  store.dispatch(addFeature({ feature: createFeature(sourceFeatureId, 0, 'tornado', '2%') }));
  store.dispatch(setCycleDate(getYesterdayLocalDate()));
  store.dispatch(saveCurrentCycle({ label: sourceLabel }));
  store.dispatch(setForecastWorkspace(activeWorkspace));
  store.dispatch(setForecastDay(1));
  store.dispatch(startBlankCycle({
    workflowTemplate: { id: 'severe-day1', label: 'Severe Convective Day 1', groupings: ['day1'] },
    cycleDate: '2026-08-12',
  }));
  store.dispatch(setForecastDay(1));

  render(
    <MemoryRouter>
      <Provider store={store}>
        <ForecastWorkflowPanel context="forecast" />
      </Provider>
    </MemoryRouter>,
  );
};

describe('ForecastWorkflowPanel completion review', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('reports workflow and cycle export failures and restores the export button', async () => {
    const downloadPackage = jest.spyOn(fileUtils, 'downloadGfcPackage');
    downloadPackage.mockRejectedValueOnce(new Error('workflow package failed'));
    const workflowRender = renderPanel('forecast');

    fireEvent.click(screen.getByRole('button', { name: 'Export' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Unable to export the workflow package.');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Export' })).toBeEnabled());
    workflowRender.unmount();

    localStorage.clear();
    downloadPackage.mockRejectedValueOnce(new Error('cycle package failed'));
    const store = createCompleteWorkflowStore();
    store.dispatch(completeCycle());
    render(
      <MemoryRouter>
        <Provider store={store}>
          <ForecastWorkflowPanel context="forecast" />
        </Provider>
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Export complete cycle' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Unable to export the forecast cycle.');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Export complete cycle' })).toBeEnabled());
    downloadPackage.mockRestore();
  });
  it('shows Review Package on the Forecast page once the package is complete', () => {
    const onOpenCompletionModal = jest.fn();
    const controller = { onOpenCompletionModal } as unknown as ForecastWorkspaceController;

    renderPanel('forecast', controller);

    fireEvent.click(screen.getByRole('button', { name: 'Review Package' }));
    expect(onOpenCompletionModal).toHaveBeenCalledTimes(1);
  });

  it('closes the Discussion-page review modal when Cancel is clicked', async () => {
    renderPanel('discussion');

    fireEvent.click(screen.getByRole('button', { name: 'Review Package' }));
    expect(await screen.findByText('Ready for export')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByText('Ready for export')).not.toBeInTheDocument());
  });

  it.each([
    ['selects Custom history when Custom is active', 'custom'],
    ['selects Severe history when Severe is active', 'severe'],
  ] as const)('%s', (_caseName, activeWorkspace) => {
    withFrozenWorkflowDate(() => {
      const yesterdayCycleDate = getYesterdayLocalDate();
      const store = renderPanelWithMixedWorkspaceHistory(activeWorkspace, yesterdayCycleDate);
      const otherWorkspace: ForecastWorkspaceId = activeWorkspace === 'custom' ? 'severe' : 'custom';
      expect(screen.getByText(/Day 1 package/)).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: previousOutlookButtonName(yesterdayCycleDate) }));

      const importedFeatureIds = store.getState().forecast.forecastCycle.days[1]?.data.tornado?.get('2%')
        ?.map((feature) => feature.id);
      expect(importedFeatureIds).toContain(`${activeWorkspace}-source`);
      expect(importedFeatureIds).not.toContain(`${otherWorkspace}-source`);

      const { forecastCycle } = store.getState().forecast;
      expect(forecastCycle.cycleDate).toBe(getLocalCalendarDate());
      expect(forecastCycle.currentDay).toBe(1);
    });
  });

  it('suggests nothing when yesterday\'s cycle in the active workspace has no package work', () => {
    withFrozenWorkflowDate(() => {
      const yesterdayCycleDate = getYesterdayLocalDate();
      const store = createCompleteWorkflowStore();
      store.dispatch(setForecastDay(2));
      store.dispatch(setCycleDate(yesterdayCycleDate));
      store.dispatch(saveCurrentCycle({ label: 'no package work' }));
      store.dispatch(startBlankCycle({
        workflowTemplate: { id: 'severe-day1', label: 'Severe Convective Day 1', groupings: ['day1'] },
        cycleDate: '2026-08-12',
      }));

      render(
        <MemoryRouter>
          <Provider store={store}>
            <ForecastWorkflowPanel context="forecast" />
          </Provider>
        </MemoryRouter>,
      );

      expect(screen.getByText(/Day 1 package/)).toBeInTheDocument();
      expect(store.getState().forecast.savedCycles).toHaveLength(1);
      expect(store.getState().forecast.savedCycles[0]).toMatchObject({
        cycleDate: yesterdayCycleDate,
        workspaceId: 'severe',
      });
      expect(screen.queryByRole('button', { name: anyPreviousOutlookButtonName })).not.toBeInTheDocument();
    });
  });

  it.each([
    ['missing workspaceId stays in Severe', 'missing', 'severe', true],
    ['missing workspaceId stays out of Custom', 'missing', 'custom', false],
    ['malformed workspaceId stays in Severe', 'malformed', 'severe', true],
    ['malformed workspaceId stays out of Custom', 'malformed', 'custom', false],
  ] as const)('%s', (_caseName, legacyKind, activeWorkspace, shouldSuggest) => {
    withFrozenWorkflowDate(() => {
      const yesterdayCycleDate = getYesterdayLocalDate();
      const store = renderPanelWithLegacyWorkspaceHistory(activeWorkspace, legacyKind, yesterdayCycleDate);
      expect(screen.getByText(/Day 1 package/)).toBeInTheDocument();
      expect(store.getState().forecast.savedCycles[0]?.workspaceId).toBe('severe');

      const previousOutlookButton = screen.queryByRole('button', {
        name: previousOutlookButtonName(yesterdayCycleDate),
      });
      if (shouldSuggest) {
        expect(previousOutlookButton).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: previousOutlookButtonName(yesterdayCycleDate) }));

        const importedFeatureIds = store.getState().forecast.forecastCycle.days[1]?.data.tornado?.get('2%')
          ?.map((feature) => feature.id);
        expect(importedFeatureIds).toContain('legacy-source');
      } else {
        expect(previousOutlookButton).not.toBeInTheDocument();
      }
    });
  });

  it.each([
    ['hides Custom history from Severe', 'custom', 'severe', false],
    ['keeps Custom history visible in Custom', 'custom', 'custom', true],
    ['keeps Severe history visible in Severe', 'severe', 'severe', true],
    ['hides Severe history from Custom', 'severe', 'custom', false],
  ] as const)('%s', (_caseName, sourceWorkspace, activeWorkspace, shouldSuggest) => {
    renderPanelWithSeededPreviousOutlook({
      sourceWorkspace,
      activeWorkspace,
      sourceFeatureId: `${sourceWorkspace}-source`,
      sourceLabel: `${sourceWorkspace === 'custom' ? 'Custom' : 'Severe'} source`,
    });

    expect(screen.getByText(/Day 1 package/)).toBeInTheDocument();
    const previousOutlookButton = screen.queryByRole('button', { name: anyPreviousOutlookButtonName });
    if (shouldSuggest) {
      expect(previousOutlookButton).toBeInTheDocument();
    } else {
      expect(previousOutlookButton).not.toBeInTheDocument();
    }
  });
});

describe('getYesterdayLocalDate', () => {
  it('uses the previous local calendar date across a month boundary', () => {
    expect(getYesterdayLocalDate(new Date(2026, 0, 1, 12))).toBe('2025-12-31');
  });

  it('keeps the local calendar date across the spring DST transition', () => {
    expect(getYesterdayLocalDate(new Date(2026, 2, 9, 12))).toBe('2026-03-08');
  });
});
