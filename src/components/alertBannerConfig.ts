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

const parseInstant = (value: string | undefined): number | null => {
  if (!value?.trim()) {
    return null;
  }
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
};

/** Returns false when enabled is off or the current time is outside startsAt/expiresAt. */
export const isAlertBannerScheduleActive = (
  config: Pick<AlertBannerConfig, 'enabled' | 'startsAt' | 'expiresAt'>,
  nowMs: number = Date.now(),
): boolean => {
  if (!config.enabled) {
    return false;
  }

  const startsAtMs = parseInstant(config.startsAt);
  if (startsAtMs !== null && nowMs < startsAtMs) {
    return false;
  }

  const expiresAtMs = parseInstant(config.expiresAt);
  if (expiresAtMs !== null && nowMs >= expiresAtMs) {
    return false;
  }

  return true;
};

/** Normalizes fetched JSON into a full config object. */
export const normalizeAlertBannerConfig = (data: unknown): AlertBannerConfig => {
  if (!data || typeof data !== 'object') {
    return { ...DEFAULT_ALERT_BANNER_CONFIG };
  }

  const raw = data as Record<string, unknown>;
  const type = raw.type;
  const allowedType =
    type === 'info' || type === 'warning' || type === 'error' ? type : DEFAULT_ALERT_BANNER_CONFIG.type;

  return {
    enabled: raw.enabled === true,
    message: typeof raw.message === 'string' ? raw.message : '',
    type: allowedType,
    dismissible: raw.dismissible !== false,
    id: typeof raw.id === 'string' ? raw.id : undefined,
    linkUrl: typeof raw.linkUrl === 'string' ? raw.linkUrl : undefined,
    linkLabel: typeof raw.linkLabel === 'string' ? raw.linkLabel : undefined,
    startsAt: typeof raw.startsAt === 'string' ? raw.startsAt : undefined,
    expiresAt: typeof raw.expiresAt === 'string' ? raw.expiresAt : undefined,
  };
};
