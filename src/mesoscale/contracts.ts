/** Provider-neutral data contract for Mesoscale Forecast and Monitor consumers. */
export type MesoscaleDisplayType = 'raster' | 'contour' | 'vector' | 'scalar';
export type MesoscaleModelId = 'hrrr' | 'rap' | 'rrfs';
export type MesoscaleFrameType = 'analysis' | 'forecast';

/** Current-conditions consumers prefer the latest published HRRR analysis frame. */
export const MESOSCALE_CURRENT_CONDITIONS_PREFERENCE = {
  modelId: 'hrrr',
  frameType: 'analysis',
  forecastHour: 0,
  cycle: 'latest-available',
} as const;

export type MesoscaleLevelType =
  | 'surface'
  | 'pressure'
  | 'height'
  | 'depth'
  | 'layer'
  | 'model';

export interface MesoscaleLevel {
  type: MesoscaleLevelType;
  label: string;
  value?: number;
  units?: string;
  top?: number;
  bottom?: number;
}

export interface MesoscaleLegendStop {
  value: number;
  label: string;
  color?: string;
}

export interface MesoscaleParameterDefinition {
  id: string;
  displayName: string;
  units: string;
  level: MesoscaleLevel;
  legend: MesoscaleLegendStop[];
  displayType: MesoscaleDisplayType;
}

/** Flat adapter input shape. Provider adapters map their response to this before normalization. */
export interface MesoscaleProviderParameter<TData = unknown> {
  id: string;
  displayName: string;
  units: string;
  level: MesoscaleLevel;
  legend: MesoscaleLegendStop[];
  displayType: MesoscaleDisplayType;
  data: TData;
}

/** Provider-neutral adapter payload. Timestamp strings must include an explicit timezone. */
export interface MesoscaleProviderPayload<TData = unknown> {
  schemaVersion: 1;
  model: MesoscaleModelMetadata;
  frameType: MesoscaleFrameType;
  cycleTime: string;
  forecastHour: number;
  validTime: string;
  domain: MesoscaleDomain;
  source: MesoscaleSourceMetadata;
  parameters: MesoscaleProviderParameter<TData>[];
  requestedParameterIds?: string[];
  unavailableParameters?: Array<{ id: string; reason?: string }>;
  stale?: boolean;
}

export type MesoscaleProviderResult<TData = unknown> =
  | MesoscaleProviderPayload<TData>
  | { state: 'loading' }
  | { state: 'upstream-failure'; message?: string; retryable?: boolean };

/** Values stay provider supplied. Consumers must not derive meteorological fields here. */
export interface MesoscaleParameter<TData = unknown> {
  definition: MesoscaleParameterDefinition;
  data: TData;
}

export interface MesoscaleSourceMetadata {
  providerId: string;
  providerName: string;
  datasetId: string;
  attribution: string;
  url?: string;
}

export interface MesoscaleModelMetadata {
  id: MesoscaleModelId;
  name: string;
  capabilities: MesoscaleModelCapabilities;
}

/** Capabilities are supplied by the selected provider/adapter and may change over time. */
export interface MesoscaleModelCapabilities {
  availableParameterIds: string[];
  maxForecastHour: number;
  cycleCadenceMinutes: number;
}

export interface MesoscaleDomain {
  id: string;
  name: string;
  /** Optional provider-defined bounds. Their coordinate reference system must be documented by the adapter. */
  bounds?: [west: number, south: number, east: number, north: number];
}

export interface NormalizedMesoscaleParameters<TData = unknown> {
  model: MesoscaleModelMetadata;
  frameType: MesoscaleFrameType;
  cycleTime: string;
  forecastHour: number;
  forecastHourLabel: string;
  validTime: string;
  /** Milliseconds from validTime to `now` at normalization time. Negative means validTime is in the future. */
  ageMs: number;
  domain: MesoscaleDomain;
  source: MesoscaleSourceMetadata;
  parameters: MesoscaleParameter<TData>[];
  unavailableParameters: Array<{ id: string; reason?: string }>;
  completeness: 'complete' | 'partial';
  stale: boolean;
}

export type MesoscaleParameterResponse<TData = unknown> =
  | { state: 'loading' }
  | { state: 'upstream-failure'; message: string; retryable: boolean }
  | { state: 'malformed'; message: string }
  | ({ state: 'ready' | 'partial' | 'stale' } & NormalizedMesoscaleParameters<TData>);

/** A resolver checks for the newest published cycle and can report that the target cycle is not published yet. */
export type MesoscaleLatestCycleResolution =
  | { state: 'loading'; modelId: MesoscaleModelId }
  | { state: 'available'; modelId: MesoscaleModelId; cycleTime: string; resolvedAt: string }
  | {
      state: 'not-yet-available';
      modelId: MesoscaleModelId;
      expectedCycleTime?: string;
      latestAvailableCycleTime?: string;
      nextCheckAfterMs?: number;
    }
  | { state: 'upstream-failure'; modelId: MesoscaleModelId; message: string; retryable: boolean };

/** Provider adapters may return this before a payload is available. */
export const MESOSCALE_LOADING: MesoscaleParameterResponse = { state: 'loading' };
