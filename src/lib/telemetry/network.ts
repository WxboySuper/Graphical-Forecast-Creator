import type { User } from 'firebase/auth';

const ACTIVE_DAY_KEY = 'gfc-telemetry-active-day';
const DEFAULT_TELEMETRY_BASE_URL = 'https://telemetry.gfcweather.com';

declare const __GFC_TELEMETRY_BASE_URL__: string;

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

export const postTelemetry = (path: string, body?: string, token?: string): void => {
  try {
    const headers: Record<string, string> = {};
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (token) headers.Authorization = `Bearer ${token}`;
    void fetch(`${getTelemetryBaseUrl()}${path}`, {
      method: 'POST',
      headers,
      body,
      keepalive: true,
      credentials: 'omit',
    }).catch(() => undefined);
  } catch {
    // Telemetry never blocks product work.
  }
};

let visitPingSent = false;

export const pingVisit = (): void => {
  if (visitPingSent) return;
  visitPingSent = true;
  postTelemetry('/v1/visit');
};

const getUtcDay = (): string => new Date().toISOString().slice(0, 10);

const isAlreadyCountedToday = (today: string): boolean =>
  localStorage.getItem(ACTIVE_DAY_KEY) === today;

export const pingDailyActive = (user: User | null | undefined): void => {
  if (!user) return;
  try {
    const day = getUtcDay();
    if (isAlreadyCountedToday(day)) return;
    localStorage.setItem(ACTIVE_DAY_KEY, day);
    void user.getIdToken().then((token) => postTelemetry('/v1/active', undefined, token)).catch(() => undefined);
  } catch {
    // No token or no local storage means no active ping.
  }
};
