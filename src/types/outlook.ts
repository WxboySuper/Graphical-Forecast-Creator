import { Feature, Polygon, MultiPolygon } from 'geojson';

export type Hazard = 'tornado' | 'wind' | 'hail' | 'categorical';

export type CategoricalRisk = 'TSTM' | 'MRGL' | 'SLGT' | 'ENH' | 'MDT' | 'HIGH';

export type ProbabilityRisk =
  | '2%' | '5%' | '10%' | '15%' | '30%' | '45%' | '60%'
  | '75%' | '90%';

// Use (string & {}) to preserve autocomplete for the literals while allowing any string
export type RiskLevel = CategoricalRisk | ProbabilityRisk;

export interface RiskArea extends Feature<Polygon | MultiPolygon> {
  properties: {
    riskLevel: RiskLevel;
    hazard: Hazard;
    isSignificant?: boolean;
    label?: string;
    [key: string]: unknown;
  };
  id?: string | number;
}

export interface Outlook {
  id: string;
  hazard: Hazard;
  riskAreas: RiskArea[];
  issueTime?: string;
  validTime?: string;
}
