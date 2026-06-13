import type { Feature } from 'geojson';
import type { TstmGenerationRequest, TstmGenerationResponse } from '../types/tstmGeneration';

const TSTM_GENERATION_ENDPOINT = '/api/tstm/generate';

/** Returns true when SPC calibrated thunder can cover the given outlook day. */
export const canGenerateTstmForDay = (day: number): boolean => day === 1 || day === 2;

/** Normalizes generated polygons so they can enter the existing editable categorical/TSTM flow. */
export const normalizeGeneratedTstmFeatures = (features: Feature[]): Feature[] =>
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
): Promise<TstmGenerationResponse> => {
  if (!canGenerateTstmForDay(request.day)) {
    throw new Error('SPC calibrated thunder generation is only available for Day 1 and Day 2.');
  }

  const response = await fetch(TSTM_GENERATION_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(typeof payload.error === 'string' ? payload.error : 'Unable to generate TSTM lines right now.');
  }

  return {
    ...payload,
    features: normalizeGeneratedTstmFeatures(Array.isArray(payload.features) ? payload.features : []),
  } as TstmGenerationResponse;
};
