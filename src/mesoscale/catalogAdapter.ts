import { isRecord } from './providerPayloadValidation';

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
