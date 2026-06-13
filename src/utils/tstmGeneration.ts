import type { Feature } from 'geojson';
<<<<<<< HEAD
import type { TstmGenerationRequest, TstmGenerationResponse } from '../types/tstmGeneration';
=======
import type { DayType } from '../types/outlooks';
import type {
  TstmGenerationRequest,
  TstmGenerationResponse,
} from '../types/tstmGeneration';
>>>>>>> 0d5d372 (feat(auto-tstm): preserve hidden client boundary)

const TSTM_GENERATION_ENDPOINT = '/api/tstm/generate';

/** Returns true when SPC calibrated thunder can cover the given outlook day. */
export const canGenerateTstmForDay = (day: number): boolean => day === 1 || day === 2;

/** Normalizes generated polygons so they can enter the existing editable categorical/TSTM flow. */
export const normalizeGeneratedTstmFeatures = (features: Feature[]): Feature[] =>
<<<<<<< HEAD
  features.map((feature, index) => ({
    ...feature,
    id: feature.id ?? `generated-tstm-${index}`,
    properties: {
      ...feature.properties,
      outlookType: 'categorical',
      probability: 'TSTM',
      isSignificant: false,
      derivedFrom: 'spc-calibrated-thunder',
      originalProbability: 'TSTM',
    },
  }));

/** Calls the server-side SPC calibrated thunder generator and returns normalized editable TSTM features. */
export const generateTstmLines = async (
  request: TstmGenerationRequest
=======
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
  `${request.cycleDate}:day-${request.day}:${request.validDate ?? ''}:${request.issuanceTime ?? ''}`;

/** Returns true only when a response still belongs to the active forecast context. */
export const isCurrentTstmRequest = (
  request: TstmGenerationRequest,
  activeRequest: TstmGenerationRequest
): boolean => getTstmRequestIdentity(request) === getTstmRequestIdentity(activeRequest);

/** Validates and normalizes a cached Auto-TSTM API response. */
export const parseTstmGenerationResponse = (payload: unknown): TstmGenerationResponse => {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Auto-TSTM returned an invalid response.');
  }
  const response = payload as Partial<TstmGenerationResponse>;
  if (
    typeof response.run !== 'string' ||
    typeof response.effectiveStart !== 'string' ||
    typeof response.effectiveEnd !== 'string' ||
    !Array.isArray(response.features) ||
    !Array.isArray(response.forecastHours) ||
    !Array.isArray(response.warnings)
  ) {
    throw new Error('Auto-TSTM returned an invalid response.');
  }
  return {
    ...response,
    domain: typeof response.domain === 'string' ? response.domain : 'conus',
    thresholds: response.thresholds ?? {
      calibratedThunderCoreProbability: 0.3,
      calibratedThunderSupportProbability: 0.1,
    },
    sources: response.sources ?? {},
    generatedAt: typeof response.generatedAt === 'string' ? response.generatedAt : '',
    features: normalizeGeneratedTstmFeatures(response.features),
  } as TstmGenerationResponse;
};

/** Requests cached guidance. No UI calls this function while the capability remains disabled. */
export const requestTstmGeneration = async (
  request: TstmGenerationRequest,
  signal?: AbortSignal
>>>>>>> 0d5d372 (feat(auto-tstm): preserve hidden client boundary)
): Promise<TstmGenerationResponse> => {
  if (!canGenerateTstmForDay(request.day)) {
    throw new Error('SPC calibrated thunder generation is only available for Day 1 and Day 2.');
  }
<<<<<<< HEAD

=======
>>>>>>> 0d5d372 (feat(auto-tstm): preserve hidden client boundary)
  const response = await fetch(TSTM_GENERATION_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
<<<<<<< HEAD
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(typeof payload.error === 'string' ? payload.error : 'Unable to generate TSTM lines right now.');
  }

  return {
    ...payload,
    features: normalizeGeneratedTstmFeatures(Array.isArray(payload.features) ? payload.features : []),
  } as TstmGenerationResponse;
=======
    signal,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = payload && typeof payload.error === 'string'
      ? payload.error
      : 'Auto-TSTM guidance is temporarily unavailable.';
    throw new Error(error);
  }
  return parseTstmGenerationResponse(payload);
>>>>>>> 0d5d372 (feat(auto-tstm): preserve hidden client boundary)
};
