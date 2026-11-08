import { normalizeProviderPayload } from './normalizeProviderPayload';
import type { MesoscaleParameterResponse } from './contracts';
import type { MesoscaleCatalog } from './catalogContracts';
import { isValidCatalogDomain } from './catalogAdapter';
import { isRecord } from './providerPayloadValidation';

const isUnavailableParameter = (value: unknown): boolean => isRecord(value)
  && typeof value.id === 'string'
  && (value.reason === undefined || typeof value.reason === 'string');

const hasParameterSource = (value: unknown): boolean => {
  if (!isRecord(value) || !isRecord(value.source)) return false;
  if (typeof value.source.providerId !== 'string') return false;
  if (typeof value.source.providerName !== 'string') return false;
  if (typeof value.source.datasetId !== 'string') return false;
  return typeof value.source.attribution === 'string';
};

const validUnavailableLists = (catalog: MesoscaleCatalog, frameIndex: number): boolean => {
  const frame = catalog.frames[frameIndex];
  if (!frame) return false;
  const frameUnavailable = frame.unavailableParameters;
  const catalogUnavailable = catalog.unavailableParameters;
  if (frameUnavailable !== undefined && !Array.isArray(frameUnavailable)) return false;
  if (catalogUnavailable !== undefined && !Array.isArray(catalogUnavailable)) return false;
  return [...(frameUnavailable ?? []), ...(catalogUnavailable ?? [])].every(isUnavailableParameter);
};

const getFrameError = (catalog: MesoscaleCatalog, frameIndex: number): string | undefined => {
  if (!isValidCatalogDomain(catalog.domain)) return 'Catalog domain metadata is invalid.';
  if (!Array.isArray(catalog.frames)) return 'Catalog frames are invalid.';
  const frame = catalog.frames[frameIndex];
  if (!frame) return 'Catalog frame is missing.';
  if (!Array.isArray(frame.parameters)) return 'Catalog frame parameters are invalid.';
  if (!frame.parameters.every(hasParameterSource)) return 'Catalog parameter source metadata is invalid.';
  if (!validUnavailableLists(catalog, frameIndex)) return 'Catalog unavailable parameters are invalid.';
  return undefined;
};

const getUnavailableParameters = (catalog: MesoscaleCatalog, frame: MesoscaleCatalog['frames'][number]) => {
  const declaredUnavailable = frame.unavailableParameters ?? catalog.unavailableParameters ?? [];
  const failedParameters = frame.parameters.filter(parameter => parameter.status === 'failed');
  const failedIds = new Set(declaredUnavailable.map(parameter => parameter.id));
  const unavailableParameters = [...declaredUnavailable, ...failedParameters
    .filter(parameter => !failedIds.has(parameter.id))
    .map(parameter => ({ id: parameter.id, reason: 'Catalog parameter is marked failed.' }))];
  const partial = frame.status === 'partial' || failedParameters.length > 0
    || frame.parameters.some(parameter => parameter.status === 'partial');
  return { unavailableParameters, partial };
};

const toProviderPayload = (catalog: MesoscaleCatalog, frame: MesoscaleCatalog['frames'][number], unavailableParameters: Array<{ id: string; reason?: string }>, now: number) => ({
    schemaVersion: 1,
    model: {
      ...catalog.model,
      capabilities: {
        availableParameterIds: catalog.frames.flatMap(item => item.parameters.map(value => value.id)).filter((id, index, ids) => ids.indexOf(id) === index),
        maxForecastHour: Math.max(...catalog.frames.map(item => item.forecastHour)),
      },
    },
    frameType: frame.frameType,
    cycleTime: catalog.cycleTime,
    forecastHour: frame.forecastHour,
    validTime: frame.validTime,
    domain: { id: catalog.domain.id, name: catalog.domain.name, bounds: catalog.domain.bounds },
    source: catalog.source ?? frame.parameters[0]?.source,
    parameters: frame.parameters.filter(parameter => parameter.status !== 'failed').map(parameter => ({ id: parameter.id, displayName: parameter.displayName, units: parameter.units, level: parameter.level, legend: parameter.legend, displayType: parameter.displayType, data: parameter.data })),
    requestedParameterIds: frame.requestedParameterIds ?? catalog.requestedParameterIds ?? frame.parameters.map(parameter => parameter.id),
    unavailableParameters,
    stale: Math.max(now - Date.parse(catalog.cycleTime), now - Date.parse(frame.validTime)) > 180 * 60_000,
  });

export const normalizeCatalogFrame = (catalog: MesoscaleCatalog, frameIndex: number, now = Date.now()): MesoscaleParameterResponse => {
  if (!isRecord(catalog)) return { state: 'malformed', message: 'Catalog response must be an object.' };
  const frameError = getFrameError(catalog, frameIndex);
  if (frameError) return { state: 'malformed', message: frameError };
  const frame = catalog.frames[frameIndex]!;
  if (frame.status === 'failed') return { state: 'upstream-failure', message: 'Catalog frame is marked failed.', retryable: false };
  const { unavailableParameters, partial } = getUnavailableParameters(catalog, frame);
  const payload = toProviderPayload(catalog, frame, unavailableParameters, now);
  const normalized = normalizeProviderPayload(payload, { now, staleAfterMs: 180 * 60 * 1000 });
  return partial && normalized.state === 'ready' ? { ...normalized, state: 'partial', completeness: 'partial' } : normalized;
};

export const normalizeMesoscaleCatalog = (catalog: MesoscaleCatalog, now = Date.now()): MesoscaleParameterResponse[] => {
  if (!isRecord(catalog)) return [{ state: 'malformed', message: 'Catalog response must be an object.' }];
  if (!isValidCatalogDomain(catalog.domain)) return [{ state: 'malformed', message: 'Catalog domain metadata is invalid.' }];
  if (!Array.isArray(catalog.frames)) return [{ state: 'malformed', message: 'Catalog frames are invalid.' }];
  return catalog.frames.map((_frame, frameIndex) => normalizeCatalogFrame(catalog, frameIndex, now));
};
