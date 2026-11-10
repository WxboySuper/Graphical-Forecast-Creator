import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import {
  CONTEXT_STORAGE_KEY,
  DEFAULT_CONTEXT_LAYERS,
  parseContextLayers,
  radarConfig,
  satelliteConfig,
} from './contextLayers';
import { ContextLayerPanel } from './ContextLayerPanel';
import { useContextLayers, useLayerTime, type LayerTimeState } from './useContextLayers';

const mockFetchTimes = jest.fn();
jest.mock('../../../monitor/wms', () => ({
  ...jest.requireActual('../../../monitor/wms'),
  fetchLayerTimeValues: (...args: unknown[]) => mockFetchTimes(...args),
}));

beforeEach(() => {
  window.localStorage.clear();
  mockFetchTimes.mockReset();
});

describe('context layer settings', () => {
  it('falls back to off for anything missing or unrecognized', () => {
    expect(parseContextLayers(undefined)).toEqual(DEFAULT_CONTEXT_LAYERS);
    expect(parseContextLayers('nope')).toEqual(DEFAULT_CONTEXT_LAYERS);
    expect(parseContextLayers({ radar: { product: 'site-radar', opacity: 7 }, satellite: [] })).toEqual(DEFAULT_CONTEXT_LAYERS);
    expect(parseContextLayers({ radar: { product: 'cref-qcd', opacity: 0.4 }, satellite: { product: 'goes-visible', opacity: 0.9 } }))
      .toEqual({ radar: { product: 'cref-qcd', opacity: 0.4 }, satellite: { product: 'goes-visible', opacity: 0.9 } });
  });

  it('maps products to the same NOAA layers the Monitor page uses, and nothing when off', () => {
    expect(radarConfig('off')).toBeNull();
    expect(radarConfig('bref-qcd')?.layer).toBe('conus_bref_qcd');
    expect(satelliteConfig('off')).toBeNull();
    expect(satelliteConfig('goes-visible')?.layer).toBe('goes_visible_imagery');
  });

  it('keeps choices in this browser and survives a reload', () => {
    const { result, unmount } = renderHook(() => useContextLayers());
    act(() => result.current.setRadar({ product: 'bref-qcd' }));
    act(() => result.current.setSatellite({ opacity: 0.3 }));
    unmount();
    expect(JSON.parse(window.localStorage.getItem(CONTEXT_STORAGE_KEY) as string).radar.product).toBe('bref-qcd');
    const again = renderHook(() => useContextLayers());
    expect(again.result.current.state.radar.product).toBe('bref-qcd');
    expect(again.result.current.state.satellite.opacity).toBe(0.3);
  });

  it('ignores corrupt stored settings', () => {
    window.localStorage.setItem(CONTEXT_STORAGE_KEY, '{not json');
    const { result } = renderHook(() => useContextLayers());
    expect(result.current.state).toEqual(DEFAULT_CONTEXT_LAYERS);
  });
});

describe('useLayerTime', () => {
  const config = { url: 'https://example.invalid/ows', layer: 'layer' };

  it('stays off without a layer and makes no request', () => {
    const { result } = renderHook(() => useLayerTime(null));
    expect(result.current).toEqual({ status: 'off' });
    expect(mockFetchTimes).not.toHaveBeenCalled();
  });

  it('reports the newest time, and unavailable when the request fails or has no times', async () => {
    mockFetchTimes.mockResolvedValueOnce(['2026-11-09T17:00:00Z', '2026-11-09T17:10:00Z']);
    const ok = renderHook(() => useLayerTime(config));
    await waitFor(() => expect(ok.result.current).toEqual({ status: 'ready', time: '2026-11-09T17:10:00Z' }));
    mockFetchTimes.mockRejectedValueOnce(new Error('down'));
    const failed = renderHook(() => useLayerTime({ ...config, layer: 'other' }));
    await waitFor(() => expect(failed.result.current).toEqual({ status: 'unavailable' }));
    mockFetchTimes.mockResolvedValueOnce([]);
    const empty = renderHook(() => useLayerTime({ ...config, layer: 'empty' }));
    await waitFor(() => expect(empty.result.current).toEqual({ status: 'unavailable' }));
  });
});

describe('ContextLayerPanel', () => {
  const controllerFor = (state = DEFAULT_CONTEXT_LAYERS) => ({ state, setRadar: jest.fn(), setSatellite: jest.fn() });
  const off: LayerTimeState = { status: 'off' };

  it('lets the user pick products, and shows opacity only for chosen layers', () => {
    const controller = controllerFor();
    render(<ContextLayerPanel controller={controller} radarTime={off} satelliteTime={off} />);
    expect(screen.queryByLabelText('Radar opacity')).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Radar'), { target: { value: 'bref-qcd' } });
    expect(controller.setRadar).toHaveBeenCalledWith({ product: 'bref-qcd' });
    fireEvent.change(screen.getByLabelText('Satellite'), { target: { value: 'goes-longwave' } });
    expect(controller.setSatellite).toHaveBeenCalledWith({ product: 'goes-longwave' });
  });

  it('shows the valid time, a loading state, and an explicit unavailable state', () => {
    const state = { radar: { product: 'bref-qcd' as const, opacity: 0.5 }, satellite: { product: 'goes-visible' as const, opacity: 0.7 } };
    const controller = controllerFor(state);
    const { rerender } = render(<ContextLayerPanel controller={controller} radarTime={{ status: 'ready', time: '2026-11-09T17:10:00Z' }} satelliteTime={{ status: 'loading' }} />);
    expect(screen.getByText(/Valid 17Z Nov 9/)).toBeInTheDocument();
    expect(screen.getByText(/loading the latest image/i)).toBeInTheDocument();
    expect(screen.getByLabelText('Radar opacity')).toHaveValue('50');
    fireEvent.change(screen.getByLabelText('Radar opacity'), { target: { value: '30' } });
    expect(controller.setRadar).toHaveBeenCalledWith({ opacity: 0.3 });
    rerender(<ContextLayerPanel controller={controller} radarTime={{ status: 'unavailable' }} satelliteTime={off} />);
    expect(screen.getByRole('alert')).toHaveTextContent(/not available right now/i);
  });
});
