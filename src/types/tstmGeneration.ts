import type { Feature } from 'geojson';
import type { DayType } from './outlooks';

export interface TstmGenerationRequest {
  day: DayType;
  cycleDate: string;
  issueDate?: string;
  validDate?: string;
  issuanceTime?: string;
}

export interface TstmGenerationThresholds {
  calibratedThunderProbability?: number;
  calibratedThunderCoreProbability?: number;
  calibratedThunderSupportProbability?: number;
  lightningProbability: number;
  qpfProbability?: number;
  reflectivityProbability?: number;
  qpfInches: number;
  capeJkg: number;
  cinJkg: number;
  reflectivityDbz: number;
  minAreaSqKm: number;
}

export interface TstmGenerationResponse {
  features: Feature[];
  run: string;
  domain: string;
  forecastHours: number[];
  effectiveStart: string;
  effectiveEnd: string;
  thresholds: TstmGenerationThresholds;
  warnings: string[];
  sources?: Record<string, { product: string; search: string; run?: string; period?: string; forecastHours?: string; url?: string } | null>;
  generatedAt: string;
}
