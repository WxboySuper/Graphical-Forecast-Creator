import { render, screen, waitFor } from '@testing-library/react';
import { Outlet as MockOutlet } from 'react-router';
import App from './App';
import { store } from './store';
import {
  addFeature,
  saveCurrentCycle,
  setForecastWorkspace,
  updateDiscussionDraft,
} from './store/forecastSlice';
import { saveCycleHistoryToStorage } from './utils/cycleHistoryPersistence';

// The routing test renders the shipped App: real providers, real AppHooks, real
// route tree. Only the heavy pages and shells are stubbed so the test exercises
// route registration instead of a copy of it.
jest.mock('./pages/HomePage', () => ({
  __esModule: true,
  default: () => <div>HomePage Mock</div>,
}));
jest.mock('./pages/AccountPage', () => ({
  __esModule: true,
  default: () => <div>AccountPage Mock</div>,
}));
jest.mock('./pages/PricingPage', () => ({
  __esModule: true,
  default: () => <div>PricingPage Mock</div>,
}));
jest.mock('./pages/UpdatesPage', () => ({
  UpdatesPage: () => <div>UpdatesPage Mock</div>,
}));
jest.mock('./pages/BetaLandingPage', () => ({
  __esModule: true,
  default: () => <div>BetaLandingPage Mock</div>,
}));
jest.mock('./pages/BetaInvitePage', () => ({
  __esModule: true,
  default: () => <div>BetaInvitePage Mock</div>,
}));
jest.mock('./pages/ForecastPage', () => ({
  __esModule: true,
  ForecastPage: () => <div>Forecast editor mock</div>,
  default: () => <div>Forecast editor mock</div>,
}));
jest.mock('./components/Layout', () => ({
  AppLayout: () => (
    <div>
      <div>AppLayout Mock</div>
      <MockOutlet />
    </div>
  ),
}));
jest.mock('./components/Beta/BetaAccessGuard', () => () => <MockOutlet />);
jest.mock('./components/ToS/ToSModal', () => ({
  __esModule: true,
  hasAcceptedToS: () => true,
  default: () => <div>ToSModal Mock</div>,
}));
jest.mock('./components/PrivacyPolicy/PrivacyPolicyModal', () => ({
  __esModule: true,
  hasAcceptedPrivacyPolicy: () => true,
  default: () => <div>PrivacyPolicyModal Mock</div>,
}));

const ACTIVE_FEATURE_ID = 'active-severe-outlook';

const seedActiveSevereDocument = (): void => {
  // Switch away and back so every test starts from a blank Severe document
  // regardless of what an earlier case left behind.
  store.dispatch(setForecastWorkspace('custom'));
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
  // App hydrates saved cycles from storage on mount, so seed the persisted copy
  // as well or the real AppHooks wipe the Redux history on first render.
  const { savedCycles, lifetimeCycleStats } = store.getState().forecast;
  saveCycleHistoryToStorage(savedCycles, undefined, lifetimeCycleStats);
};

const activeSevereDocument = () => {
  const state = store.getState().forecast;
  return {
    workspaceId: state.workspaceId,
    featureIds:
      state.forecastCycle.days[1]?.data.tornado?.get('2%')?.map((feature) => feature.id) ?? [],
    discussionDraft: state.discussionDraftsByScope['day-1']?.diyContent,
    savedCycles: state.savedCycles.map((cycle) => ({ id: cycle.id, workspaceId: cycle.workspaceId })),
  };
};

const renderAppAt = (path: string) => {
  window.history.pushState({}, '', path);
  return render(<App />);
};

describe('App forecast workspace gating', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    window.history.pushState({}, '', '/');
    seedActiveSevereDocument();
  });

  test('gated tropical URL shows the unavailable page without clearing or retagging the active forecast', async () => {
    const before = activeSevereDocument();

    renderAppAt('/forecast/tropical');

    expect(
      await screen.findByRole('heading', { level: 1, name: /tropical forecast is not available yet/i }),
    ).toBeInTheDocument();
    expect(screen.queryByText('Forecast editor mock')).not.toBeInTheDocument();

    const after = activeSevereDocument();
    expect(after.workspaceId).toBe('severe');
    expect(after).toEqual(before);
    expect(after.featureIds).toContain(ACTIVE_FEATURE_ID);
    expect(after.discussionDraft).toBe('Active discussion draft');
    expect(after.savedCycles).toHaveLength(before.savedCycles.length);
    expect(after.savedCycles[0]?.workspaceId).toBe('severe');
  });

  test('unknown forecast path falls back to the app root without touching the active forecast', async () => {
    const before = activeSevereDocument();

    renderAppAt('/forecast/unknown');

    expect(await screen.findByText('HomePage Mock')).toBeInTheDocument();
    expect(screen.queryByText('Forecast editor mock')).not.toBeInTheDocument();
    expect(screen.queryByText(/is not available yet/i)).not.toBeInTheDocument();
    expect(activeSevereDocument()).toEqual(before);
    expect(store.getState().forecast.workspaceId).toBe('severe');
  });

  test('the exposed Severe editor mounts at its canonical route with the document intact', async () => {
    const before = activeSevereDocument();

    renderAppAt('/forecast/severe');

    expect(await screen.findByText('Forecast editor mock')).toBeInTheDocument();
    expect(activeSevereDocument()).toEqual(before);
    expect(store.getState().forecast.workspaceId).toBe('severe');
  });

  test('the exposed Custom route retags Redux ownership to its own workspace', async () => {
    renderAppAt('/forecast/custom');

    expect(await screen.findByText('Forecast editor mock')).toBeInTheDocument();
    await waitFor(() => expect(store.getState().forecast.workspaceId).toBe('custom'));
    // History is workspace-owned and survives the switch by design.
    expect(store.getState().forecast.savedCycles.length).toBeGreaterThan(0);
  });
});
