import { Provider } from 'react-redux';
import { act, render, waitFor } from '@testing-library/react';
import { configureStore } from '@reduxjs/toolkit';
import forecastReducer, { setMapView, setCycleDate } from '../store/forecastSlice';
import { clearAutoSave, getAutoSaveStorageKey, migrateLegacyAutoSave, migrateWorkspaceAutoSaves, pickNewestAutoSaveValue, selectPreferredAutoSaveValue, useAutoSave } from './useAutoSave';
import { serializeForecast } from '../utils/fileUtils';

jest.mock('../utils/fileUtils', () => ({
  serializeForecast: jest.fn(() => ({ serialized: true })),
}));

const Harness = ({ workspaceId = 'severe' }: { workspaceId?: 'severe' | 'custom' }) => {
  useAutoSave(undefined, workspaceId);
  return null;
};

const createStore = () =>
  configureStore({
    reducer: { forecast: forecastReducer },
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware({ serializableCheck: false, immutableCheck: false }),
  });

describe('useAutoSave', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    localStorage.clear();
    (serializeForecast as jest.Mock).mockClear().mockReturnValue({ serialized: true });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('migrates the legacy anonymous autosave into a signed-in scope', () => {
    localStorage.setItem('forecastData', JSON.stringify({ legacy: true }));

    migrateLegacyAutoSave('user/1');

    expect(localStorage.getItem('forecastData')).toBeNull();
    expect(localStorage.getItem('forecastData:user-user%2F1')).toBe(JSON.stringify({ legacy: true }));
  });

  test('keeps workspace autosaves in separate anonymous and account scopes', () => {
    expect(getAutoSaveStorageKey(null, 'custom')).toBe('forecastData:custom');
    expect(getAutoSaveStorageKey('user-1', 'custom')).toBe('forecastData:custom:user-user-1');
    expect(getAutoSaveStorageKey('user-1', 'severe')).toBe('forecastData:user-user-1');
  });

  test('migrates a non-Severe anonymous autosave into its own account scope', () => {
    const anonymousKey = getAutoSaveStorageKey(null, 'custom');
    const scopedKey = getAutoSaveStorageKey('user-1', 'custom');
    localStorage.setItem(anonymousKey, JSON.stringify({ custom: true }));

    migrateLegacyAutoSave('user-1', undefined, 'custom');

    expect(localStorage.getItem(anonymousKey)).toBeNull();
    expect(localStorage.getItem(scopedKey)).toBe(JSON.stringify({ custom: true }));
    // The Severe scope is never touched by a non-Severe migration.
    expect(localStorage.getItem('forecastData')).toBeNull();
  });

  test('does not overwrite a non-Severe account autosave during migration', () => {
    const anonymousKey = getAutoSaveStorageKey(null, 'custom');
    const scopedKey = getAutoSaveStorageKey('user-1', 'custom');
    localStorage.setItem(anonymousKey, JSON.stringify({ anonymous: true }));
    localStorage.setItem(scopedKey, JSON.stringify({ account: true }));

    migrateLegacyAutoSave('user-1', undefined, 'custom');

    expect(localStorage.getItem(anonymousKey)).toBe(JSON.stringify({ anonymous: true }));
    expect(localStorage.getItem(scopedKey)).toBe(JSON.stringify({ account: true }));
  });

  test('persists live in-memory edits instead of migrating a stale legacy snapshot', () => {
    localStorage.setItem('forecastData', JSON.stringify({ legacy: true, timestamp: '2026-07-13T00:00:00.000Z' }));

    migrateLegacyAutoSave('user-1', { live: true, unsaved: 'edit', timestamp: '2026-07-14T00:00:00.000Z' });

    expect(localStorage.getItem('forecastData')).toBeNull();
    expect(localStorage.getItem('forecastData:user-user-1')).toBe(JSON.stringify({ live: true, unsaved: 'edit', timestamp: '2026-07-14T00:00:00.000Z' }));
  });

  test('does not promote anonymous live state over an existing account autosave on sign-in', () => {
    localStorage.setItem('forecastData', JSON.stringify({ legacy: true, timestamp: '2026-07-14T12:00:00.000Z' }));
    localStorage.setItem('forecastData:user-user-1', JSON.stringify({ account: true, timestamp: '2026-07-13T12:00:00.000Z' }));

    migrateLegacyAutoSave('user-1', { live: true, timestamp: '2026-07-14T11:00:00.000Z' });

    expect(localStorage.getItem('forecastData')).toBe(JSON.stringify({ legacy: true, timestamp: '2026-07-14T12:00:00.000Z' }));
    expect(localStorage.getItem('forecastData:user-user-1')).toBe(JSON.stringify({ account: true, timestamp: '2026-07-13T12:00:00.000Z' }));
  });

  test('migrates anonymous autosaves for every workspace on sign-in', () => {
    localStorage.setItem('forecastData', JSON.stringify({ severe: true }));
    localStorage.setItem('forecastData:custom', JSON.stringify({ custom: true }));
    localStorage.setItem('forecastData:mesoscale', JSON.stringify({ mesoscale: true }));

    migrateWorkspaceAutoSaves('user-1', undefined, 'severe');

    expect(localStorage.getItem('forecastData:user-user-1')).toBe(JSON.stringify({ severe: true }));
    expect(localStorage.getItem('forecastData:custom:user-user-1')).toBe(JSON.stringify({ custom: true }));
    expect(localStorage.getItem('forecastData:mesoscale:user-user-1')).toBe(JSON.stringify({ mesoscale: true }));
    expect(localStorage.getItem('forecastData')).toBeNull();
    expect(localStorage.getItem('forecastData:custom')).toBeNull();
    expect(localStorage.getItem('forecastData:mesoscale')).toBeNull();
  });

  test('reconciles live editor state only for the mounted workspace during the sweep', () => {
    localStorage.setItem('forecastData:custom', JSON.stringify({ custom: true, timestamp: '2026-07-13T00:00:00.000Z' }));
    const liveSession = { live: true, timestamp: '2026-07-14T00:00:00.000Z' };

    migrateWorkspaceAutoSaves('user-1', liveSession, 'severe');

    expect(localStorage.getItem('forecastData:user-user-1')).toBe(JSON.stringify(liveSession));
    expect(localStorage.getItem('forecastData:custom:user-user-1')).toBe(
      JSON.stringify({ custom: true, timestamp: '2026-07-13T00:00:00.000Z' }),
    );
    expect(localStorage.getItem('forecastData:custom')).toBeNull();
  });

  test('sweep leaves existing account drafts and signed-out storage alone', () => {
    localStorage.setItem('forecastData:custom', JSON.stringify({ anonymous: true }));
    localStorage.setItem('forecastData:custom:user-user-1', JSON.stringify({ account: true }));

    migrateWorkspaceAutoSaves(null);
    expect(localStorage.getItem('forecastData:custom')).toBe(JSON.stringify({ anonymous: true }));

    migrateWorkspaceAutoSaves('user-1', undefined, 'custom');
    expect(localStorage.getItem('forecastData:custom:user-user-1')).toBe(JSON.stringify({ account: true }));
    expect(localStorage.getItem('forecastData:custom')).toBe(JSON.stringify({ anonymous: true }));
  });

  test('selectPreferredAutoSaveValue keeps account autosave over legacy copies', () => {
    const scoped = JSON.stringify({ account: true, timestamp: '2026-07-13T12:00:00.000Z' });
    const legacy = JSON.stringify({ legacy: true, timestamp: '2026-07-14T12:00:00.000Z' });

    expect(selectPreferredAutoSaveValue(scoped, legacy)).toBe(scoped);
    expect(selectPreferredAutoSaveValue(null, legacy)).toBe(legacy);
    expect(pickNewestAutoSaveValue(scoped, legacy, JSON.stringify({ live: true, timestamp: '2026-07-14T11:00:00.000Z' }))).toBe(legacy);
  });

  test('ignores snapshots with malformed timestamps when choosing the newest value', () => {
    const invalid = JSON.stringify({ invalid: true, timestamp: 'not-a-date' });
    const valid = JSON.stringify({ valid: true, timestamp: '2026-07-14T12:00:00.000Z' });

    expect(pickNewestAutoSaveValue(invalid, valid)).toBe(valid);
    expect(pickNewestAutoSaveValue(invalid)).toBeNull();
  });

  test('clears the active account autosave and legacy fallback for a fresh workflow', () => {
    localStorage.setItem('forecastData:user-user-1', JSON.stringify({ account: true }));
    localStorage.setItem('forecastData', JSON.stringify({ legacy: true }));

    clearAutoSave('user-1');

    expect(localStorage.getItem('forecastData:user-user-1')).toBeNull();
    expect(localStorage.getItem('forecastData')).toBeNull();
  });

  test('clears only the selected non-Severe workspace autosave', () => {
    const customKey = getAutoSaveStorageKey('user-1', 'custom');
    localStorage.setItem(customKey, JSON.stringify({ custom: true }));
    localStorage.setItem('forecastData:custom', JSON.stringify({ anonymousCustom: true }));
    localStorage.setItem('forecastData', JSON.stringify({ severe: true }));

    clearAutoSave('user-1', 'custom');

    expect(localStorage.getItem(customKey)).toBeNull();
    expect(localStorage.getItem('forecastData:custom')).toBeNull();
    expect(localStorage.getItem('forecastData')).toBe(JSON.stringify({ severe: true }));
  });

  test('does not overwrite an existing signed-in autosave during migration', () => {
    localStorage.setItem('forecastData', JSON.stringify({ legacy: true }));
    localStorage.setItem('forecastData:user-user-1', JSON.stringify({ account: true }));

    migrateLegacyAutoSave('user-1');

    expect(localStorage.getItem('forecastData')).toBe(JSON.stringify({ legacy: true }));
    expect(localStorage.getItem('forecastData:user-user-1')).toBe(JSON.stringify({ account: true }));
  });

  test('skips initial render, then debounces forecast saves to localStorage', async () => {
    const store = createStore();
    render(
      <Provider store={store}>
        <Harness />
      </Provider>
    );

    act(() => {
      jest.advanceTimersByTime(5000);
    });
    expect(serializeForecast).not.toHaveBeenCalled();

    act(() => {
      store.dispatch(setMapView({ center: [35, -97], zoom: 6 }));
    });

    await waitFor(() => {
      expect(serializeForecast).not.toHaveBeenCalled();
    });

    act(() => {
      jest.advanceTimersByTime(4999);
    });
    expect(localStorage.getItem('forecastData')).toBeNull();

    act(() => {
      jest.advanceTimersByTime(1);
    });
    expect(localStorage.getItem('forecastData')).toBe(JSON.stringify({ schemaVersion: 1, workspaceId: 'severe', forecast: { serialized: true } }));
  });

  test('clears pending saves and silently ignores serialization failures', async () => {
    const store = createStore();
    render(
      <Provider store={store}>
        <Harness />
      </Provider>
    );

    (serializeForecast as jest.Mock).mockImplementation(() => {
      throw new Error('nope');
    });

    act(() => {
      store.dispatch(setCycleDate('2026-04-25'));
      store.dispatch(setCycleDate('2026-04-26'));
    });

    await waitFor(() => {
      expect(serializeForecast).not.toHaveBeenCalled();
    });

    act(() => {
      jest.advanceTimersByTime(5000);
    });

    expect(serializeForecast).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem('forecastData')).toBeNull();
  });

  test('cancels a pending save when the hook unmounts', async () => {
    const store = createStore();
    const { unmount } = render(
      <Provider store={store}>
        <Harness />
      </Provider>
    );

    act(() => {
      store.dispatch(setMapView({ center: [35, -97], zoom: 6 }));
    });

    await waitFor(() => {
      expect(serializeForecast).not.toHaveBeenCalled();
    });

    unmount();

    act(() => {
      jest.advanceTimersByTime(5000);
    });

    expect(serializeForecast).not.toHaveBeenCalled();
    expect(localStorage.getItem('forecastData')).toBeNull();
  });

  // Guards the pending-old + batched-new + switch race: when a newer edit is
  // batched with the workspace switch on top of an older debounced pending,
  // the latest snapshot must win for the old scope in a single write.
  test('flushes the latest batched edit when a switch lands on top of a pending save', async () => {
    const store = createStore();
    const { rerender } = render(
      <Provider store={store}>
        <Harness workspaceId="severe" />
      </Provider>
    );

    act(() => {
      store.dispatch(setMapView({ center: [35, -97], zoom: 6 }));
    });

    await waitFor(() => expect(serializeForecast).not.toHaveBeenCalled());
    (serializeForecast as jest.Mock).mockClear();
    (serializeForecast as jest.Mock).mockImplementation(
      (_cycle: unknown, mapView: { center: [number, number]; zoom: number }) => ({ zoom: mapView.zoom }),
    );

    // Batch the newer edit with the workspace switch so the debounce effect
    // never runs for the intermediate document on its own.
    // eslint-disable-next-line testing-library/no-unnecessary-act -- batching dispatch and rerender reproduces the race
    act(() => {
      store.dispatch(setMapView({ center: [36, -96], zoom: 9 }));
      rerender(
        <Provider store={store}>
          <Harness workspaceId="custom" />
        </Provider>
      );
    });

    expect(serializeForecast).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem('forecastData')).toBe(JSON.stringify({
      schemaVersion: 1,
      workspaceId: 'severe',
      forecast: { zoom: 9 },
    }));
    expect(localStorage.getItem('forecastData:custom')).toBeNull();

    act(() => {
      jest.advanceTimersByTime(5000);
    });
    // The suppressed older pending must not overwrite the newer flush later.
    expect(localStorage.getItem('forecastData')).toBe(JSON.stringify({
      schemaVersion: 1,
      workspaceId: 'severe',
      forecast: { zoom: 9 },
    }));
  });

  // Guards flush-before-reset ordering: a dirty edit must land in the old
  // workspace scope on switch, without waiting for another debounce.
  test('flushes the previous workspace edit when autosave scope changes', async () => {
    const store = createStore();
    const { rerender } = render(
      <Provider store={store}>
        <Harness workspaceId="severe" />
      </Provider>
    );

    act(() => {
      store.dispatch(setMapView({ center: [35, -97], zoom: 6 }));
    });

    await waitFor(() => expect(serializeForecast).not.toHaveBeenCalled());
    rerender(
      <Provider store={store}>
        <Harness workspaceId="custom" />
      </Provider>
    );

    expect(localStorage.getItem('forecastData')).toBe(JSON.stringify({
      schemaVersion: 1,
      workspaceId: 'severe',
      forecast: { serialized: true },
    }));
    expect(localStorage.getItem('forecastData:custom')).toBeNull();
  });
});
