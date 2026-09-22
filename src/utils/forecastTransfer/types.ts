import type { DayType, ForecastCycle, OutlookType } from '../../types/outlooks';
import type { CycleMetadata } from '../../types/workflow';
import type { ForecastWorkspaceId } from '../../config/forecastWorkspaces';

/** Supported forecast data transfer formats. */
export type ForecastTransferFormat = 'json' | 'package' | 'kml' | 'kmz';

/** Scope for geometry exports and selective imports. */
export type ForecastTransferScope = 'current-day' | 'cycle' | 'workflow';

export type KmlArchiveStrategy = 'structured' | 'split';

export interface ForecastTransferMapView {
  center: [number, number];
  zoom: number;
}

export interface ForecastExportRequest {
  format: ForecastTransferFormat;
  scope: ForecastTransferScope;
  forecastCycle: ForecastCycle;
  mapView: ForecastTransferMapView;
  cycleMetadata?: CycleMetadata;
  day?: DayType;
  kmlStrategy?: KmlArchiveStrategy;
  outlookTypes?: OutlookType[];
  workspaceId?: ForecastWorkspaceId;
}

export interface ForecastImportResult {
  forecastCycle: ForecastCycle;
  /**
   * Owning workspace for native transfers. Null for KML/KMZ, which carry
   * no workspace identity and must not bypass the workspace boundary.
   */
  workspaceId: ForecastWorkspaceId | null;
  mapView?: ForecastTransferMapView;
  cycleMetadata?: CycleMetadata | null;
  warnings: string[];
  format: ForecastTransferFormat;
}

export interface ParsedKmlPlacemark {
  day: DayType;
  outlookType: OutlookType;
  probabilityKey: string;
  feature: GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>;
  isSignificant: boolean;
}

export const OUTLOOK_LABEL_TO_TYPE: Record<string, OutlookType> = {
  Categorical: 'categorical',
  Tornado: 'tornado',
  Wind: 'wind',
  Hail: 'hail',
  'Total Severe': 'totalSevere',
  'Day 4-8': 'day4-8',
};
