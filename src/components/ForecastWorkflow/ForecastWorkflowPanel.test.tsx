import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { configureStore } from '@reduxjs/toolkit';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router';
import type { Feature, Polygon } from 'geojson';
import ForecastWorkflowPanel, { getYesterdayLocalDate } from './ForecastWorkflowPanel';
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

const previousOutlookButtonName = /^Use [A-Z][a-z]{2} \d{1,2} Day 2$/;

const renderPanelWithMixedWorkspaceHistory = (activeWorkspace: ForecastWorkspaceId) => {
  const store = createCompleteWorkflowStore();
  const sourceCycleDate = getYesterdayLocalDate();
  (['custom', 'severe'] as const).forEach((sourceWorkspace) => {
    store.dispatch(setForecastWorkspace(sourceWorkspace));
    store.dispatch(setForecastDay(2));
    store.dispatch(addFeature({
      feature: createFeature(`${sourceWorkspace}-source`, sourceWorkspace === 'custom' ? 0 : 2, 'tornado', '2%'),
    }));
    store.dispatch(setCycleDate(sourceCycleDate));
    store.dispatch(saveCurrentCycle({ label: `${sourceWorkspace} source` }));
  });
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
  return store;
};

const renderPanelWithLegacyWorkspaceHistory = (
  activeWorkspace: ForecastWorkspaceId,
  legacyKind: 'missing' | 'malformed',
) => {
  const store = createCompleteWorkflowStore();
  store.dispatch(setForecastWorkspace('severe'));
  store.dispatch(setForecastDay(2));
  store.dispatch(addFeature({
    feature: createFeature('legacy-source', 2, 'tornado', '2%'),
  }));
  store.dispatch(setCycleDate(getYesterdayLocalDate()));
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
    const store = renderPanelWithMixedWorkspaceHistory(activeWorkspace);
    expect(screen.getByText(/Day 1 package/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: previousOutlookButtonName }));

    const importedFeatureIds = store.getState().forecast.forecastCycle.days[1]?.data.tornado?.get('2%')
      ?.map((feature) => feature.id);
    expect(importedFeatureIds).toContain(`${activeWorkspace}-source`);
    expect(importedFeatureIds).not.toContain(`${activeWorkspace === 'custom' ? 'severe' : 'custom'}-source`);
  });

  it.each([
    ['missing workspaceId stays in Severe', 'missing', 'severe', true],
    ['missing workspaceId stays out of Custom', 'missing', 'custom', false],
    ['malformed workspaceId stays in Severe', 'malformed', 'severe', true],
    ['malformed workspaceId stays out of Custom', 'malformed', 'custom', false],
  ] as const)('%s', (_caseName, legacyKind, activeWorkspace, shouldSuggest) => {
    const store = renderPanelWithLegacyWorkspaceHistory(activeWorkspace, legacyKind);
    expect(screen.getByText(/Day 1 package/)).toBeInTheDocument();
    expect(store.getState().forecast.savedCycles[0]?.workspaceId).toBe('severe');

    const previousOutlookButton = screen.queryByRole('button', { name: previousOutlookButtonName });
    if (shouldSuggest) {
      expect(previousOutlookButton).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: previousOutlookButtonName }));

      const importedFeatureIds = store.getState().forecast.forecastCycle.days[1]?.data.tornado?.get('2%')
        ?.map((feature) => feature.id);
      expect(importedFeatureIds).toContain('legacy-source');
    } else {
      expect(previousOutlookButton).not.toBeInTheDocument();
    }
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
    const previousOutlookButton = screen.queryByRole('button', { name: previousOutlookButtonName });
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
