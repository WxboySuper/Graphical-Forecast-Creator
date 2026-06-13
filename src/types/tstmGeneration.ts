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
<<<<<<< HEAD
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
=======
  calibratedThunderCoreProbability: number;
  calibratedThunderSupportProbability: number;
}

export interface TstmGenerationSource {
  product: string;
  search?: string;
  run?: string;
  period?: string;
  forecastHours?: string;
  url?: string;
>>>>>>> 0d5d372 (feat(auto-tstm): preserve hidden client boundary)
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
<<<<<<< HEAD
  sources?: Record<string, { product: string; search: string; run?: string; period?: string; forecastHours?: string; url?: string } | null>;
=======
  sources: Record<string, TstmGenerationSource | null>;
>>>>>>> 0d5d372 (feat(auto-tstm): preserve hidden client boundary)
  generatedAt: string;
}
