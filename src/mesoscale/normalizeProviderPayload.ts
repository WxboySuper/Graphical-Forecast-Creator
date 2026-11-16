import type {
  MesoscaleDisplayType,
  MesoscaleFrameType,
  MesoscaleLevel,
  MesoscaleParameterResponse,
  MesoscaleSourceMetadata,
  NormalizedMesoscaleParameters,
} from './contracts';
import { getProviderPayloadError, isRecord } from './providerPayloadValidation';

interface RawParameter {
  id: string;
  displayName: string;
  units: string;
  level: MesoscaleLevel;
  legend: NormalizedMesoscaleParameters['parameters'][number]['definition']['legend'];
  displayType: MesoscaleDisplayType;
  data: unknown;
  metadata?: Record<string, unknown>;
}

interface RawUnavailableParameter {
  id: string;
  reason?: string;
}

function malformed<TData = unknown>(message: string): MesoscaleParameterResponse<TData> {
  return { state: 'malformed', message };
}

function readControlState<TData>(payload: Record<string, unknown>): MesoscaleParameterResponse<TData> | undefined {
  if (payload.state === 'loading') return { state: 'loading' };
  if (payload.state === 'upstream-failure') {
    return {
      state: 'upstream-failure',
      message: typeof payload.message === 'string' && payload.message.trim() ? payload.message : 'Provider request failed.',
      retryable: payload.retryable !== false,
    };
  }
  return undefined;
}

function getUnavailableParameters(payload: Record<string, unknown>): RawUnavailableParameter[] {
  const supplied = payload.parameters as RawParameter[];
  const declaredUnavailable = (payload.unavailableParameters ?? []) as RawUnavailableParameter[];
  const knownIds = new Set([...supplied.map(parameter => parameter.id), ...declaredUnavailable.map(parameter => parameter.id)]);
  const omitted = ((payload.requestedParameterIds ?? []) as string[])
    .filter(id => !knownIds.has(id))
    .map(id => ({ id, reason: 'Not supplied by provider.' }));
  return [...declaredUnavailable, ...omitted];
}

function getNormalizationOptionsError(options: { now?: Date | number; staleAfterMs?: number }): string | undefined {
  const now = options.now instanceof Date ? options.now.getTime() : options.now ?? Date.now();
  const validNow = Number.isFinite(now);
  const validThreshold = options.staleAfterMs === undefined
    || (Number.isFinite(options.staleAfterMs) && options.staleAfterMs >= 0);
  return validNow && validThreshold ? undefined : 'Normalization time and staleness threshold must be finite values.';
}

function normalizeValidPayload<TData>(
  payload: Record<string, unknown>,
  options: { now?: Date | number; staleAfterMs?: number },
): MesoscaleParameterResponse<TData> {
  const now = options.now instanceof Date ? options.now.getTime() : options.now ?? Date.now();
  const validTime = payload.validTime as string;
  const ageMs = now - Date.parse(validTime);
  const stale = payload.stale === true || (options.staleAfterMs !== undefined && ageMs > options.staleAfterMs);
  const unavailableParameters = getUnavailableParameters(payload);
  const completeness = unavailableParameters.length ? 'partial' : 'complete';
  const parameters = (payload.parameters as RawParameter[]).map(parameter => ({
    definition: {
      id: parameter.id,
      displayName: parameter.displayName,
      units: parameter.units,
      level: parameter.level,
      legend: parameter.legend,
      displayType: parameter.displayType,
      metadata: parameter.metadata,
    },
    data: parameter.data as TData,
  }));
  const normalized: NormalizedMesoscaleParameters<TData> = {
    model: payload.model as NormalizedMesoscaleParameters['model'],
    frameType: payload.frameType as MesoscaleFrameType,
    cycleTime: payload.cycleTime as string,
    forecastHour: payload.forecastHour as number,
    forecastHourLabel: `f${String(payload.forecastHour).padStart(2, '0')}`,
    validTime,
    ageMs,
    domain: payload.domain as NormalizedMesoscaleParameters['domain'],
    source: payload.source as MesoscaleSourceMetadata,
    parameters,
    unavailableParameters,
    completeness,
    stale,
  };

  const state = stale ? 'stale' : completeness === 'partial' ? 'partial' : 'ready';
  return { state, ...normalized };
}

/**
 * Normalizes the adapter boundary shape. It validates context and presentation metadata,
 * while preserving parameter data verbatim. It does not calculate or convert fields.
 */
export function normalizeProviderPayload<TData = unknown>(
  payload: unknown,
  options: { now?: Date | number; staleAfterMs?: number } = {},
): MesoscaleParameterResponse<TData> {
  if (!isRecord(payload)) return malformed('Provider payload must be an object.');
  const controlState = readControlState<TData>(payload);
  if (controlState) return controlState;
  const payloadError = getProviderPayloadError(payload);
  if (payloadError) return malformed(payloadError);
  const optionsError = getNormalizationOptionsError(options);
  if (optionsError) return malformed(optionsError);
  return normalizeValidPayload<TData>(payload, options);
}
