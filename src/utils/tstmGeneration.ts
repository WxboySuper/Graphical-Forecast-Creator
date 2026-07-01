import type { Feature } from 'geojson';
import type { DayType } from '../types/outlooks';
import type {
  TstmGenerationRequest,
  TstmGenerationResponse,
} from '../types/tstmGeneration';
import { markServerCapabilityUnavailable } from '../config/serverCapabilityStatus';

const TSTM_GENERATION_ENDPOINT = '/api/tstm/generate';
const TSTM_CAPABILITY_KEY = 'TSTM_GENERATION_ENABLED';
const DISABLED_CAPABILITY_MESSAGE = 'Auto-TSTM is not enabled on this deployment.';

/** Returns the server error message from an Auto-TSTM API payload when present. */
const readTstmGenerationErrorMessage = (payload: unknown): string | null => {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const error = (payload as { error?: unknown }).error;
  return typeof error === 'string' ? error : null;
};

/** Returns the error message for a failed Auto-TSTM generation request. */
const getTstmGenerationErrorMessage = (payload: unknown): string =>
  readTstmGenerationErrorMessage(payload) ?? 'Auto-TSTM guidance is temporarily unavailable.';

/** Marks the server capability unavailable when the API returns the standard disabled response. */
const handleDisabledTstmCapability = (response: Response, error: string): void => {
  if (response.status === 404 && error === DISABLED_CAPABILITY_MESSAGE) {
    markServerCapabilityUnavailable(TSTM_CAPABILITY_KEY);
  }
};

/** Returns true when SPC calibrated thunder can cover the given outlook day. */
export const canGenerateTstmForDay = (day: DayType): boolean => day === 1 || day === 2;

/** Produces a stable JSON-like value so object key insertion order does not affect equality. */
const sortJsonKeys = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map(sortJsonKeys);
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, sortJsonKeys(entry)])
    );
  }
  return value;
};

/** Compares generated feature arrays without depending on object key insertion order. */
export const areTstmFeaturesEqual = (left: Feature[], right: Feature[]): boolean =>
  JSON.stringify(sortJsonKeys(left)) === JSON.stringify(sortJsonKeys(right));

/** Normalizes generated polygons so they can enter the existing editable categorical/TSTM flow. */
export const normalizeGeneratedTstmFeatures = (features: Feature[]): Feature[] =>
  features
    .filter(
      (feature) =>
        feature.type === 'Feature' &&
        (feature.geometry?.type === 'Polygon' || feature.geometry?.type === 'MultiPolygon')
    )
    .map((feature, index) => ({
      ...feature,
      id: feature.id ?? `generated-tstm-${index}`,
      properties: {
        ...feature.properties,
        outlookType: 'categorical',
        probability: 'TSTM',
        isSignificant: false,
        derivedFrom: 'spc-href-calibrated-thunder',
        originalProbability: 'TSTM',
      },
    }));

/** Identifies the forecast context that owns an asynchronous guidance result. */
export const getTstmRequestIdentity = (request: TstmGenerationRequest): string =>
  [
    request.cycleDate,
    `day-${request.day}`,
    request.issueDate ?? '',
    request.validDate ?? '',
    request.issuanceTime ?? '',
  ].join(':');

/** Returns true only when a response still belongs to the active forecast context. */
export const isCurrentTstmRequest = (
  request: TstmGenerationRequest,
  activeRequest: TstmGenerationRequest
): boolean => getTstmRequestIdentity(request) === getTstmRequestIdentity(activeRequest);

/** Narrows unknown API fields to strings. */
const isString = (value: unknown): value is string => typeof value === 'string';
/** Narrows unknown API fields to arrays. */
const isArray = (value: unknown): value is unknown[] => Array.isArray(value);

/** Checks the required top-level response fields before normalization. */
const hasResponseShape = (
  response: Partial<TstmGenerationResponse>
): response is Partial<TstmGenerationResponse> & Pick<
  TstmGenerationResponse,
  'features' | 'run' | 'forecastHours' | 'effectiveStart' | 'effectiveEnd' | 'warnings'
> => [
  isArray(response.features),
  isString(response.run),
  isArray(response.forecastHours),
  isString(response.effectiveStart),
  isString(response.effectiveEnd),
  isArray(response.warnings),
].every(Boolean);

/** Returns validated probability thresholds or the documented defaults. */
const parseThresholds = (
  thresholds: Partial<TstmGenerationResponse['thresholds']> | undefined
): TstmGenerationResponse['thresholds'] => {
  const core = thresholds?.calibratedThunderCoreProbability;
  const support = thresholds?.calibratedThunderSupportProbability;
  if (typeof core === 'number' && typeof support === 'number') {
    return { calibratedThunderCoreProbability: core, calibratedThunderSupportProbability: support };
  }
  return {
    calibratedThunderCoreProbability: 0.3,
    calibratedThunderSupportProbability: 0.1,
  };
};

/** Validates and normalizes a cached Auto-TSTM API response. */
export const parseTstmGenerationResponse = (payload: unknown): TstmGenerationResponse => {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Auto-TSTM returned an invalid response.');
  }
  const response = payload as Partial<TstmGenerationResponse>;
  if (!hasResponseShape(response)) {
    throw new Error('Auto-TSTM returned an invalid response.');
  }
  return {
    ...response,
    domain: typeof response.domain === 'string' ? response.domain : 'conus',
    thresholds: parseThresholds(response.thresholds),
    sources: response.sources ?? {},
    generatedAt: typeof response.generatedAt === 'string' ? response.generatedAt : '',
    features: normalizeGeneratedTstmFeatures(response.features),
  } as TstmGenerationResponse;
};

/** Requests cached guidance. No UI calls this function while the capability remains disabled. */
export const requestTstmGeneration = async (
  request: TstmGenerationRequest,
  signal?: AbortSignal
): Promise<TstmGenerationResponse> => {
  if (!canGenerateTstmForDay(request.day)) {
    throw new Error('SPC calibrated thunder generation is only available for Day 1 and Day 2.');
  }
  const response = await fetch(TSTM_GENERATION_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
    signal,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = getTstmGenerationErrorMessage(payload);
    handleDisabledTstmCapability(response, error);
    throw new Error(error);
  }
  return parseTstmGenerationResponse(payload);
};

const TSTM_LATEST_ENDPOINT = '/api/tstm/latest';

export type TstmLatestFailureReason = 'cache_miss' | 'cache_stale' | 'unavailable';

/** Reads a machine-readable reason from a cached Auto-TSTM API error payload. */
export const readTstmLatestFailureReason = (payload: unknown): TstmLatestFailureReason | null => {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const reason = (payload as { reason?: unknown }).reason;
  if (reason === 'cache_miss' || reason === 'cache_stale' || reason === 'unavailable') {
    return reason;
  }

  return null;
};

/** Requests the latest pre-cached TSTM data for a given day and period. */
export const requestLatestTstmData = async (
  day: DayType,
  period = 'full',
  signal?: AbortSignal
): Promise<TstmGenerationResponse | null> => {
  if (!canGenerateTstmForDay(day)) return null;
  const response = await fetch(`${TSTM_LATEST_ENDPOINT}?day=${day}&period=${period}`, { signal });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const error = readTstmGenerationErrorMessage(payload);
    if (error) {
      handleDisabledTstmCapability(response, error);
    }
    return null;
  }
  if (!payload) return null;
  try {
    return parseTstmGenerationResponse(payload);
  } catch {
    return null;
  }
};
