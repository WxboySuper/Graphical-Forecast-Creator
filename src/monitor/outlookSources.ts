import type { Feature } from 'geojson';
import type { CloudCycleMetadata } from '../types/cloudCycles';
import type { DayType, ForecastCycle, OutlookData } from '../types/outlooks';
import type { SavedCycle } from '../store/forecastSlice';
import type { MonitorOutlookSourceSelection } from './types';
import { coerceOutlookProbabilityMap } from './outlookLayers';

export interface MonitorOutlookSourceOption {
  id: string;
  kind: MonitorOutlookSourceSelection['kind'];
  label: string;
  cycleDate: string;
  data?: OutlookData;
  status?: string;
}

const DAY_ONE = 1 as DayType;

export const isSameLocalDay = (left: string, right: string): boolean => left === right;

const hasDayOneData = (cycle: ForecastCycle, today: string): boolean =>
  isSameLocalDay(cycle.cycleDate, today) && Boolean(cycle.days[DAY_ONE]?.data);

const cloneFeature = (feature: Feature): Feature => ({
  ...feature,
  geometry: feature.geometry ? JSON.parse(JSON.stringify(feature.geometry)) : feature.geometry,
  properties: feature.properties ? { ...feature.properties } : feature.properties,
});

export const cloneOutlookDataForReadOnly = (data: OutlookData | undefined): OutlookData | undefined => {
  if (!data) {
    return undefined;
  }

  const cloneMap = (map?: Map<string, Feature[]> | Record<string, Feature[]>): Map<string, Feature[]> | undefined => {
    const normalized = coerceOutlookProbabilityMap(map);
    if (!normalized) {
      return undefined;
    }

    return new Map(Array.from(normalized.entries(), ([probability, features]) => [
      probability,
      features.map(cloneFeature),
    ]));
  };

  return {
    tornado: cloneMap(data.tornado),
    wind: cloneMap(data.wind),
    hail: cloneMap(data.hail),
    totalSevere: cloneMap(data.totalSevere),
    categorical: cloneMap(data.categorical),
    'day4-8': cloneMap(data['day4-8']),
  };
};

export const buildMonitorOutlookOptions = ({
  currentCycle,
  savedCycles,
  cloudCycles,
  today,
}: {
  currentCycle: ForecastCycle;
  savedCycles: SavedCycle[];
  cloudCycles: CloudCycleMetadata[];
  today: string;
}): MonitorOutlookSourceOption[] => {
  const currentDayOne = hasDayOneData(currentCycle, today)
    ? currentCycle.days[DAY_ONE]?.data
    : undefined;

  const options: MonitorOutlookSourceOption[] = [{
    id: 'current',
    kind: 'current',
    label: currentDayOne ? 'Current Day 1 outlook' : 'Current outlook unavailable for today',
    cycleDate: currentCycle.cycleDate,
    data: cloneOutlookDataForReadOnly(currentDayOne),
    status: currentDayOne ? undefined : 'Current cycle date does not match today.',
  }];

  savedCycles
    .filter((cycle) => hasDayOneData(cycle.forecastCycle, today))
    .forEach((cycle) => {
      options.push({
        id: cycle.id,
        kind: 'local-cycle',
        label: cycle.label || `Local cycle ${cycle.cycleDate}`,
        cycleDate: cycle.cycleDate,
        data: cloneOutlookDataForReadOnly(cycle.forecastCycle.days[DAY_ONE]?.data),
      });
    });

  cloudCycles
    .filter((cycle) => isSameLocalDay(cycle.cycleDate, today))
    .forEach((cycle) => {
      options.push({
        id: cycle.id,
        kind: 'cloud-cycle',
        label: `${cycle.label} (cloud)`,
        cycleDate: cycle.cycleDate,
        status: 'Select to load this cloud outlook read-only.',
      });
    });

  return options;
};

export const resolveSelectedOutlookOption = (
  options: MonitorOutlookSourceOption[],
  selection: MonitorOutlookSourceSelection
): MonitorOutlookSourceOption =>
  options.find((option) => option.kind === selection.kind && option.id === selection.id) ?? options[0];
