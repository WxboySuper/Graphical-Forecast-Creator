import type { TstmGenerationRequest, TstmGenerationResponse } from '../types/tstmGeneration';
import { isCurrentTstmRequest } from '../utils/tstmGeneration';

export type TstmFetchResolution =
  | { kind: 'aborted' }
  | { kind: 'stale' }
  | { kind: 'unavailable' }
  | { kind: 'error'; message: string }
  | { kind: 'preview'; request: TstmGenerationRequest; response: TstmGenerationResponse };

/** Resolves a cached Auto-TSTM fetch into a preview-safe outcome. */
export const resolveTstmFetchOutcome = (
  request: TstmGenerationRequest,
  activeRequest: TstmGenerationRequest | null,
  response: TstmGenerationResponse | null,
  aborted: boolean,
  error: unknown
): TstmFetchResolution => {
  if (aborted) {
    return { kind: 'aborted' };
  }
  if (!isCurrentTstmRequest(request, activeRequest ?? request)) {
    return { kind: 'stale' };
  }
  if (error) {
    return {
      kind: 'error',
      message: error instanceof Error ? error.message : 'Auto-TSTM guidance is temporarily unavailable.',
    };
  }
  if (!response) {
    return { kind: 'unavailable' };
  }
  return { kind: 'preview', request, response };
};
