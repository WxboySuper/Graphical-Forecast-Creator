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

// Wind Probability
export type WindProbability = 
  | '5%'
  | '15%'
  | '15#'
  | '30%'
  | '30#'
  | '45%'
  | '45#'
  | '60%'
  | '60#'
  | '75%'
  | '75#'
  | '90%'
  | '90#';

// Hail Probability
export type HailProbability = 
  | '5%'
  | '15%'
  | '15#'
  | '30%'
  | '30#'
  | '45%'
  | '45#'
  | '60%'
  | '60#';

// Day 3 Total Severe Probability (combined threat, not separate tornado/wind/hail)
export type TotalSevereProbability =
  | '5%'
  | '15%'
  | '30%'
  | '45%'
  | '60%';

// Day 4-8 Probability (special outlook type with only 15% and 30%)
export type Day48Probability =
  | '15%' // Yellow
  | '30%'; // Orange

// CIG (Hatching) Levels
export type CIGLevel = 
  | 'CIG0' // No hatching
  | 'CIG1' // Old Hatching Style (Broken diagonal)
  | 'CIG2' // Solid diagonal (Top-Left to Bottom-Right)
  | 'CIG3'; // Crosshatch

// Outlook types - varies by day
// Day 1/2: tornado, wind, hail, categorical
// Day 3: totalSevere, categorical  
// Day 4-8: day4-8
export type OutlookType = 'tornado' | 'wind' | 'hail' | 'categorical' | 'totalSevere' | 'day4-8';

// Combined probability type for use across the app
export type Probability = TornadoProbability | WindProbability | HailProbability | TotalSevereProbability | Day48Probability | CategoricalRiskLevel | CIGLevel;

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

// Full outlook data structure - adapts based on day
// Day 1/2: tornado, wind, hail, categorical
// Day 3: totalSevere, categorical
// Day 4-8: day4-8 only
export interface OutlookData {
  // Day 1 & 2 fields
  tornado?: Map<string, GeoJSON.Feature[]>;
  wind?: Map<string, GeoJSON.Feature[]>;
  hail?: Map<string, GeoJSON.Feature[]>;
  
  // Day 3 field
  totalSevere?: Map<string, GeoJSON.Feature[]>;
  
  // Day 1, 2, 3 field (with categorical conversion)
  categorical?: Map<string, GeoJSON.Feature[]>;
  
  // Day 4-8 field (15% and 30% only, no categorical)
  'day4-8'?: Map<string, GeoJSON.Feature[]>;
}

// Color mappings for the different outlook types
export interface ColorMappings {
  tornado: Record<TornadoProbability, string>;
  wind: Record<WindProbability, string>;
  hail: Record<HailProbability, string>;
  totalSevere: Record<TotalSevereProbability, string>;
  'day4-8': Record<Day48Probability, string>;
  categorical: Record<CategoricalRiskLevel, string>;
  significant: string; // For the hatched pattern
  hatching: Record<CIGLevel, string>; // Pattern defs or colors (transparent usually)
}

// Drawing tool state
export interface DrawingState {
  activeOutlookType: OutlookType;
  activeProbability: Probability;
  isSignificant: boolean; // Whether the current drawing should be hatched (Legacy)
}

// Serialization types for JSON storage
export interface SerializedOutlookData {
  tornado?: [string, GeoJSON.Feature[]][];
  wind?: [string, GeoJSON.Feature[]][];
  hail?: [string, GeoJSON.Feature[]][];
  totalSevere?: [string, GeoJSON.Feature[]][];
  'day4-8'?: [string, GeoJSON.Feature[]][];
  categorical?: [string, GeoJSON.Feature[]][];
}

// Forecast Cycle Types
// Individual days instead of merged '4-8'
export type DayType = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

// Discussion Editor Types
export type DiscussionMode = 'diy' | 'guided';

export interface GuidedDiscussionData {
  synopsis: string;
  meteorologicalSetup: string;
  severeWeatherExpectations: string;
  timing: string;
  regionalBreakdown: string;
  additionalConsiderations: string;
}

export interface DiscussionData {
  mode: DiscussionMode;
  validStart: string; // ISO date-time
  validEnd: string; // ISO date-time
  forecasterName: string;
  
  // DIY mode - simple text editor
  diyContent?: string;
  
  // Guided mode - structured questions
  guidedContent?: GuidedDiscussionData;
  
  lastModified: string;
}

export interface OutlookDay {
  day: DayType;
  data: OutlookData; // The actual polygon data
  metadata: {
    issueDate: string;
    validDate: string;
    issuanceTime: string;
    createdAt: string;
    lastModified: string;
  };
  discussion?: DiscussionData; // Optional discussion for this day
}

export interface ForecastCycle {
  days: Partial<Record<DayType, OutlookDay>>;
  currentDay: DayType;
  cycleDate: string;
}

// Updated Save Data Interface
export interface GFCForecastSaveData {
  version: string;
  type: 'single-day' | 'forecast-cycle';
  timestamp: string;
  
  // Single day format (backward compatible / single export)
  outlooks?: SerializedOutlookData;
  mapView?: {
    center: [number, number];
    zoom: number;
  };

  // Multi-day format (new)
  forecastCycle?: {
    days: Partial<Record<DayType, {
      day: DayType;
      data: SerializedOutlookData;
      metadata: {
        issueDate: string;
        validDate: string;
        issuanceTime: string;
      };
    }>>;
    currentDay: DayType;
    cycleDate: string;
  };
}