import monitorReducer, { applyMonitorSettings } from './monitorSlice';
import { DEFAULT_MONITOR_SETTINGS } from '../monitor/types';

const seededState = () =>
  monitorReducer(
    undefined,
    applyMonitorSettings({
      ...DEFAULT_MONITOR_SETTINGS,
      radarMode: 'site',
      radarSite: 'KTLX',
      radarOpacity: 0.8,
      alertsEnabled: false,
      alertsOpacity: 0.25,
      animationEnabled: true,
      animationSpeedMs: 400,
      mapView: { center: [35, -97], zoom: 7 },
      referenceLayers: { spcMesoscaleDiscussionEnabled: true },
    }),
  );

describe('monitorSlice applyMonitorSettings', () => {
  test('starts from the normalized default settings', () => {
    expect(monitorReducer(undefined, { type: 'unknown' })).toEqual(DEFAULT_MONITOR_SETTINGS);
  });

  test('keeps the remaining settings when the payload is partial', () => {
    const next = monitorReducer(seededState(), applyMonitorSettings({ radarMode: 'mrms-conus' }));

    expect(next.radarMode).toBe('mrms-conus');
    expect(next.radarSite).toBe('KTLX');
    expect(next.radarOpacity).toBe(0.8);
    expect(next.alertsEnabled).toBe(false);
    expect(next.alertsOpacity).toBe(0.25);
    expect(next.animationEnabled).toBe(true);
    expect(next.animationSpeedMs).toBe(400);
    expect(next.mapView).toEqual({ center: [35, -97], zoom: 7 });
    expect(next.referenceLayers).toEqual({ spcMesoscaleDiscussionEnabled: true });
  });

  test('preserves live values for fields the partial payload leaves undefined', () => {
    const next = monitorReducer(
      seededState(),
      applyMonitorSettings({
        radarMode: 'site',
        alertsEnabled: undefined,
        mapView: undefined,
        referenceLayers: undefined,
      }),
    );

    expect(next.radarMode).toBe('site');
    expect(next.alertsEnabled).toBe(false);
    expect(next.mapView).toEqual({ center: [35, -97], zoom: 7 });
    expect(next.referenceLayers).toEqual({ spcMesoscaleDiscussionEnabled: true });
  });

  test('still applies and normalizes a complete settings payload', () => {
    const next = monitorReducer(
      seededState(),
      applyMonitorSettings({
        ...DEFAULT_MONITOR_SETTINGS,
        radarMode: 'site',
        radarSite: 'koax',
        alertsOpacity: 5,
        animationSpeedMs: 10,
        mapView: { center: [41, -96], zoom: 6 },
      }),
    );

    expect(next.radarMode).toBe('site');
    expect(next.radarSite).toBe('KOAX');
    expect(next.alertsOpacity).toBe(1);
    expect(next.animationSpeedMs).toBe(150);
    expect(next.mapView).toEqual({ center: [41, -96], zoom: 6 });
    expect(next.alertsEnabled).toBe(DEFAULT_MONITOR_SETTINGS.alertsEnabled);
  });

  test('falls back to defaults for out-of-contract partial values', () => {
    const next = monitorReducer(
      seededState(),
      applyMonitorSettings({ radarMode: 'not-a-mode' } as never),
    );

    expect(next.radarMode).toBe(DEFAULT_MONITOR_SETTINGS.radarMode);
    expect(next.radarSite).toBe('KTLX');
  });
});
