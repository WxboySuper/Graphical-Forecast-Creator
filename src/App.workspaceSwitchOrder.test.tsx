import { act, render, screen, waitFor } from '@testing-library/react';
import { Outlet as MockOutlet } from 'react-router';
import App from './App';
import { store } from './store';
import { setMapView, setForecastWorkspace } from './store/forecastSlice';

// The ordering test drives the shipped App: real providers, real AppHooks, real
// route tree. Only the heavy pages and shells are stubbed so the test can watch
// the flush, the workspace reset, and the target restore in one commit.
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
jest.mock('./pages/ForecastPage', () => {
  const { useEffect } = jest.requireActual<typeof import('react')>('react');
  const { getAutoSaveStorageKey } = jest.requireActual<typeof import('./hooks/useAutoSave')>('./hooks/useAutoSave');
  return {
    __esModule: true,
    ForecastPage: ({ workspaceId }: { workspaceId: import('./config/forecastWorkspaces').ForecastWorkspaceId }) => {
      // Models the page's session restore entry point: the restore effects read
      // the workspace-scoped autosave as soon as the page mounts.
      useEffect(() => {
        const autosave = localStorage.getItem(getAutoSaveStorageKey(undefined, workspaceId));
        mockRestoreEvents.push(`restore:${workspaceId}:${autosave ?? 'none'}`);
      }, [workspaceId]);
      return <div>Forecast editor mock {workspaceId}</div>;
    },
    default: () => null,
  };
});
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

/** Ordered trace of the events the workspace-switch invariant depends on. */
const mockRestoreEvents: string[] = [];

const SEVERE_AUTOSAVE_KEY = 'forecastData';

describe('App workspace switch ordering', () => {
  let unsubscribe = () => {};
  let setItemSpy: jest.SpyInstance | null = null;

  beforeEach(() => {
    mockRestoreEvents.length = 0;
    localStorage.clear();
    sessionStorage.clear();
    store.dispatch(setForecastWorkspace('severe'));
    window.history.pushState({}, '', '/forecast/severe');
  });

  afterEach(() => {
    unsubscribe();
    unsubscribe = () => {};
    setItemSpy?.mockRestore();
    setItemSpy = null;
  });

  test('flushes the outgoing workspace autosave before the reset and the target restore', async () => {
    let previousWorkspaceId = store.getState().forecast.workspaceId;
    unsubscribe = store.subscribe(() => {
      const nextWorkspaceId = store.getState().forecast.workspaceId;
      if (nextWorkspaceId !== previousWorkspaceId) {
        mockRestoreEvents.push(`reset:${nextWorkspaceId}`);
        previousWorkspaceId = nextWorkspaceId;
      }
    });

    const originalSetItem = Storage.prototype.setItem;
    setItemSpy = jest.spyOn(Storage.prototype, 'setItem').mockImplementation(function (
      this: Storage,
      key: string,
      value: string,
    ) {
      if (key === SEVERE_AUTOSAVE_KEY) mockRestoreEvents.push('flush:severe');
      originalSetItem.call(this, key, value);
    });

    // The target workspace already has an autosave waiting of its own.
    const seededCustomAutosave = JSON.stringify({ seeded: 'custom', timestamp: '2026-09-24T00:00:00.000Z' });
    localStorage.setItem('forecastData:custom', seededCustomAutosave);

    render(<App />);
    expect(await screen.findByText('Forecast editor mock severe')).toBeInTheDocument();

    // A debounced edit that has not fired yet when the route switches.
    act(() => {
      store.dispatch(setMapView({ center: [35, -97], zoom: 6 }));
    });

    act(() => {
      window.history.pushState({}, '', '/forecast/custom');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });

    await waitFor(() => expect(
      mockRestoreEvents.some((event) => event.startsWith('restore:custom')),
    ).toBe(true));

    const flushIndex = mockRestoreEvents.indexOf('flush:severe');
    const resetIndex = mockRestoreEvents.indexOf('reset:custom');
    const restoreIndex = mockRestoreEvents.findIndex((event) => event.startsWith('restore:custom'));
    expect(flushIndex).toBeGreaterThanOrEqual(0);
    expect(resetIndex).toBeGreaterThan(flushIndex);
    expect(restoreIndex).toBeGreaterThan(resetIndex);
    // The restore reads the target workspace's own autosave after the switch.
    expect(mockRestoreEvents[restoreIndex]).toBe(`restore:custom:${seededCustomAutosave}`);

    // The flushed copy holds the pre-switch document, not the reset blank one.
    const flushed = JSON.parse(localStorage.getItem(SEVERE_AUTOSAVE_KEY) ?? 'null');
    expect(flushed).toMatchObject({ schemaVersion: 1, workspaceId: 'severe' });
    expect(flushed.forecast.mapView).toEqual({ center: [35, -97], zoom: 6 });
  });
});
