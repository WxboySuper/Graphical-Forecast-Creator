import type { AuthBackendUser } from '../../auth/AuthBackend';

const ACTIVE_DAY_KEY = 'gfc-telemetry-active-day';
const DEFAULT_TELEMETRY_BASE_URL = 'https://telemetry.gfcweather.com';

declare const __GFC_TELEMETRY_BASE_URL__: string;
declare const __GFC_DEV_MODE__: boolean;

const getTelemetryBaseUrl = (): string => {
  try {
    const configured = typeof __GFC_TELEMETRY_BASE_URL__ === 'string'
      ? __GFC_TELEMETRY_BASE_URL__
      : '';
    return configured ? configured.replace(/\/$/, '') : DEFAULT_TELEMETRY_BASE_URL;
  } catch {
    return DEFAULT_TELEMETRY_BASE_URL;
  }
};

/** Local development builds stay out of the real counts unless a telemetry base URL is configured. */
const isUnconfiguredLocalDev = (): boolean => {
  try {
    const configured = typeof __GFC_TELEMETRY_BASE_URL__ === 'string' && __GFC_TELEMETRY_BASE_URL__ !== '';
    return !configured && typeof __GFC_DEV_MODE__ !== 'undefined' && __GFC_DEV_MODE__ === true;
  } catch {
    return false;
  }
};

export const postTelemetry = (path: string, body?: string, token?: string): Promise<boolean> => {
  if (isUnconfiguredLocalDev()) return Promise.resolve(false);
  try {
    const headers: Record<string, string> = {};
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (token) headers.Authorization = `Bearer ${token}`;
    return fetch(`${getTelemetryBaseUrl()}${path}`, {
      method: 'POST',
      headers,
      body,
      keepalive: true,
      credentials: 'omit',
    }).then((response) => response.ok).catch(() => false);
  } catch {
    // Telemetry never blocks product work.
    return Promise.resolve(false);
  }
};

let visitPingSent = false;

export const pingVisit = (): void => {
  if (visitPingSent) return;
  visitPingSent = true;
  void postTelemetry('/v1/visit');
};

const getUtcDay = (): string => new Date().toISOString().slice(0, 10);

const isAlreadyCountedToday = (today: string): boolean =>
  localStorage.getItem(ACTIVE_DAY_KEY) === today;

let activePingInFlight = false;

const requestDailyActivePing = async (user: AuthBackendUser, day: string): Promise<void> => {
  try {
    const token = await user.getIdToken();
    const sent = await postTelemetry('/v1/active', undefined, token);
    if (sent) localStorage.setItem(ACTIVE_DAY_KEY, day);
  } catch {
    // A later app load retries if authentication or storage fails.
  } finally {
    activePingInFlight = false;
  }
};

export const pingDailyActive = (user: AuthBackendUser | null | undefined): void => {
  if (!user) return;
  try {
    const day = getUtcDay();
    if (isAlreadyCountedToday(day)) return;
    if (activePingInFlight) return;
    activePingInFlight = true;
    void requestDailyActivePing(user, day);
  } catch {
    activePingInFlight = false;
    // No token or no local storage means no active ping.
  }
};
