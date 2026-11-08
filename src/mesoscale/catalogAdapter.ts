import type { MesoscaleModelId } from './contracts';
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

const hasValidParameterStatus = (value: unknown): boolean => ['complete', 'partial', 'failed'].includes(String(value));

const isValidRasterDescriptor = (value: Record<string, unknown>): boolean => {
  if (value.type !== 'xyz-raster') return false;
  if (!hasValidTileUrl(value) || !hasValidTileFormat(value)) return false;
  if (!hasValidTileZoom(value)) return false;
  return hasBounds(value.bounds);
};

const isCatalogParameter = (value: unknown): boolean => {
  if (!isRecord(value)) return false;
  if (!isRecord(value.data)) return false;
  if (!hasValidParameterStatus(value.status)) return false;
  if (!isValidRasterDescriptor(value.data)) return false;
  if (!hasValidSource(value.source)) return false;
  return true;
};

const isValidFrameType = (frameType: unknown, forecastHour: unknown): boolean => {
  if (frameType === 'analysis') return forecastHour === 0;
  return frameType === 'forecast' && Number(forecastHour) > 0;
};

export const isCatalogFrame = (value: unknown): boolean => {
  if (!isRecord(value)) return false;
  if (!Array.isArray(value.parameters)) return false;
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

export const isValidCatalogDomain = (value: unknown): boolean => {
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
  if (!isRecord(catalog)) return 'Catalog response must be an object.';
  const identityError = validateIdentity(catalog, model, cycle);
  if (identityError) return identityError;
  if (!isValidCatalogDomain(catalog.domain)) return 'Catalog domain metadata is invalid.';
  if (!Array.isArray(catalog.frames) || catalog.frames.length === 0) return 'Catalog has no frames.';
  return catalog.frames.every(isCatalogFrame) ? undefined : 'Catalog frame or tile metadata is malformed.';
};
