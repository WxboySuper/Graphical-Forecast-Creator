import type { Feature } from 'geojson';
import type { DayType } from './outlooks';

export interface TstmGenerationRequest {
  day: DayType;
  cycleDate: string;
}

export interface TstmGenerationThresholds {
  calibratedThunderProbability: number;
  minAreaSqKm: number;
}

export interface TstmGenerationResponse {
  features: Feature[];
  run: string;
  source: 'spc-href-calibrated-thunder';
  threshold: number;
  effectiveStart: string;
  effectiveEnd: string;
  thresholds: TstmGenerationThresholds;
  warnings: string[];
  generatedAt: string;
}
