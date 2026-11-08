import type {
  MesoscaleDisplayType,
  MesoscaleFrameType,
  MesoscaleLevel,
  MesoscaleLevelType,
  MesoscaleModelId,
  MesoscaleParameterResponse,
  MesoscaleSourceMetadata,
  NormalizedMesoscaleParameters,
} from './contracts';

const displayTypes = new Set<MesoscaleDisplayType>(['raster', 'contour', 'vector', 'scalar']);
const levelTypes = new Set<MesoscaleLevelType>(['surface', 'pressure', 'height', 'depth', 'layer', 'model']);
const modelIds = new Set<MesoscaleModelId>(['hrrr', 'rap', 'rrfs']);
const frameTypes = new Set<MesoscaleFrameType>(['analysis', 'forecast']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function validTime(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

function isLevel(value: unknown): value is MesoscaleLevel {
  if (!isRecord(value) || !levelTypes.has(value.type as MesoscaleLevelType) || !nonEmptyString(value.label)) {
    return false;
  }
  return ['value', 'top', 'bottom'].every(key => value[key] === undefined || Number.isFinite(value[key]))
    && (value.units === undefined || typeof value.units === 'string');
}

function isSource(value: unknown): value is MesoscaleSourceMetadata {
  return isRecord(value)
    && nonEmptyString(value.providerId)
    && nonEmptyString(value.providerName)
    && nonEmptyString(value.datasetId)
    && nonEmptyString(value.attribution)
    && (value.url === undefined || nonEmptyString(value.url));
}

function isLegend(value: unknown): value is Array<{ value: number; label: string; color?: string }> {
  return Array.isArray(value) && value.every(stop => isRecord(stop)
    && Number.isFinite(stop.value)
    && nonEmptyString(stop.label)
    && (stop.color === undefined || nonEmptyString(stop.color)));
}

function malformed<TData = unknown>(message: string): MesoscaleParameterResponse<TData> {
  return { state: 'malformed', message };
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

  if (payload.state === 'loading') return { state: 'loading' };
  if (payload.state === 'upstream-failure') {
    return {
      state: 'upstream-failure',
      message: nonEmptyString(payload.message) ? payload.message : 'Provider request failed.',
      retryable: payload.retryable !== false,
    };
  }

  if (payload.schemaVersion !== 1) return malformed('Unsupported or missing provider payload schema version.');

  if (!isRecord(payload.model) || !modelIds.has(payload.model.id as MesoscaleModelId) || !nonEmptyString(payload.model.name)) {
    return malformed('Model metadata is missing or invalid.');
  }
  if (!isRecord(payload.model.capabilities)
    || !Array.isArray(payload.model.capabilities.availableParameterIds)
    || !payload.model.capabilities.availableParameterIds.every(nonEmptyString)
    || new Set(payload.model.capabilities.availableParameterIds).size !== payload.model.capabilities.availableParameterIds.length
    || !Number.isInteger(payload.model.capabilities.maxForecastHour)
    || (payload.model.capabilities.maxForecastHour as number) < 0
    || !Number.isInteger(payload.model.capabilities.cycleCadenceMinutes)
    || (payload.model.capabilities.cycleCadenceMinutes as number) <= 0) {
    return malformed('Model capabilities are missing or invalid.');
  }
  if (!frameTypes.has(payload.frameType as MesoscaleFrameType)) return malformed('Frame type must be analysis or forecast.');
  if (!validTime(payload.cycleTime)) return malformed('Cycle time must be a valid timestamp.');
  if (!Number.isInteger(payload.forecastHour) || (payload.forecastHour as number) < 0) {
    return malformed('Forecast hour must be a non-negative integer.');
  }
  if ((payload.frameType === 'analysis' && payload.forecastHour !== 0)
    || (payload.frameType === 'forecast' && (payload.forecastHour as number) === 0)) {
    return malformed('Analysis frames must be f00 and forecast frames must be after f00.');
  }
  if ((payload.forecastHour as number) > (payload.model.capabilities.maxForecastHour as number)) {
    return malformed('Forecast hour exceeds this model capability.');
  }
  if (!validTime(payload.validTime)) return malformed('Valid time must be a valid timestamp.');
  if (!isRecord(payload.domain) || !nonEmptyString(payload.domain.id) || !nonEmptyString(payload.domain.name)) {
    return malformed('Domain metadata is missing or invalid.');
  }
  if (payload.domain.bounds !== undefined && (!Array.isArray(payload.domain.bounds)
    || payload.domain.bounds.length !== 4
    || !payload.domain.bounds.every(Number.isFinite))) {
    return malformed('Domain bounds must contain four finite coordinates.');
  }
  if (!isSource(payload.source)) return malformed('Source metadata and attribution are required.');
  if (!Array.isArray(payload.parameters)) return malformed('Parameters must be an array.');

  const seenIds = new Set<string>();
  const parameters: NormalizedMesoscaleParameters<TData>['parameters'] = [];
  for (const item of payload.parameters) {
    if (!isRecord(item) || !nonEmptyString(item.id) || seenIds.has(item.id)) {
      return malformed('Parameter entries must have unique, non-empty identities.');
    }
    if (!(payload.model.capabilities.availableParameterIds as string[]).includes(item.id)) {
      return malformed(`Parameter "${item.id}" is not listed in this model's capabilities.`);
    }
    seenIds.add(item.id);
    if (!nonEmptyString(item.displayName) || typeof item.units !== 'string' || !isLevel(item.level)
      || !isLegend(item.legend) || !displayTypes.has(item.displayType as MesoscaleDisplayType)
      || item.data === undefined || item.data === null) {
      return malformed(`Parameter "${item.id}" has invalid metadata or no provider value.`);
    }
    parameters.push({
      definition: {
        id: item.id,
        displayName: item.displayName,
        units: item.units,
        level: item.level,
        legend: item.legend,
        displayType: item.displayType as MesoscaleDisplayType,
      },
      data: item.data as TData,
    });
  }

  const unavailableParameters: Array<{ id: string; reason?: string }> = [];
  if (payload.unavailableParameters !== undefined) {
    if (!Array.isArray(payload.unavailableParameters)) return malformed('Unavailable parameters must be an array.');
    for (const item of payload.unavailableParameters) {
      if (!isRecord(item) || !nonEmptyString(item.id) || seenIds.has(item.id)) {
        return malformed('Unavailable parameter entries must have unique, non-empty identities.');
      }
      seenIds.add(item.id);
      if (item.reason !== undefined && typeof item.reason !== 'string') {
        return malformed(`Unavailable parameter "${item.id}" has an invalid reason.`);
      }
      unavailableParameters.push({ id: item.id, ...(item.reason ? { reason: item.reason } : {}) });
    }
  }
  if (payload.requestedParameterIds !== undefined) {
    if (!Array.isArray(payload.requestedParameterIds)
      || !payload.requestedParameterIds.every(nonEmptyString)
      || new Set(payload.requestedParameterIds).size !== payload.requestedParameterIds.length) {
      return malformed('Requested parameter identities must be unique non-empty strings.');
    }
    for (const id of payload.requestedParameterIds) {
      if (!seenIds.has(id)) unavailableParameters.push({ id, reason: 'Not supplied by provider.' });
    }
  }

  const now = options.now instanceof Date ? options.now.getTime() : options.now ?? Date.now();
  if (!Number.isFinite(now) || (options.staleAfterMs !== undefined
    && (!Number.isFinite(options.staleAfterMs) || options.staleAfterMs < 0))) {
    return malformed('Normalization time and staleness threshold must be finite values.');
  }
  const ageMs = now - Date.parse(payload.validTime);
  const staleThresholdMs = options.staleAfterMs;
  const stale = payload.stale === true || (staleThresholdMs !== undefined && ageMs > staleThresholdMs);
  const completeness = unavailableParameters.length > 0 ? 'partial' : 'complete';
  const data: NormalizedMesoscaleParameters<TData> = {
    model: {
      id: payload.model.id as MesoscaleModelId,
      name: payload.model.name,
      capabilities: payload.model.capabilities as unknown as NormalizedMesoscaleParameters<TData>['model']['capabilities'],
    },
    frameType: payload.frameType as MesoscaleFrameType,
    cycleTime: payload.cycleTime,
    forecastHour: payload.forecastHour as number,
    forecastHourLabel: `f${String(payload.forecastHour).padStart(2, '0')}`,
    validTime: payload.validTime,
    ageMs,
    domain: {
      id: payload.domain.id,
      name: payload.domain.name,
      ...(payload.domain.bounds ? { bounds: payload.domain.bounds as [number, number, number, number] } : {}),
    },
    source: payload.source,
    parameters,
    unavailableParameters,
    completeness,
    stale,
  };

  return { state: stale ? 'stale' : completeness === 'partial' ? 'partial' : 'ready', ...data };
}
