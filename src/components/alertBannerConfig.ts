export type AlertBannerType = 'info' | 'warning' | 'error';

export interface AlertBannerConfig {
  enabled: boolean;
  message: string;
  type: AlertBannerType;
  dismissible: boolean;
  id?: string;
  linkUrl?: string;
  linkLabel?: string;
  startsAt?: string;
  expiresAt?: string;
}

export const DEFAULT_ALERT_BANNER_CONFIG: AlertBannerConfig = {
  enabled: false,
  message: '',
  type: 'info',
  dismissible: true,
};

/** Parses an ISO timestamp string, returning null when missing or invalid. */
function parseInstant(value: string | undefined): number | null {
  if (!value?.trim()) {
    return null;
  }
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
}

/** Returns whether `nowMs` falls inside optional startsAt/expiresAt bounds. */
function isWithinScheduleWindow(startsAt: string | undefined, expiresAt: string | undefined, nowMs: number): boolean {
  const startsAtMs = parseInstant(startsAt);
  if (startsAtMs !== null && nowMs < startsAtMs) {
    return false;
  }

  const expiresAtMs = parseInstant(expiresAt);
  return expiresAtMs === null || nowMs < expiresAtMs;
}

/** Returns false when enabled is off or the current time is outside startsAt/expiresAt. */
export function isAlertBannerScheduleActive(
  config: Pick<AlertBannerConfig, 'enabled' | 'startsAt' | 'expiresAt'>,
  nowMs: number = Date.now(),
): boolean {
  return config.enabled && isWithinScheduleWindow(config.startsAt, config.expiresAt, nowMs);
}

function readOptionalString(raw: Record<string, unknown>, key: string): string | undefined {
  return typeof raw[key] === 'string' ? (raw[key] as string) : undefined;
}

function readAlertType(raw: Record<string, unknown>): AlertBannerType {
  const type = raw.type;
  if (type === 'info' || type === 'warning' || type === 'error') {
    return type;
  }
  return DEFAULT_ALERT_BANNER_CONFIG.type;
}

/** Normalizes fetched JSON into a full config object. */
export function normalizeAlertBannerConfig(data: unknown): AlertBannerConfig {
  if (!data || typeof data !== 'object') {
    return { ...DEFAULT_ALERT_BANNER_CONFIG };
  }

  const raw = data as Record<string, unknown>;

  return {
    enabled: raw.enabled === true,
    message: typeof raw.message === 'string' ? raw.message : '',
    type: readAlertType(raw),
    dismissible: raw.dismissible !== false,
    id: readOptionalString(raw, 'id'),
    linkUrl: readOptionalString(raw, 'linkUrl'),
    linkLabel: readOptionalString(raw, 'linkLabel'),
    startsAt: readOptionalString(raw, 'startsAt'),
    expiresAt: readOptionalString(raw, 'expiresAt'),
  };
}
