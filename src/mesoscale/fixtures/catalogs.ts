import complete from './complete.json';
import partial from './partial.json';
import stale from './stale.json';
import type { MesoscaleCatalog, MesoscaleLatestPointer, MesoscaleStatus } from '../catalogContracts';
import type { MesoscaleModelId, MesoscaleProviderPayload } from '../contracts';

const FIXTURE_TILE_URL = '/mesoscale-fixtures-tile.png';
const cycleKey = (time: string) => new Date(time).toISOString().replace(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):\d{2}\.\d{3}Z$/, '$1$2$3T$4$5Z');

const catalogFromPayload = (payload: MesoscaleProviderPayload): MesoscaleCatalog => {
  const frameType = payload.frameType;
  return {
    schemaVersion: 1,
    model: { id: payload.model.id, name: payload.model.name },
    cycleTime: payload.cycleTime,
    status: payload.unavailableParameters?.length ? 'partial' : 'complete',
    ageMinutes: Math.max(0, Math.floor((Date.now() - Date.parse(payload.cycleTime)) / 60000)),
    domain: { id: payload.domain.id, name: payload.domain.name, projection: 'EPSG:3857', bounds: [-125, 24, -66, 50], minZoom: 3, maxZoom: 6 },
    source: { providerId: payload.source.providerId, providerName: payload.source.providerName, datasetId: payload.source.datasetId, attribution: payload.source.attribution, url: 'https://example.invalid' },
    frames: [{
      forecastHour: payload.forecastHour,
      validTime: payload.validTime,
      frameType,
      status: payload.unavailableParameters?.length ? 'partial' : 'complete',
      requestedParameterIds: payload.requestedParameterIds,
      unavailableParameters: payload.unavailableParameters,
      parameters: payload.parameters.map(parameter => ({
        ...parameter,
        displayType: 'raster',
        data: { type: 'xyz-raster', urlTemplate: FIXTURE_TILE_URL, format: 'image/png', projection: 'EPSG:3857', minZoom: 3, maxZoom: 6, bounds: [-125, 24, -66, 50] },
        source: { providerId: payload.source.providerId, providerName: payload.source.providerName, datasetId: payload.source.datasetId, attribution: payload.source.attribution, url: 'https://example.invalid' },
        status: 'complete',
      })),
    }],
  };
};

const catalogs = [complete, partial, stale].map(payload => catalogFromPayload(payload as unknown as MesoscaleProviderPayload));

export const getFixtureCatalog = (model: MesoscaleModelId, cycle?: string): MesoscaleCatalog | null => {
  const catalog = catalogs.find(value => value.model.id === model && (!cycle || cycleKey(value.cycleTime) === cycle));
  return catalog ?? null;
};

export const getFixtureLatest = (model: MesoscaleModelId): MesoscaleLatestPointer | null => {
  const catalog = catalogs.find(value => value.model.id === model);
  if (!catalog) return null;
  return { schemaVersion: 1, modelId: model, cycleTime: catalog.cycleTime, catalogUrl: `/mesoscale-fixtures/catalog/${model}/${cycleKey(catalog.cycleTime)}.json`, publishedAt: catalog.cycleTime };
};

export const FIXTURE_STATUS: MesoscaleStatus = {
  status: 'degraded',
  models: (['hrrr', 'rap', 'rrfs'] as const).map(modelId => ({
    modelId,
    latestCycleTime: catalogs.find(catalog => catalog.model.id === modelId)?.cycleTime ?? null,
    ageMinutes: null,
    stale: true,
    health: catalogs.some(catalog => catalog.model.id === modelId) ? 'complete' : 'missing',
    healthGeneratedAt: null,
  })),
};
