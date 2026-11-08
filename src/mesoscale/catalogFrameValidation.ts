import type { MesoscaleCatalog } from './catalogContracts';
import { isRecord } from './providerPayloadValidation';

const hasBounds = (value: unknown): boolean => {
  if (value === undefined) return true;
  if (!Array.isArray(value)) return false;
  if (value.length !== 4) return false;
  return value.every(Number.isFinite);
};

const hasValidTileUrl = (tile: Record<string, unknown>): boolean => typeof tile.urlTemplate === 'string'
  && /\{z\}.*\{x\}.*\{y\}/.test(tile.urlTemplate);

const hasValidTileZoom = (tile: Record<string, unknown>): boolean => {
  if (!Number.isInteger(tile.minZoom) || !Number.isInteger(tile.maxZoom)) return false;
  return Number(tile.minZoom) <= Number(tile.maxZoom);
};

const hasValidTileFormat = (tile: Record<string, unknown>): boolean => tile.format === 'image/png'
  && tile.projection === 'EPSG:3857';

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

const hasValidFrameMetadata = (frame: Record<string, unknown>, parameterCount: number): boolean => {
  if (!isValidFrameType(frame.frameType, frame.forecastHour)) return false;
  if (!Number.isInteger(frame.forecastHour)) return false;
  if (!Number.isFinite(Date.parse(String(frame.validTime)))) return false;
  if (!['complete', 'partial', 'failed'].includes(String(frame.status))) return false;
  if (parameterCount === 0 && frame.status !== 'failed') return false;
  return true;
};

export const isCatalogFrame = (value: unknown): value is MesoscaleCatalog['frames'][number] => {
  if (!isRecord(value)) return false;
  if (!Array.isArray(value.parameters)) return false;
  if (!hasValidFrameMetadata(value, value.parameters.length)) return false;
  return value.parameters.every(isCatalogParameter);
};
