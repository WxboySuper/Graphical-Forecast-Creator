import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { configureStore } from '@reduxjs/toolkit';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router';
import type { Feature, Polygon } from 'geojson';
import ForecastWorkflowPanel, { addWorkspaceToDiscussionPath, getYesterdayLocalDate, resolveWorkflowWorkspaceId } from './ForecastWorkflowPanel';
import type { ForecastWorkspaceController } from '../ForecastWorkspace/useForecastWorkspaceController';
import forecastReducer, {
  addFeature,
  loadCycleHistory,
  saveCurrentCycle,
  setCycleDate,
  setForecastDay,
  setForecastWorkspace,
  startBlankCycle,
  updateDiscussion,
} from '../../store/forecastSlice';
import type { ForecastWorkspaceId } from '../../config/forecastWorkspaces';
import { getLocalCalendarDate } from '../../utils/localDate';

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

const renderPanel = (context: 'forecast' | 'discussion', controller?: ForecastWorkspaceController) => {
  const store = createCompleteWorkflowStore();
  render(
    <MemoryRouter>
      <Provider store={store}>
        <ForecastWorkflowPanel context={context} controller={controller} />
      </Provider>
    </MemoryRouter>,
  );
};

describe('workspace-aware workflow routes', () => {
  it('uses the forecast route workspace instead of a stale Redux selection', () => {
    expect(resolveWorkflowWorkspaceId('/forecast/custom', '', 'severe')).toBe('custom');
  });

  it('resolves exposed discussion workspace hints and validates Redux fallback', () => {
    expect(resolveWorkflowWorkspaceId('/discussion', '?group=day1&workspace=custom', 'severe')).toBe('custom');
    expect(resolveWorkflowWorkspaceId('/discussion/', '?workspace=custom', 'severe')).toBe('custom');
    expect(resolveWorkflowWorkspaceId('/discussion/thread/1', '?workspace=custom', 'severe')).toBe('custom');
    expect(resolveWorkflowWorkspaceId('/discussion', '?workspace=unknown', 'custom')).toBe('custom');
    expect(resolveWorkflowWorkspaceId('/discussion', '', 'invalid')).toBe('severe');
  });

  it('adds workspace identity without dropping discussion grouping', () => {
    expect(addWorkspaceToDiscussionPath('/discussion?group=day1', 'custom'))
      .toBe('/discussion?group=day1&workspace=custom');
  });
});

const anyPreviousOutlookButtonName = /^Use .* Day 2$/;
const previousOutlookButtonName = ({ cycleDate }: { cycleDate: string }): RegExp => {
  const label = new Date(cycleDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return new RegExp('^Use ' + label + ' Day 2$');
};

const withFrozenWorkflowDate = (run: () => void) => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date(2026, 7, 13, 12));
  try {
    run();
  } finally {
    jest.useRealTimers();
  }
};

const renderPanelWithMixedWorkspaceHistory = ({
  activeWorkspace,
  cycleDate,
}: {
  activeWorkspace: ForecastWorkspaceId;
  cycleDate: string;
}) => {
  const store = createCompleteWorkflowStore();
  const otherWorkspace: ForecastWorkspaceId = activeWorkspace === 'custom' ? 'severe' : 'custom';
  // Save the active workspace first so the newest history entry belongs to the other workspace.
  ([activeWorkspace, otherWorkspace] as const).forEach((sourceWorkspace) => {
    store.dispatch(setForecastWorkspace(sourceWorkspace));
    store.dispatch(setForecastDay(2));
    store.dispatch(addFeature({
      feature: createFeature(sourceWorkspace + '-source', sourceWorkspace === 'custom' ? 0 : 2, 'tornado', '2%'),
    }));
    store.dispatch(setCycleDate(cycleDate));
    store.dispatch(saveCurrentCycle({ label: sourceWorkspace + ' source' }));
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

const renderPanelWithLegacyWorkspaceHistory = ({
  activeWorkspace,
  legacyKind,
  cycleDate,
}: {
  activeWorkspace: ForecastWorkspaceId;
  legacyKind: 'missing' | 'malformed';
  cycleDate: string;
}) => {
  const store = createCompleteWorkflowStore();
  store.dispatch(setForecastWorkspace('severe'));
  store.dispatch(setForecastDay(2));
  store.dispatch(addFeature({ feature: createFeature('legacy-source', 2, 'tornado', '2%') }));
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

const mixedWorkspaceCases = [
  { title: 'selects Custom history when Custom is active', activeWorkspace: 'custom' },
  { title: 'selects Severe history when Severe is active', activeWorkspace: 'severe' },
] as const;

const legacyWorkspaceCases: Array<{
  title: string;
  legacyKind: 'missing' | 'malformed';
  activeWorkspace: ForecastWorkspaceId;
  shouldSuggest: boolean;
}> = [
  { title: 'missing workspaceId stays in Severe', legacyKind: 'missing', activeWorkspace: 'severe', shouldSuggest: true },
  { title: 'missing workspaceId stays out of Custom', legacyKind: 'missing', activeWorkspace: 'custom', shouldSuggest: false },
  { title: 'malformed workspaceId stays in Severe', legacyKind: 'malformed', activeWorkspace: 'severe', shouldSuggest: true },
  { title: 'malformed workspaceId stays out of Custom', legacyKind: 'malformed', activeWorkspace: 'custom', shouldSuggest: false },
];


describe('ForecastWorkflowPanel completion review', () => {
  beforeEach(() => {
    localStorage.clear();
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
  it.each(mixedWorkspaceCases)('$title', ({ activeWorkspace }) => {
    withFrozenWorkflowDate(() => {
      const yesterdayCycleDate = getYesterdayLocalDate();
      const store = renderPanelWithMixedWorkspaceHistory({ activeWorkspace, cycleDate: yesterdayCycleDate });
      const otherWorkspace: ForecastWorkspaceId = activeWorkspace === 'custom' ? 'severe' : 'custom';
      expect(screen.getByText(/Day 1 package/)).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: previousOutlookButtonName({ cycleDate: yesterdayCycleDate }) }));

      const importedFeatureIds = store.getState().forecast.forecastCycle.days[1]?.data.tornado?.get('2%')
        ?.map((feature) => feature.id);
      expect(importedFeatureIds).toContain(activeWorkspace + '-source');
      expect(importedFeatureIds).not.toContain(otherWorkspace + '-source');

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

  it.each(legacyWorkspaceCases)('$title', ({ activeWorkspace, legacyKind, shouldSuggest }) => {
    withFrozenWorkflowDate(() => {
      const yesterdayCycleDate = getYesterdayLocalDate();
      const store = renderPanelWithLegacyWorkspaceHistory({
        activeWorkspace,
        legacyKind,
        cycleDate: yesterdayCycleDate,
      });
      expect(screen.getByText(/Day 1 package/)).toBeInTheDocument();
      expect(store.getState().forecast.savedCycles[0]?.workspaceId).toBe('severe');

      const previousOutlookButton = screen.queryByRole('button', {
        name: previousOutlookButtonName({ cycleDate: yesterdayCycleDate }),
      });
      if (shouldSuggest) {
        expect(previousOutlookButton).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', {
          name: previousOutlookButtonName({ cycleDate: yesterdayCycleDate }),
        }));

        const importedFeatureIds = store.getState().forecast.forecastCycle.days[1]?.data.tornado?.get('2%')
          ?.map((feature) => feature.id);
        expect(importedFeatureIds).toContain('legacy-source');
      } else {
        expect(previousOutlookButton).not.toBeInTheDocument();
      }
    });
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
