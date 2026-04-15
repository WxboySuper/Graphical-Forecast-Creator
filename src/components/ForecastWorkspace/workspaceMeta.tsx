import React from 'react';
import {
  Calendar,
  CloudHail,
  LayoutGrid,
  Tornado,
  Wind,
} from 'lucide-react';
import { DayType, OutlookType } from '../../types/outlooks';
import { selectForecastCycle } from '../../store/forecastSlice';
import type { BaseMapStyle } from '../../store/overlaysSlice';

export const outlookIcons: Record<OutlookType, React.ReactNode> = {
  tornado: <Tornado className="h-4 w-4" />,
  wind: <Wind className="h-4 w-4" />,
  hail: <CloudHail className="h-4 w-4" />,
  categorical: <LayoutGrid className="h-4 w-4" />,
  totalSevere: <CloudHail className="h-4 w-4" />,
  'day4-8': <Calendar className="h-4 w-4" />,
};

export const outlookLabels: Record<OutlookType, string> = {
  tornado: 'Tornado',
  wind: 'Wind',
  hail: 'Hail',
  categorical: 'Categorical',
  totalSevere: 'Total Severe',
  'day4-8': 'Day 4-8',
};

export const outlookShortcuts: Record<OutlookType, string> = {
  tornado: 'T',
  wind: 'W',
  hail: 'H',
  categorical: 'C',
  totalSevere: 'S',
  'day4-8': 'D',
};

export const FORECAST_DAYS: DayType[] = [1, 2, 3, 4, 5, 6, 7, 8];

export const FORECAST_BASE_MAP_OPTIONS: Array<{
  value: BaseMapStyle;
  label: string;
  shortLabel: string;
}> = [
  { value: 'blank', label: 'Weather Blank', shortLabel: 'Weather' },
  { value: 'osm', label: 'OpenStreetMap', shortLabel: 'Streets' },
  { value: 'carto-light', label: 'Light', shortLabel: 'Light' },
  { value: 'carto-dark', label: 'Dark', shortLabel: 'Dark' },
  { value: 'esri-satellite', label: 'Satellite', shortLabel: 'Sat' },
];

/** Returns true if the given day in the forecast cycle has any outlook polygons drawn for any outlook type. */
export const hasDayOutlookData = (
  days: ReturnType<typeof selectForecastCycle>['days'],
  day: DayType
) => {
  const outlookDay = days[day];
  if (!outlookDay) return false;
  const { data } = outlookDay;

  return (
    (data.tornado && data.tornado.size > 0) ||
    (data.wind && data.wind.size > 0) ||
    (data.hail && data.hail.size > 0) ||
    (data.totalSevere && data.totalSevere.size > 0) ||
    (data['day4-8'] && data['day4-8'].size > 0) ||
    (data.categorical && data.categorical.size > 0)
  );
};

/** Returns a high-contrast text color for a hex background color. */
export const getContrastTextColor = (color: string) => {
  const hex = color.replace('#', '');
  const normalized = hex.length === 3 ? hex.split('').map((char) => `${char}${char}`).join('') : hex;
  const value = /^[0-9a-fA-F]{6}$/.test(normalized) ? normalized : '000000';
  const red = parseInt(value.slice(0, 2), 16);
  const green = parseInt(value.slice(2, 4), 16);
  const blue = parseInt(value.slice(4, 6), 16);
  const luminance = (red * 0.2126 + green * 0.7152 + blue * 0.0722) / 255;
  return luminance > 0.7 ? '#000' : '#fff';
};
