import { render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { MemoryRouter } from 'react-router-dom';
import ForecastPage, {
  buildMapView,
  buildRolloverSaveLabel,
  canToggleSignificantForState,
  clearStoredCloudSession,
  cycleHasDiscussionContent,
  dayHasAnyFeatures,
  formatRolloverDayLabel,
  getProbabilityList,
  getUndoRedoAction,
  hasAnyModifierKey,
  hasRestorableCloudSelection,
  hasRolloverForecastData,
  hasUnsavedRolloverCandidateSession,
  isTypingTarget,
  normalizeProbability,
  parseLoadedForecast,
  parseStoredCloudMeta,
  parseStoredForecastPayload,
  processShortcutKeyDown,
  readStoredDayValue,
  writeStoredDayValue,
} from './ForecastPage';
import forecastReducer from '../store/forecastSlice';
import featureFlagsReducer from '../store/featureFlagsSlice';
import overlaysReducer from '../store/overlaysSlice';
import stormReportsReducer from '../store/stormReportsSlice';
import appModeReducer from '../store/appModeSlice';
import themeReducer from '../store/themeSlice';
import verificationReducer from '../store/verificationSlice';

const mockAddToast = jest.fn();
const mockUseAuth = jest.fn();

jest.mock('../components/Map/ForecastMap', () => {
  const { forwardRef } = jest.requireActual<typeof import('react')>('react');
  return {
    __esModule: true,
    default: forwardRef(() => <div>ForecastMap Mock</div>),
  };
});

jest.mock('../components/ForecastWorkspace/ForecastWorkspaceLayouts', () => ({
  ForecastTabbedToolbarLayout: () => <div>ForecastTabbedToolbarLayout Mock</div>,
}));

jest.mock('../components/ForecastWorkspace/ForecastWorkspaceModals', () => () => null);

jest.mock('../hooks/useAutoSave', () => ({
  useAutoSave: jest.fn(),
}));

jest.mock('../hooks/useAutoCategorical', () => jest.fn());
jest.mock('../utils/cycleHistoryPersistence', () => ({
  useCycleHistoryPersistence: jest.fn(),
}));
jest.mock('../auth/AuthProvider', () => ({
  useAuth: () => mockUseAuth(),
}));
jest.mock('../billing/EntitlementProvider', () => ({
  useEntitlement: () => ({ premiumActive: false, effectiveSource: 'none' }),
}));
jest.mock('../hooks/useCloudCycles', () => ({
  useCloudCycles: () => ({
    currentCloud: null,
    saveCycle: jest.fn(),
    markAsCurrent: jest.fn(),
  }),
}));
jest.mock('../hooks/useCloudSync', () => ({
  useCloudSync: () => ({
    markCurrentStateSynced: jest.fn(),
  }),
}));

jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useOutletContext: () => ({
    addToast: mockAddToast,
  }),
}));

const createStore = () => configureStore({
  reducer: {
    forecast: forecastReducer,
    featureFlags: featureFlagsReducer,
    overlays: overlaysReducer,
    stormReports: stormReportsReducer,
    appMode: appModeReducer,
    theme: themeReducer,
    verification: verificationReducer,
  },
  middleware: (getDefaultMiddleware) => getDefaultMiddleware({
    serializableCheck: false,
    immutableCheck: false,
  }),
});


const renderForecastPage = (store: ReturnType<typeof createStore>) =>
  render(
    <MemoryRouter>
      <Provider store={store}>
        <ForecastPage />
      </Provider>
    </MemoryRouter>
  );


describe('ForecastPage layout selection', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    mockUseAuth.mockReturnValue({ user: null, syncedSettings: null });
  });

  test('defaults to the tabbed toolbar layout when no local override is present', () => {
    const store = createStore();
    renderForecastPage(store);

    expect(screen.getByText('ForecastTabbedToolbarLayout Mock')).toBeInTheDocument();
  });

  test('query string or stored/remote overrides resolve to the tabbed toolbar when other variants are removed', () => {
    const store = createStore();
    localStorage.setItem('gfc-forecast-ui-variant', 'floating_panels');

    const first = render(
      <MemoryRouter initialEntries={['/forecast?forecastUi=workspace_dock']}>
        <Provider store={store}>
          <ForecastPage />
        </Provider>
      </MemoryRouter>
    );

    expect(screen.getByText('ForecastTabbedToolbarLayout Mock')).toBeInTheDocument();
    first.unmount();

    localStorage.setItem('gfc-forecast-ui-variant', 'floating_panels');
    const second = renderForecastPage(store);
    expect(screen.getByText('ForecastTabbedToolbarLayout Mock')).toBeInTheDocument();
    second.unmount();

    mockUseAuth.mockReturnValue({
      user: { uid: 'user-1' },
      syncedSettings: { forecastUiVariant: 'workspace_dock' },
    });

    const third = renderForecastPage(store);
    expect(screen.getByText('ForecastTabbedToolbarLayout Mock')).toBeInTheDocument();
    third.unmount();
  });
});

describe('ForecastPage helpers', () => {
  test('exposes probability lists and significant toggle rules', () => {
    expect(getProbabilityList('categorical')).toContain('HIGH');
    expect(getProbabilityList('tornado')).toContain('60%');
    expect(getProbabilityList('wind')).toEqual(getProbabilityList('hail'));
    expect(getProbabilityList('unknown')).toEqual([]);
    expect(normalizeProbability('10#')).toBe('10%');

    expect(canToggleSignificantForState('categorical', 'HIGH')).toBe(false);
    expect(canToggleSignificantForState('tornado', '5%')).toBe(false);
    expect(canToggleSignificantForState('tornado', '10%')).toBe(true);
    expect(canToggleSignificantForState('wind', '5%')).toBe(false);
    expect(canToggleSignificantForState('hail', '15%')).toBe(true);
  });

  test('handles rollover labels, storage helpers, and session metadata parsing', () => {
    writeStoredDayValue('test-day', '2026-04-24');
    expect(readStoredDayValue('test-day')).toBe('2026-04-24');
    expect(buildRolloverSaveLabel('2026-04-24')).toContain('Apr 24');
    expect(buildRolloverSaveLabel('not-a-date')).toContain('not-a-date');
    expect(formatRolloverDayLabel('2026-04-24')).toContain('April 24');
    expect(formatRolloverDayLabel('bad-date')).toBe('bad-date');

    expect(parseStoredForecastPayload(null)).toBeNull();
    expect(parseStoredForecastPayload('not-json')).toBeNull();
    expect(parseStoredForecastPayload(JSON.stringify({ nope: true }))).toBeNull();

    expect(parseStoredCloudMeta(null)).toBeNull();
    expect(parseStoredCloudMeta('not-json')).toBeNull();
    expect(parseStoredCloudMeta('{"id":"abc","label":"Cycle"}')).toEqual({ id: 'abc', label: 'Cycle' });
    expect(hasRestorableCloudSelection({ id: 'abc', label: 'Cycle' })).toBe(true);
    expect(hasRestorableCloudSelection({ id: 'abc' })).toBe(false);

    sessionStorage.setItem('cloudCyclePayload', 'payload');
    sessionStorage.setItem('cloudCycleMeta', 'meta');
    clearStoredCloudSession();
    expect(sessionStorage.getItem('cloudCyclePayload')).toBeNull();
    expect(sessionStorage.getItem('cloudCycleMeta')).toBeNull();
  });

  test('detects rollover candidates, map view fallbacks, keyboard targets, and undo/redo keys', () => {
    const emptyCycle = createStore().getState().forecast.forecastCycle;
    expect(hasRolloverForecastData(emptyCycle)).toBe(false);
    expect(cycleHasDiscussionContent(emptyCycle)).toBe(false);
    expect(hasUnsavedRolloverCandidateSession(emptyCycle, true)).toBe(false);

    const cycleWithDiscussion = {
      ...emptyCycle,
      days: {
        ...emptyCycle.days,
        1: { ...emptyCycle.days[1], discussion: 'A discussion' },
      },
    };
    expect(cycleHasDiscussionContent(cycleWithDiscussion)).toBe(true);
    expect(hasUnsavedRolloverCandidateSession(cycleWithDiscussion, false)).toBe(true);

    expect(buildMapView({ current: null })).toEqual({ center: [39.8283, -98.5795], zoom: 4 });
    expect(buildMapView({ current: { getView: () => ({ center: [1, 2], zoom: 8 }) } as never })).toEqual({
      center: [1, 2],
      zoom: 8,
    });

    expect(dayHasAnyFeatures(null)).toBe(false);
    expect(dayHasAnyFeatures({ tornado: new Map([['5%', [{}]]]) })).toBe(true);
    expect(isTypingTarget(document.createElement('input'))).toBe(true);
    expect(isTypingTarget(document.createElement('textarea'))).toBe(true);
    expect(isTypingTarget(document.createElement('button'))).toBe(false);

    expect(hasAnyModifierKey(new KeyboardEvent('keydown', { ctrlKey: true }))).toBe(true);
    expect(hasAnyModifierKey(new KeyboardEvent('keydown'))).toBe(false);
    expect(getUndoRedoAction(new KeyboardEvent('keydown', { ctrlKey: true }), 'z')).toBe('undo');
    expect(getUndoRedoAction(new KeyboardEvent('keydown', { ctrlKey: true, shiftKey: true }), 'z')).toBe('redo');
    expect(getUndoRedoAction(new KeyboardEvent('keydown', { metaKey: true }), 'y')).toBe('redo');
    expect(getUndoRedoAction(new KeyboardEvent('keydown'), 'z')).toBeNull();
  });

  test('parses loaded forecast files with clear failure toasts', async () => {
    const addToast = jest.fn();
    const makeTextFile = (text: string) => ({ text: jest.fn().mockResolvedValue(text) } as unknown as File);

    await expect(parseLoadedForecast(makeTextFile('not json'), addToast)).resolves.toBeNull();
    expect(addToast).toHaveBeenCalledWith('File is not valid JSON.', 'error');

    await expect(parseLoadedForecast(makeTextFile(JSON.stringify({ nope: true })), addToast)).resolves.toBeNull();
    expect(addToast).toHaveBeenCalledWith('Invalid forecast data format.', 'error');
  });

  test('routes keyboard shortcuts through command and standard handlers', () => {
    const dispatch = jest.fn();
    const addToast = jest.fn();
    const handleSave = jest.fn();
    const fileInput = document.createElement('input');
    fileInput.click = jest.fn();
    const mapAdapter = { getMap: jest.fn() };
    const context = {
      dispatch,
      addToast,
      isSaved: false,
      canUndo: true,
      canRedo: true,
      handleSave,
      fileInputRef: { current: fileInput },
      mapRef: { current: mapAdapter },
      currentDay: 1,
      activeOutlookType: 'tornado' as const,
      activeProbability: '10%',
      isSignificant: false,
    };

    const ctrlS = new KeyboardEvent('keydown', { key: 's', ctrlKey: true });
    processShortcutKeyDown(ctrlS, context);
    expect(handleSave).toHaveBeenCalledTimes(1);

    processShortcutKeyDown(new KeyboardEvent('keydown', { key: 'o', ctrlKey: true }), context);
    expect(fileInput.click).toHaveBeenCalledTimes(1);

    processShortcutKeyDown(new KeyboardEvent('keydown', { key: 'e', ctrlKey: true }), context);
    expect(mapAdapter.getMap).toHaveBeenCalledTimes(1);

    processShortcutKeyDown(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true }), context);
    processShortcutKeyDown(new KeyboardEvent('keydown', { key: 'y', ctrlKey: true }), context);
    expect(dispatch).toHaveBeenCalledTimes(2);

    processShortcutKeyDown(new KeyboardEvent('keydown', { key: '2' }), context);
    processShortcutKeyDown(new KeyboardEvent('keydown', { key: 'w' }), context);
    processShortcutKeyDown(new KeyboardEvent('keydown', { key: 's' }), context);
    processShortcutKeyDown(new KeyboardEvent('keydown', { key: 'ArrowUp' }), context);
    expect(addToast).toHaveBeenCalledWith('Switched to Day 2', 'info');
    expect(addToast).toHaveBeenCalledWith('Switched to Wind outlook', 'info');
    expect(addToast).toHaveBeenCalledWith('Enabled significant threat', 'info');
    expect(addToast).toHaveBeenCalledWith('Increased to 15%', 'info');

    processShortcutKeyDown(new KeyboardEvent('keydown', { key: 'g' }), {
      ...context,
      activeOutlookType: 'categorical',
      activeProbability: 'MRGL',
    });
    expect(addToast).toHaveBeenCalledWith('Added General Thunderstorm risk', 'info');

    const inputEvent = new KeyboardEvent('keydown', { key: '3' });
    Object.defineProperty(inputEvent, 'target', { value: document.createElement('input') });
    processShortcutKeyDown(inputEvent, context);
    expect(addToast).not.toHaveBeenCalledWith('Switched to Day 3', 'info');
  });
});
