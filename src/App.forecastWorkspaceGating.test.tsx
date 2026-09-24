import { useEffect } from 'react';
import { render, screen } from '@testing-library/react';
import { Provider, useDispatch, useSelector } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import forecastReducer, {
  addFeature,
  saveCurrentCycle,
  setForecastWorkspace,
  updateDiscussionDraft,
} from './store/forecastSlice';
import type { RootState } from './store';
import {
  getExposedForecastWorkspaceRoutes,
  getUnavailableForecastWorkspaceRoutes,
  resolveRouteForecastWorkspace,
} from './routing/forecastWorkspaceRoutes';
import { UnavailableForecastWorkspacePage } from './pages/UnavailableForecastWorkspacePage';
import overlaysReducer from './store/overlaysSlice';
import stormReportsReducer from './store/stormReportsSlice';
import appModeReducer from './store/appModeSlice';
import themeReducer from './store/themeSlice';
import verificationReducer from './store/verificationSlice';
import monitorReducer from './store/monitorSlice';

const createTestStore = () =>
  configureStore({
    reducer: {
      forecast: forecastReducer,
      overlays: overlaysReducer,
      stormReports: stormReportsReducer,
      appMode: appModeReducer,
      theme: themeReducer,
      verification: verificationReducer,
      monitor: monitorReducer,
    },
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware({
        serializableCheck: false,
        immutableCheck: false,
      }),
  });

type TestStore = ReturnType<typeof createTestStore>;

/**
 * Replicates the workspace-ownership rule in App.tsx AppHooks: only an exposed
 * forecast route may retag Redux. Gated and unknown paths leave state alone.
 */
const RouteWorkspaceSync = () => {
  const dispatch = useDispatch();
  const location = useLocation();
  const activeWorkspaceId = useSelector((state: RootState) => state.forecast.workspaceId);
  const routeWorkspace = resolveRouteForecastWorkspace(location.pathname);

  useEffect(() => {
    if (routeWorkspace && routeWorkspace.id !== activeWorkspaceId) {
      dispatch(setForecastWorkspace(routeWorkspace.id));
    }
  }, [activeWorkspaceId, dispatch, routeWorkspace]);

  return null;
};

/**
 * Replicates the forecast branch in App.tsx AppRoutes using the same route
 * records, so this stays a regression for the shipped wiring.
 */
const ForecastRouteTree = () => (
  <Routes>
    <Route path="forecast">
      {getExposedForecastWorkspaceRoutes().map((route) => (
        <Route
          key={route.id}
          path={route.routePath}
          element={<div>Forecast editor mock</div>}
        />
      ))}
      {getUnavailableForecastWorkspaceRoutes().map((route) => (
        <Route
          key={`unavailable-${route.id}`}
          path={route.routePath}
          element={<UnavailableForecastWorkspacePage workspaceId={route.id} />}
        />
      ))}
    </Route>
    <Route path="*" element={<div>Global fallback mock</div>} />
  </Routes>
);

const ACTIVE_FEATURE_ID = 'active-severe-outlook';

const seedActiveSevereDocument = (store: TestStore): void => {
  store.dispatch(setForecastWorkspace('severe'));
  store.dispatch(
    addFeature({
      feature: {
        type: 'Feature',
        id: ACTIVE_FEATURE_ID,
        geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] },
        properties: { outlookType: 'tornado', probability: '2%', isSignificant: false },
      } as never,
    }),
  );
  store.dispatch(
    updateDiscussionDraft({
      scopeId: 'day-1',
      draft: {
        mode: 'diy',
        validStart: '2026-09-24T00:00',
        validEnd: '2026-09-25T00:00',
        forecasterName: 'Regression',
        diyContent: 'Active discussion draft',
        lastModified: '2026-09-24T00:00:00.000Z',
      },
    }),
  );
  store.dispatch(saveCurrentCycle({ label: 'Active severe cycle' }));
};

const renderAtPath = (store: TestStore, initialPath: string) =>
  render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Provider store={store}>
        <RouteWorkspaceSync />
        <ForecastRouteTree />
      </Provider>
    </MemoryRouter>,
  );

const activeSevereDocument = (store: TestStore) => {
  const state = store.getState().forecast;
  return {
    workspaceId: state.workspaceId,
    featureIds: state.forecastCycle.days[1]?.data.tornado?.get('2%')?.map((feature) => feature.id) ?? [],
    discussionDraft: state.discussionDraftsByScope['day-1']?.diyContent,
    savedCycles: state.savedCycles.map((cycle) => ({ id: cycle.id, workspaceId: cycle.workspaceId })),
  };
};

describe('App forecast workspace gating', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  test('gated tropical URL shows the unavailable page without clearing or retagging the active forecast', () => {
    expect(getUnavailableForecastWorkspaceRoutes().some((route) => route.id === 'tropical')).toBe(true);
    expect(resolveRouteForecastWorkspace('/forecast/tropical')).toBeUndefined();

    const store = createTestStore();
    seedActiveSevereDocument(store);
    const before = activeSevereDocument(store);

    renderAtPath(store, '/forecast/tropical');

    expect(
      screen.getByRole('heading', { level: 1, name: /tropical forecast is not available yet/i }),
    ).toBeInTheDocument();
    expect(screen.queryByText('Forecast editor mock')).not.toBeInTheDocument();

    const after = activeSevereDocument(store);
    expect(after.workspaceId).toBe('severe');
    expect(after).toEqual(before);
    expect(after.featureIds).toContain(ACTIVE_FEATURE_ID);
    expect(after.discussionDraft).toBe('Active discussion draft');
    expect(after.savedCycles).toHaveLength(1);
    expect(after.savedCycles[0]?.workspaceId).toBe('severe');
  });

  test('unknown forecast path keeps not-found behavior without touching the active forecast', () => {
    expect(resolveRouteForecastWorkspace('/forecast/unknown')).toBeUndefined();

    const store = createTestStore();
    seedActiveSevereDocument(store);
    const before = activeSevereDocument(store);

    renderAtPath(store, '/forecast/unknown');

    expect(screen.queryByText('Forecast editor mock')).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 1 })).not.toBeInTheDocument();
    expect(screen.queryByText(/is not available yet/i)).not.toBeInTheDocument();

    expect(activeSevereDocument(store)).toEqual(before);
    expect(store.getState().forecast.workspaceId).toBe('severe');
  });
});
