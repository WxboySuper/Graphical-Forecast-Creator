import { normalizeProviderPayload } from './normalizeProviderPayload';
import type { MesoscaleModelId, MesoscaleParameterResponse } from './contracts';
import type { MesoscaleCatalog, MesoscaleLatestPointer } from './catalogContracts';
import { isRecord } from './providerPayloadValidation';

const hasBounds = (value: unknown): boolean => {
  if (value === undefined) return true;
  if (!Array.isArray(value)) return false;
  if (value.length !== 4) return false;
  return value.every(Number.isFinite);
};

export const isLatestPointer = (value: MesoscaleLatestPointer, model: MesoscaleModelId): boolean => {
  if (value.schemaVersion !== 1) return false;
  if (value.modelId !== model) return false;
  if (!Number.isFinite(Date.parse(value.cycleTime))) return false;
  if (!Number.isFinite(Date.parse(value.publishedAt))) return false;
  return typeof value.catalogUrl === 'string';
};

const hasValidTileUrl = (tile: Record<string, unknown>): boolean => typeof tile.urlTemplate === 'string'
  && /\{z\}.*\{x\}.*\{y\}/.test(tile.urlTemplate);
const hasValidTileZoom = (tile: Record<string, unknown>): boolean => {
  if (!Number.isInteger(tile.minZoom) || !Number.isInteger(tile.maxZoom)) return false;
  return Number(tile.minZoom) <= Number(tile.maxZoom);
};
const hasValidTileFormat = (tile: Record<string, unknown>): boolean => tile.format === 'image/png' && tile.projection === 'EPSG:3857';

const hasValidSource = (value: unknown): boolean => {
  if (!isRecord(value)) return false;
  if (typeof value.providerId !== 'string') return false;
  if (typeof value.providerName !== 'string') return false;
  if (typeof value.datasetId !== 'string') return false;
  return typeof value.attribution === 'string';
};

const isCatalogParameter = (value: unknown): boolean => {
  if (!isRecord(value) || !isRecord(value.data)) return false;
  if (!['complete', 'partial', 'failed'].includes(String(value.status))) return false;
  const tile = value.data;
  if (tile.type !== 'xyz-raster') return false;
  if (!hasValidTileUrl(tile) || !hasValidTileFormat(tile)) return false;
  if (!hasValidTileZoom(tile)) return false;
  if (!hasValidSource(value.source)) return false;
  return hasBounds(tile.bounds);
};

const isValidFrameType = (frameType: unknown, forecastHour: unknown): boolean => {
  if (frameType === 'analysis') return forecastHour === 0;
  return frameType === 'forecast' && Number(forecastHour) > 0;
};

const isCatalogFrame = (value: unknown): boolean => {
  if (!isRecord(value) || !Array.isArray(value.parameters)) return false;
  if (!isValidFrameType(value.frameType, value.forecastHour)) return false;
  if (!Number.isInteger(value.forecastHour)) return false;
  if (!Number.isFinite(Date.parse(String(value.validTime)))) return false;
  if (!['complete', 'partial', 'failed'].includes(String(value.status))) return false;
  return value.parameters.every(isCatalogParameter);
};

const isBoundsTuple = (value: unknown): boolean => {
  if (!Array.isArray(value)) return false;
  if (value.length !== 4) return false;
  return value.every(Number.isFinite);
};

const isValidZoomRange = (value: Record<string, unknown>): boolean => {
  if (!Number.isInteger(value.minZoom) || !Number.isInteger(value.maxZoom)) return false;
  return Number(value.minZoom) <= Number(value.maxZoom);
};

const validateCatalogDomainFields = (value: Record<string, unknown>): boolean => {
  if (!isBoundsTuple(value.bounds)) return false;
  if (!isValidZoomRange(value)) return false;
  if (typeof value.id !== 'string') return false;
  if (typeof value.name !== 'string') return false;
  return value.projection === 'EPSG:3857';
};

const isCatalogDomain = (value: unknown): boolean => {
  if (!isRecord(value)) return false;
  return validateCatalogDomainFields(value);
};

const validateIdentity = (catalog: MesoscaleCatalog, model: MesoscaleModelId, cycle: string): string | undefined => {
  if (catalog.schemaVersion !== 1) return 'Catalog schema version is unsupported.';
  if (catalog.model?.id !== model) return 'Catalog model does not match the request.';
  if (!Number.isFinite(Date.parse(catalog.cycleTime))) return 'Catalog cycle time is invalid.';
  if (resolveCycleId(catalog.cycleTime) !== cycle) return 'Catalog cycle does not match the request.';
  return undefined;
};

export const resolveCycleId = (cycleTime: string): string => {
  if (/^\d{8}T\d{4}Z$/.test(cycleTime)) return cycleTime;
  if (!Number.isFinite(Date.parse(cycleTime))) return '';
  const utc = new Date(cycleTime).toISOString();
  return utc.replace(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):\d{2}\.\d{3}Z$/, '$1$2$3T$4$5Z');
};

export const getCatalogError = (catalog: MesoscaleCatalog, model: MesoscaleModelId, cycle: string): string | undefined => {
  const identityError = validateIdentity(catalog, model, cycle);
  if (identityError) return identityError;
  if (!isCatalogDomain(catalog.domain)) return 'Catalog domain metadata is invalid.';
  if (!Array.isArray(catalog.frames) || catalog.frames.length === 0) return 'Catalog has no frames.';
  return catalog.frames.every(isCatalogFrame) ? undefined : 'Catalog frame or tile metadata is malformed.';
};

export const normalizeCatalogFrame = (catalog: MesoscaleCatalog, frameIndex: number, now = Date.now()): MesoscaleParameterResponse => {
  if (!isCatalogDomain(catalog.domain)) return { state: 'malformed', message: 'Catalog domain metadata is invalid.' };
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
  if (!isCatalogDomain(catalog.domain)) return [{ state: 'malformed', message: 'Catalog domain metadata is invalid.' }];
  if (!Array.isArray(catalog.frames)) return [{ state: 'malformed', message: 'Catalog frames are invalid.' }];
  return catalog.frames.map((_frame, frameIndex) => normalizeCatalogFrame(catalog, frameIndex, now));
};
