import JSZip from 'jszip';
import { OutlookData, GFCForecastSaveData, ForecastCycle, DayType, OutlookDay, DiscussionData, SerializedOutlookData, OutlookType, CycleMetadata } from '../types/outlooks';
import { compileDiscussionToText } from './discussionUtils';
import {
  getDiscussionForGrouping,
  getDiscussionGroupings,
  getDiscussionOwnerDay,
  hasDiscussionContent,
  isValidDiscussionGroupings,
  normalizeDiscussionGroupings,
} from './discussionGrouping';
import { coerceOutlookProbabilityMap } from './outlookMapCoercion';
import { completionMetadataFromForecastCycle } from './forecastCompletionMetadata';
import { deserializeForecastCycleDays } from './forecastCycleDeserialize';
import { getWorkflowTemplateById } from '../components/ForecastWorkflow/workflowTemplates';

const CURRENT_VERSION = '1.0.0';

// Helper to convert Map to Array for JSON serialization
const mapToArray = <K, V>(m: Map<K, V>): [K, V][] =>
  m instanceof Map ? Array.from(m.entries()) : [];

// Helper to convert serializable Array back to Map
const deserializeOutlookMap = <K extends string, V>(
  value: [K, V][] | Record<string, V> | Map<K, V> | undefined,
): Map<K, V> | undefined => {
  if (value === undefined || value === null) {
    return undefined;
  }

  const coerced = coerceOutlookProbabilityMap(value);
  return coerced ?? new Map<K, V>();
};

/** Creates a safe, deterministic, collision-free discussion filename for a ZIP archive. */
export const createUniqueDiscussionEntryName = (
  identifier: string,
  usedNames: Set<string>,
): string => {
  const safeIdentifier = identifier
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^\.+/, '')
    .replace(/^-+|-+$/g, '')
    || 'discussion';
  const baseName = `discussion_${safeIdentifier}`;
  let name = `${baseName}.txt`;
  let suffix = 2;
  while (usedNames.has(name)) {
    name = `${baseName}-${suffix}.txt`;
    suffix += 1;
  }
  usedNames.add(name);
  return name;
};

// Types for serialization helper
type SerializedDay = {
  day: DayType;
  metadata: {
    issueDate: string;
    validDate: string;
    issuanceTime: string;
    lowProbabilityOutlooks?: OutlookType[];
    createdAt?: string;
    lastModified?: string;
  };
  data: SerializedOutlookData;
  discussion?: DiscussionData;
};

// Helper to create empty outlook based on day type
const createEmptyOutlook = (day: DayType): OutlookDay => {
  const baseData: OutlookData = {};
  
  if (day === 1 || day === 2) {
    // Day 1/2: tornado, wind, hail, categorical
    baseData.tornado = new Map();
    baseData.wind = new Map();
    baseData.hail = new Map();
    baseData.categorical = new Map();
  } else if (day === 3) {
    // Day 3: totalSevere, categorical
    baseData.totalSevere = new Map();
    baseData.categorical = new Map();
  } else {
    // Day 4-8: only day4-8 outlook type
    baseData['day4-8'] = new Map();
  }
  
  return {
    day,
    data: baseData,
    metadata: {
      issueDate: new Date().toISOString(),
      validDate: new Date().toISOString(),
      issuanceTime: '0600',
      createdAt: new Date().toISOString(),
      lastModified: new Date().toISOString(),
      lowProbabilityOutlooks: []
    }
  };
};

/**
 * Serializes the current ForecastCycle into a JSON-compatible format.
 * When `cycleMetadata` is provided, the output is tagged with v2 workflow metadata.
 */
export const serializeForecast = (
  forecastCycle: ForecastCycle,
  mapView: { center: [number, number]; zoom: number },
  cycleMetadata?: CycleMetadata
): GFCForecastSaveData => {
  const serializedDays: Partial<Record<DayType, SerializedDay>> = {};
  
  (Object.keys(forecastCycle.days) as unknown as DayType[]).forEach(day => {
    const outlookDay = forecastCycle.days[day];
    if (outlookDay) {
      const serializedData: SerializedOutlookData = {};
      
      // Only serialize outlook maps that exist for this day
      if (outlookDay.data.tornado) serializedData.tornado = mapToArray(outlookDay.data.tornado);
      if (outlookDay.data.wind) serializedData.wind = mapToArray(outlookDay.data.wind);
      if (outlookDay.data.hail) serializedData.hail = mapToArray(outlookDay.data.hail);
      if (outlookDay.data.totalSevere) serializedData.totalSevere = mapToArray(outlookDay.data.totalSevere);
      if (outlookDay.data['day4-8']) serializedData['day4-8'] = mapToArray(outlookDay.data['day4-8']);
      if (outlookDay.data.categorical) serializedData.categorical = mapToArray(outlookDay.data.categorical);
      
      serializedDays[day] = {
        day: outlookDay.day,
        metadata: {
          ...outlookDay.metadata,
          lowProbabilityOutlooks: outlookDay.metadata.lowProbabilityOutlooks || []
        },
        data: serializedData,
        discussion: outlookDay.discussion
      };
    }
  });

  const result: GFCForecastSaveData = {
    version: CURRENT_VERSION,
    type: 'forecast-cycle',
    timestamp: new Date().toISOString(),
    forecastCycle: {
      days: serializedDays,
      currentDay: forecastCycle.currentDay,
      cycleDate: forecastCycle.cycleDate,
      ...(isValidDiscussionGroupings(forecastCycle.discussionGroupings)
        ? { discussionGroupings: normalizeDiscussionGroupings(forecastCycle.discussionGroupings) }
        : {}),
      ...completionMetadataFromForecastCycle(forecastCycle),
    },
    mapView,
    ...(cycleMetadata ? { cycleMetadata } : {}),
  };

  return result;
};

/**
 * Deserializes the saved JSON data back into ForecastCycle.
 * Handles migration from single-day format and v1.0.0 cycleMetadata embedding.
 */
export const deserializeForecast = (data: GFCForecastSaveData): ForecastCycle => {
  if (data.forecastCycle) {
    const cycle = data.forecastCycle;

    return {
      days: deserializeForecastCycleDays(cycle),
      currentDay: cycle.currentDay,
      cycleDate: cycle.cycleDate,
      ...(isValidDiscussionGroupings(cycle.discussionGroupings)
        ? { discussionGroupings: normalizeDiscussionGroupings(cycle.discussionGroupings) }
        : {}),
      ...completionMetadataFromForecastCycle(cycle),
    };
  }

  // Legacy Migration (v0.4.0 and older)
  // Wrap single outlook into Day 1 of a new cycle
  const day1 = createEmptyOutlook(1);
  if (data.outlooks) { // Old format used 'outlooks'
    const outlookData: OutlookData = {};
    if (data.outlooks.tornado) outlookData.tornado = deserializeOutlookMap(data.outlooks.tornado);
    if (data.outlooks.wind) outlookData.wind = deserializeOutlookMap(data.outlooks.wind);
    if (data.outlooks.hail) outlookData.hail = deserializeOutlookMap(data.outlooks.hail);
    if (data.outlooks.categorical) outlookData.categorical = deserializeOutlookMap(data.outlooks.categorical);
    day1.data = outlookData;
  }

  return {
    days: { 1: day1 },
    currentDay: 1,
    cycleDate: new Date().toISOString().split('T')[0]
  };
};

/** Creates a deep forecast-cycle clone while preserving Map-backed outlook data. */
export const cloneForecastCycle = (forecastCycle: ForecastCycle): ForecastCycle =>
  deserializeForecast(
    serializeForecast(forecastCycle, {
      center: [0, 0],
      zoom: 0,
    })
  );

/**
 * Validates that the input data conforms to the GFCForecastSaveData schema.
 */
export const validateForecastData = (data: unknown): data is GFCForecastSaveData => {
  if (typeof data !== 'object' || data === null) return false;
  const candidate = data as Partial<GFCForecastSaveData>;

  // Check valid structure (either new or old)
  return Boolean(candidate.forecastCycle || candidate.outlooks);
};

/**
 * Triggers a download of the serialized forecast data as a JSON file.
 * When `cycleMetadata` is provided, the export keeps the active workflow
 * metadata so a re-import can restore the workflow session.
 */
export const exportForecastToJson = (
  forecastCycle: ForecastCycle,
  mapView: { center: [number, number]; zoom: number },
  cycleMetadata?: CycleMetadata
) => {
  const data = serializeForecast(forecastCycle, mapView, cycleMetadata);
  const jsonString = JSON.stringify(data, null, 2);
  const blob = new Blob([jsonString], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  
  const now = new Date();
  const timestamp = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const filename = `gfc-forecast-${timestamp}.json`;

  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

/**
 * Bundles the forecast JSON and all day discussions into a single .zip package.
 */
export const downloadGfcPackage = async (
  forecastCycle: ForecastCycle,
  mapView: { center: [number, number]; zoom: number },
  cycleMetadata?: CycleMetadata,
): Promise<void> => {
  const zip = new JSZip();

  // 1. Forecast JSON
  const data = serializeForecast(forecastCycle, mapView, cycleMetadata);
  zip.file('forecast_cycle.json', JSON.stringify(data, null, 2));

  // 2. Discussion text for configured scopes, with every ungrouped legacy day retained.
  const workflowTemplate = cycleMetadata ? getWorkflowTemplateById(cycleMetadata.workflowId) : undefined;
  const hasStandardWorkflowGrouping = workflowTemplate?.groupings.some((grouping) =>
    grouping === 'day1' || grouping === 'day2' || grouping === 'day3' || grouping === 'day4-8',
  );
  const hasValidPersistedGrouping = isValidDiscussionGroupings(forecastCycle.discussionGroupings);
  const exportedDays = new Set<DayType>();
  const usedEntryNames = new Set<string>(['forecast_cycle.json']);

  const addDiscussion = (discussion: DiscussionData | undefined, day: DayType, identifier: string): void => {
    if (!discussion || !hasDiscussionContent(discussion)) return;
    const entryName = createUniqueDiscussionEntryName(identifier, usedEntryNames);
    zip.file(entryName, compileDiscussionToText(discussion, day));
    exportedDays.add(day);
  };

  if (hasValidPersistedGrouping || hasStandardWorkflowGrouping) {
    getDiscussionGroupings(forecastCycle, workflowTemplate).forEach((grouping) => {
      const ownerDay = getDiscussionOwnerDay(forecastCycle, grouping);
      addDiscussion(getDiscussionForGrouping(forecastCycle, grouping), ownerDay, grouping.id);
    });
  }

  // A malformed grouping must never make its covered legacy discussions disappear.
  (Object.keys(forecastCycle.days) as unknown as DayType[])
    .sort((a, b) => a - b)
    .forEach((day) => {
      if (exportedDays.has(day)) return;
      addDiscussion(forecastCycle.days[day]?.discussion, day, `day${day}`);
    });

  const blob = await zip.generateAsync({ type: 'blob' });
  const url = URL.createObjectURL(blob);

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const filename = `gfc-package-${timestamp}.zip`;

  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};
