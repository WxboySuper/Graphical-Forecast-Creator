import { GeoJSON } from 'leaflet';

/**
 * Defines the types for the Storm Prediction Center's severe weather outlook system
 * Based on the specifications in Outlook_Info.md
 */

// Categorical risk levels
export type CategoricalRiskLevel = 
  | 'TSTM' // General Thunderstorm (0/5)
  | 'MRGL' // Marginal (1/5)
  | 'SLGT' // Slight (2/5)
  | 'ENH'  // Enhanced (3/5)
  | 'MDT'  // Moderate (4/5)
  | 'HIGH'; // High (5/5)

// Probabilistic risk levels for Tornado
export type TornadoProbability = 
  | '2%'
  | '5%'
  | '10%'
  | '10#'  // Significant tornado - 10%
  | '15%'
  | '15#'  // Significant tornado - 15%
  | '30%'
  | '30#'  // Significant tornado - 30%
  | '45%'
  | '45#'  // Significant tornado - 45%
  | '60%'
  | '60#'; // Significant tornado - 60%

// Probabilistic risk levels for Wind and Hail (they share the same percentages)
export type WindHailProbability = 
  | '5%'
  | '15%'
  | '15#'  // Significant threat - 15%
  | '30%'
  | '30#'  // Significant threat - 30%
  | '45%'
  | '45#'  // Significant threat - 45%
  | '60%'
  | '60#'; // Significant threat - 60%

// Outlook types
export type OutlookType = 'tornado' | 'wind' | 'hail' | 'categorical';

// Combined probability type for use across the app
export type Probability = TornadoProbability | WindHailProbability | CategoricalRiskLevel;

export type Hazard = OutlookType;

export interface RiskArea extends GeoJSON.Feature {
  properties: {
    outlookType: OutlookType;
    probability: Probability;
    isSignificant: boolean;
    derivedFrom?: string;
    originalProbability?: string;
    [key: string]: any;
  };
  id?: string | number;
}

export interface Outlook {
  type: Hazard;
  riskAreas: RiskArea[];
}

// Full outlook data structure
export interface OutlookData {
  tornado: Map<string, GeoJSON.Feature[]>; // Map of probability to GeoJSON features
  wind: Map<string, GeoJSON.Feature[]>;    // Map of probability to GeoJSON features
  hail: Map<string, GeoJSON.Feature[]>;    // Map of probability to GeoJSON features
  categorical: Map<string, GeoJSON.Feature[]>; // Map of risk level to GeoJSON features
}

// Color mappings for the different outlook types
export interface ColorMappings {
  tornado: Record<TornadoProbability, string>;
  wind: Record<WindHailProbability, string>;
  hail: Record<WindHailProbability, string>;
  categorical: Record<CategoricalRiskLevel, string>;
  significant: string; // For the hatched pattern
}

// Drawing tool state
export interface DrawingState {
  activeOutlookType: OutlookType;
  activeProbability: TornadoProbability | WindHailProbability | CategoricalRiskLevel;
  isSignificant: boolean; // Whether the current drawing should be hatched
}