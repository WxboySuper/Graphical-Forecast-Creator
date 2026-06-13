import type { Feature } from 'geojson';
import type { DayType } from './outlooks';

export interface TstmGenerationRequest {
  day: DayType;
  cycleDate: string;
<<<<<<< HEAD
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
=======
}

export interface TstmGenerationThresholds {
  calibratedThunderProbability: number;
>>>>>>> d2114fe (feat: add gated Auto-TSTM forecast foundations)
  minAreaSqKm: number;
}

export interface TstmGenerationResponse {
  features: Feature[];
  run: string;
<<<<<<< HEAD
  domain: string;
  forecastHours: number[];
=======
  source: 'spc-href-calibrated-thunder';
  threshold: number;
>>>>>>> d2114fe (feat: add gated Auto-TSTM forecast foundations)
  effectiveStart: string;
  effectiveEnd: string;
  thresholds: TstmGenerationThresholds;
  warnings: string[];
<<<<<<< HEAD
  sources?: Record<string, { product: string; search: string; run?: string; period?: string; forecastHours?: string; url?: string } | null>;
=======
>>>>>>> d2114fe (feat: add gated Auto-TSTM forecast foundations)
  generatedAt: string;
}
