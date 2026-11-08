/**
 * Mesoscale workspace tests. The data hooks and the map are mocked, so these tests
 * cover what the workspace itself decides: which state screen shows, what the
 * readout says, how model, frame, and layer controls change the selection, and that
 * a stale or partial run is always called out.
 */
import { useEffect } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import mesoscaleReducer from '../../store/mesoscaleSlice';
import { getDemoCatalog } from '../../mesoscale/fixtures/demoCatalogs';
import { MesoscaleWorkspace } from './MesoscaleWorkspace';
import { formatAge, formatUtc } from './SourcePanel';

const mockLatest = jest.fn();
const mockFrames = jest.fn();

jest.mock('../../mesoscale', () => ({
  ...jest.requireActual('../../mesoscale'),
  useMesoscaleLatest: (...args: unknown[]) => mockLatest(...args),
  useMesoscaleFrames: (...args: unknown[]) => mockFrames(...args),
}));
jest.mock('./MesoscaleMap', () => ({
  MesoscaleMap: ({ layers }: { layers: Array<{ id: string; opacity: number }> }) => (
    <div data-testid="map-stub">{layers.map(layer => `${layer.id}:${layer.opacity}`).join(',')}</div>
  ),
}));

const NOW = Date.parse('2026-11-08T21:35:00Z');
const catalog = getDemoCatalog('hrrr', NOW);
const readyResult = { state: 'ready', data: catalog, stale: false, ageMinutes: 95 };

const renderWorkspace = () => render(
  <Provider store={configureStore({ reducer: { mesoscale: mesoscaleReducer } })}>
    <MesoscaleWorkspace />
  </Provider>,
);

const givenReady = (result: unknown = readyResult, framesExtra: Record<string, unknown> = {}) => {
  mockLatest.mockReturnValue({ result: { state: 'ready', data: { cycleTime: catalog.cycleTime } }, ageMinutes: 95, stale: false });
  mockFrames.mockReturnValue({ result, ageMinutes: 95, stale: false, ...framesExtra });
};

describe('MesoscaleWorkspace', () => {
  beforeEach(() => {
    mockLatest.mockReset();
    mockFrames.mockReset();
  });

  it('shows a loading screen while the latest run resolves', () => {
    mockLatest.mockReturnValue({ result: { state: 'loading' }, ageMinutes: null, stale: false });
    renderWorkspace();
    expect(screen.getByRole('status')).toHaveTextContent(/loading the latest hrrr run/i);
    expect(mockFrames).not.toHaveBeenCalled();
  });

  it('explains an unavailable source without showing old data, and reloads the lookup on retry', () => {
    let lookups = 0;
    // A real hook loads on mount, so count mounts: a retry must start a fresh lookup.
    mockLatest.mockImplementation(() => {
      useEffect(() => { lookups += 1; }, []);
      return { result: { state: 'upstream-failure', message: 'down', retryable: true }, ageMinutes: null, stale: false };
    });
    renderWorkspace();
    expect(screen.getByRole('alert')).toHaveTextContent(/unavailable/i);
    expect(lookups).toBe(1);
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(lookups).toBe(2);
  });

  it('shows the readout for the analysis frame and labels it as model initialization', () => {
    givenReady();
    renderWorkspace();
    expect(screen.getByText('Analysis (model initialization)')).toBeInTheDocument();
    expect(screen.getByText(/1 h 35 min old/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'f00' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('map-stub')).toHaveTextContent('cape-surface:0.7');
  });

  it('switches forecast hours and labels them as forecasts', () => {
    givenReady();
    renderWorkspace();
    fireEvent.click(screen.getByRole('button', { name: '+3 h' }));
    expect(screen.getByRole('button', { name: '+3 h' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('Forecast +3 h')).toBeInTheDocument();
  });

  it('adds, reorders, changes opacity of, and removes layers', () => {
    givenReady();
    renderWorkspace();
    fireEvent.click(screen.getByRole('button', { name: 'CIN (surface)' }));
    expect(screen.getByTestId('map-stub')).toHaveTextContent('cape-surface:0.7,cin-surface:0.7');
    fireEvent.change(screen.getByLabelText('CIN (surface) opacity'), { target: { value: '30' } });
    expect(screen.getByTestId('map-stub')).toHaveTextContent('cin-surface:0.3');
    fireEvent.click(screen.getByRole('button', { name: 'Move CIN (surface) down' }));
    expect(screen.getByTestId('map-stub')).toHaveTextContent('cin-surface:0.3,cape-surface:0.7');
    fireEvent.click(screen.getByRole('button', { name: 'Remove CIN (surface)' }));
    expect(screen.getByTestId('map-stub')).toHaveTextContent('cape-surface:0.7');
  });

  it('calls out a stale run and a partial frame', () => {
    const partial = { ...catalog, frames: catalog.frames.map(frame => ({ ...frame, status: 'partial' as const })) };
    givenReady({ state: 'stale', data: partial, stale: true, ageMinutes: 400 }, { ageMinutes: 400, stale: true });
    renderWorkspace();
    expect(screen.getByText(/this run is 6 h 40 min old/i)).toBeInTheDocument();
    expect(screen.getByText(/some fields are unavailable/i)).toBeInTheDocument();
    expect(screen.getByText(/stale/)).toBeInTheDocument();
  });

  it('shows an explicit message when the catalog is malformed', () => {
    givenReady({ state: 'malformed', message: 'bad' });
    renderWorkspace();
    expect(screen.getByRole('alert')).toHaveTextContent(/could not be read/i);
  });
});

describe('source formatting', () => {
  it('formats UTC times and ages the way forecasters read them', () => {
    expect(formatUtc('2026-11-08T18:00:00Z')).toBe('18Z Nov 8');
    expect(formatUtc('nope')).toBe('unknown time');
    expect(formatAge(null)).toBe('age unknown');
    expect(formatAge(45)).toBe('45 min old');
    expect(formatAge(120)).toBe('2 h old');
    expect(formatAge(72)).toBe('1 h 12 min old');
  });
});
