import { Circle, Fill, Stroke, Style } from 'ol/style';
import type { ReportType } from '../types/stormReports';

const reportColors: Record<ReportType, string> = {
  tornado: '#FF0000',
  wind: '#0000FF',
  hail: '#00FF00',
};

export const buildStormReportStyle = (type: ReportType): Style =>
  new Style({
    image: new Circle({
      radius: 6,
      fill: new Fill({
        color: reportColors[type] ?? '#888888',
      }),
      stroke: new Stroke({
        color: '#FFFFFF',
        width: 1,
      }),
    }),
  });
