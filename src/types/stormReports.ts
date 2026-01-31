/**
 * Storm report types for SPC storm report data
 */

export type ReportType = 'tornado' | 'wind' | 'hail';

export interface StormReport {
  id: string;
  type: ReportType;
  latitude: number;
  longitude: number;
  time: string;
  magnitude?: string; // F-scale for tornadoes, mph for wind, inches for hail
  location: string;
  county: string;
  state: string;
  comments?: string;
}

export interface StormReportsState {
  reports: StormReport[];
  date: string | null;
  loading: boolean;
  error: string | null;
  visible: boolean;
  filterByType: {
    tornado: boolean;
    wind: boolean;
    hail: boolean;
  };
}
