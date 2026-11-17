import { getTelemetryConsent, pageNameForPath, pingDailyActive, pingVisit, setTelemetryConsent, TELEMETRY_CONSENT_KEY, trackEvent, useTelemetryConsent } from './index';
import { act, renderHook } from '@testing-library/react';
import type { User } from 'firebase/auth';

const fetchMock = jest.fn().mockResolvedValue({ ok: true });
const appVersion = globalThis as typeof globalThis & { __GFC_APP_VERSION__?: string };

beforeEach(() => {
  setTelemetryConsent('unset');
  localStorage.clear();
  fetchMock.mockClear();
  globalThis.fetch = fetchMock;
  appVersion.__GFC_APP_VERSION__ = '2.0.0';
});

afterEach(() => {
  jest.restoreAllMocks();
});

afterEach(() => {
  Reflect.deleteProperty(appVersion, '__GFC_APP_VERSION__');
});

test('keeps opt-in events silent until consent is granted', () => {
  trackEvent('forecast_created');
  expect(fetchMock).not.toHaveBeenCalled();
  setTelemetryConsent('denied');
  trackEvent('forecast_created');
  expect(fetchMock).not.toHaveBeenCalled();
});

test('migrates an old opt-in and leaves old opt-outs unset', () => {
  localStorage.setItem('gfc-analytics-enabled', 'true');
  expect(getTelemetryConsent()).toBe('granted');
  expect(localStorage.getItem(TELEMETRY_CONSENT_KEY)).toBe('granted');
  expect(localStorage.getItem('gfc-analytics-enabled')).toBeNull();
  localStorage.clear();
  localStorage.setItem('gfc-analytics-enabled', 'false');
  expect(getTelemetryConsent()).toBe('unset');
  expect(localStorage.getItem('gfc-analytics-enabled')).toBeNull();
});

test('syncs consent changes from another tab', () => {
  const { result } = renderHook(() => useTelemetryConsent());
  localStorage.setItem(TELEMETRY_CONSENT_KEY, 'granted');
  act(() => window.dispatchEvent(new StorageEvent('storage', { key: TELEMETRY_CONSENT_KEY })));
  expect(result.current[0]).toBe('granted');
});

test('sends only allowlisted event, short safe detail and app version', () => {
  setTelemetryConsent('granted');
  trackEvent('page_view', 'forecast');
  expect(fetchMock).toHaveBeenCalledWith('https://telemetry.gfcweather.com/v1/event', expect.objectContaining({
    method: 'POST', keepalive: true, credentials: 'omit',
    body: JSON.stringify({ event: 'page_view', version: '2.0.0', detail: 'forecast' }),
  }));
});

test('rejects unsupported events and unsafe details without attaching arbitrary fields', () => {
  setTelemetryConsent('granted');
  trackEvent('workflow_complete' as never);
  trackEvent('page_view', 'forecast?uid=abc');
  trackEvent('page_view', { event: 'error_shown', uid: 'private-user' } as never);
  expect(fetchMock).not.toHaveBeenCalled();
});

test('omits cookies and user identity from daily active telemetry', async () => {
  const user = { uid: 'private-user-id', getIdToken: jest.fn().mockResolvedValue('firebase-token') } as unknown as User;
  pingDailyActive(user);
  pingDailyActive(user);
  await Promise.resolve();
  expect(user.getIdToken).toHaveBeenCalledTimes(1);
  expect(fetchMock).toHaveBeenCalledWith('https://telemetry.gfcweather.com/v1/active', expect.objectContaining({
    method: 'POST', keepalive: true, credentials: 'omit', body: undefined,
    headers: { Authorization: 'Bearer firebase-token' },
  }));
  expect(localStorage.getItem('gfc-telemetry-active-day')).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  expect(localStorage.getItem('gfc-telemetry-active-day')).not.toContain('private-user-id');
});

test('normalizes routes to names and never exposes path parameters', () => {
  expect(pageNameForPath('/forecast/secret-cycle-id?token=secret')).toBe('forecast');
  expect(pageNameForPath('/forecast/mesoscale')).toBe('mesoscale');
});

test('sends one consent-free visit ping per page load', () => {
  pingVisit();
  pingVisit();
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(fetchMock).toHaveBeenCalledWith('https://telemetry.gfcweather.com/v1/visit', expect.objectContaining({
    method: 'POST', keepalive: true, credentials: 'omit', body: undefined,
  }));
});

test('swallows synchronous and asynchronous transport failures', async () => {
  setTelemetryConsent('granted');
  fetchMock.mockRejectedValueOnce(new Error('offline'));
  expect(() => trackEvent('forecast_created')).not.toThrow();
  await Promise.resolve();
  fetchMock.mockImplementationOnce(() => { throw new Error('offline'); });
  expect(() => trackEvent('forecast_created')).not.toThrow();
});
