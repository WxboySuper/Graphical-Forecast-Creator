import { DEFAULT_MONITOR_SETTINGS, normalizeMonitorSettings } from './types';
import monitorReducer, { setRadarMode } from '../store/monitorSlice';
import { readStoredMonitorSettings, writeStoredMonitorSettings, MONITOR_SETTINGS_STORAGE_KEY } from './storage';

describe('monitor settings', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  test('normalizes unknown settings with safe defaults and bounds', () => {
    const settings = normalizeMonitorSettings({
      radarMode: 'site',
      radarProduct: 'sr-bvel',
      radarSite: 'ktlx',
      radarOpacity: 99,
      satelliteProduct: 'goes-water-vapor',
      satelliteOpacity: -1,
      outlookSource: { kind: 'local-cycle', id: 'cycle-1' },
      mapView: { center: [100, -200], zoom: 99 },
      animationEnabled: true,
      animationSpeedMs: 99,
    });

    expect(settings).toEqual({
      ...DEFAULT_MONITOR_SETTINGS,
      radarMode: 'site',
      radarProduct: 'sr-bvel',
      radarSite: 'KTLX',
      radarOpacity: 1,
      satelliteProduct: 'goes-water-vapor',
      satelliteOpacity: 0,
      outlookSource: { kind: 'local-cycle', id: 'cycle-1' },
      mapView: { center: [90, -180], zoom: 14 },
      animationEnabled: true,
      animationSpeedMs: 250,
    });
  });

  test('coerces radar product when switching source mode', () => {
    const state = monitorReducer(undefined, { type: 'init' });
    const siteState = monitorReducer(state, setRadarMode('site'));
    expect(siteState.radarProduct).toBe('sr-bref');

    const mrmsState = monitorReducer(
      { ...siteState, radarProduct: 'sr-bvel' },
      setRadarMode('mrms-conus')
    );
    expect(mrmsState.radarProduct).toBe('bref-qcd');
  });

  test('persists settings to localStorage with fallback on invalid content', () => {
    writeStoredMonitorSettings({ ...DEFAULT_MONITOR_SETTINGS, radarMode: 'mrms-conus' });
    expect(JSON.parse(localStorage.getItem(MONITOR_SETTINGS_STORAGE_KEY) || '{}').radarMode).toBe('mrms-conus');
    expect(readStoredMonitorSettings().radarMode).toBe('mrms-conus');

    localStorage.setItem(MONITOR_SETTINGS_STORAGE_KEY, 'not-json');
    expect(readStoredMonitorSettings()).toEqual(DEFAULT_MONITOR_SETTINGS);
  });
});
