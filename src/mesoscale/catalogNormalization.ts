import { normalizeProviderPayload } from './normalizeProviderPayload';
import type { MesoscaleParameterResponse } from './contracts';
import type { MesoscaleCatalog } from './catalogContracts';
import { isValidCatalogDomain } from './catalogAdapter';

export const normalizeCatalogFrame = (catalog: MesoscaleCatalog, frameIndex: number, now = Date.now()): MesoscaleParameterResponse => {
  if (!isValidCatalogDomain(catalog.domain)) return { state: 'malformed', message: 'Catalog domain metadata is invalid.' };
  if (!Array.isArray(catalog.frames)) return { state: 'malformed', message: 'Catalog frames are invalid.' };
  const frame = catalog.frames[frameIndex];
  if (!frame) return { state: 'malformed', message: 'Catalog frame is missing.' };
  if (frame.status === 'failed') return { state: 'upstream-failure', message: 'Catalog frame is marked failed.', retryable: false };
  const declaredUnavailable = frame.unavailableParameters ?? catalog.unavailableParameters ?? [];
  const failedParameters = frame.parameters.filter(parameter => parameter.status === 'failed');
  const failedIds = new Set(declaredUnavailable.map(parameter => parameter.id));
  const unavailable = [...declaredUnavailable, ...failedParameters
    .filter(parameter => !failedIds.has(parameter.id))
    .map(parameter => ({ id: parameter.id, reason: 'Catalog parameter is marked failed.' }))];
  const hasFailed = failedParameters.length > 0;
  const hasPartial = frame.parameters.some(parameter => parameter.status === 'partial');
  const isPartial = frame.status === 'partial' || hasFailed || hasPartial;
  const payload = {
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
    unavailableParameters: unavailable,
    stale: Math.max(now - Date.parse(catalog.cycleTime), now - Date.parse(frame.validTime)) > 180 * 60_000,
  };
  const normalized = normalizeProviderPayload(payload, { now, staleAfterMs: 180 * 60 * 1000 });
  return isPartial && normalized.state === 'ready' ? { ...normalized, state: 'partial', completeness: 'partial' } : normalized;
};

export const normalizeMesoscaleCatalog = (catalog: MesoscaleCatalog, now = Date.now()): MesoscaleParameterResponse[] => {
  if (!isValidCatalogDomain(catalog.domain)) return [{ state: 'malformed', message: 'Catalog domain metadata is invalid.' }];
  if (!Array.isArray(catalog.frames)) return [{ state: 'malformed', message: 'Catalog frames are invalid.' }];
  return catalog.frames.map((_frame, frameIndex) => normalizeCatalogFrame(catalog, frameIndex, now));
};
