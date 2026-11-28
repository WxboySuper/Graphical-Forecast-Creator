import { getTelemetryConsent } from './consent';
import { postTelemetry } from './network';

export const TELEMETRY_EVENTS = [
  'page_view', 'forecast_created', 'first_shape_drawn', 'forecast_exported', 'forecast_shared',
  'forecast_saved_cloud', 'mesoscale_layer_opened', 'mesoscale_workspace_opened', 'verification_used',
  'map_layer_changed', 'premium_feature_used', 'error_shown',
] as const;

export type TelemetryEvent = (typeof TELEMETRY_EVENTS)[number];
const eventSet = new Set<string>(TELEMETRY_EVENTS);
const DETAIL_PATTERN = /^[A-Za-z0-9 _:./-]{1,80}$/;

export const isAllowedTelemetryEvent = (event: unknown): event is TelemetryEvent =>
  typeof event === 'string' && eventSet.has(event);

export const isSafeTelemetryDetail = (detail: unknown): detail is string =>
  typeof detail === 'string' && DETAIL_PATTERN.test(detail);

const getAppVersion = (): string =>
  typeof __GFC_APP_VERSION__ === 'string' ? __GFC_APP_VERSION__ : 'unknown';

declare const __GFC_APP_VERSION__: string;

export const trackEvent = (event: TelemetryEvent, detail?: string): void => {
  if (getTelemetryConsent() !== 'granted') return;
  if (!isAllowedTelemetryEvent(event)) return;
  if (detail !== undefined && !isSafeTelemetryDetail(detail)) return;

  const payload: { event: TelemetryEvent; detail?: string; version: string } = {
    event,
    version: getAppVersion(),
  };
  if (detail !== undefined) payload.detail = detail;
  postTelemetry('/v1/event', JSON.stringify(payload));
};
