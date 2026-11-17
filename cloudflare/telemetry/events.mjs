export const ALLOWED_EVENTS = Object.freeze([
  'page_view', 'forecast_created', 'forecast_exported', 'forecast_shared', 'forecast_saved_cloud',
  'mesoscale_layer_opened', 'verification_used', 'map_layer_changed', 'premium_feature_used', 'error_shown',
]);

export const validDetail = (value) => typeof value === 'string' && value.length <= 80 && /^[A-Za-z0-9 _:./-]*$/.test(value);
export const validVersion = (value) => typeof value === 'string' && value.length <= 40 && /^\d+\.\d+(?:\.\d+)?(?:-[A-Za-z0-9.-]+)?$/.test(value);

export function validateEvent(body) {
  if (Object.keys(body).some((key) => !['event', 'detail', 'version'].includes(key))) return null;
  if (!ALLOWED_EVENTS.includes(body.event) || !validVersion(body.version)) return null;
  if (body.detail !== undefined && !validDetail(body.detail)) return null;
  return { event: body.event, detail: body.detail ?? '', version: body.version };
}
