import type { MesoscaleModelId, MesoscaleProviderPayload } from './contracts';

export interface MesoscaleLatestPointer {
  schemaVersion: 1;
  modelId: MesoscaleModelId;
  cycleTime: string;
  catalogUrl: string;
  publishedAt: string;
}

export interface MesoscaleCatalogParameter {
  id: string;
  displayName: string;
  units: string;
  level: MesoscaleProviderPayload['parameters'][number]['level'];
  legend: MesoscaleProviderPayload['parameters'][number]['legend'];
  displayType: 'raster';
  data: {
    type: 'xyz-raster';
    urlTemplate: string;
    format: 'image/png';
    projection: 'EPSG:3857';
    minZoom: number;
    maxZoom: number;
    bounds?: [number, number, number, number];
  };
  source: MesoscaleProviderPayload['source'];
  status: 'complete' | 'partial' | 'failed';
}

export interface MesoscaleCatalogFrame {
  forecastHour: number;
  validTime: string;
  frameType: 'analysis' | 'forecast';
  status: 'complete' | 'partial' | 'failed';
  parameters: MesoscaleCatalogParameter[];
  requestedParameterIds?: string[];
  unavailableParameters?: Array<{ id: string; reason?: string }>;
}

export interface MesoscaleCatalog {
  schemaVersion: 1;
  model: { id: MesoscaleModelId; name: string };
  cycleTime: string;
  status: 'complete' | 'partial' | 'failed';
  ageMinutes: number;
  receivedAt?: string;
  processedAt?: string;
  processingVersion?: string;
  requestedParameterIds?: string[];
  unavailableParameters?: Array<{ id: string; reason?: string }>;
  domain: {
    id: string;
    name: string;
    projection: 'EPSG:3857';
    bounds: [number, number, number, number];
    minZoom: number;
    maxZoom: number;
  };
  frames: MesoscaleCatalogFrame[];
  source?: MesoscaleCatalogParameter['source'];
}

export interface MesoscaleStatusModel {
  modelId: MesoscaleModelId;
  latestCycleTime: string | null;
  ageMinutes: number | null;
  stale: boolean;
  health: 'complete' | 'partial' | 'failed' | 'missing' | 'invalid' | 'unavailable';
  healthGeneratedAt: string | null;
}

export interface MesoscaleStatus {
  status: 'healthy' | 'degraded';
  models: MesoscaleStatusModel[];
}
