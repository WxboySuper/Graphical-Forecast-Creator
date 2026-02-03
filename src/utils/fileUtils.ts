import { OutlookData, GFCForecastSaveData, ForecastCycle, DayType, OutlookDay } from '../types/outlooks';

import { validateForecastData } from './validationUtils';

const CURRENT_VERSION = '0.5.0';

// Helper to convert Map to Array for JSON serialization
const mapToArray = <K, V>(m: Map<K, V>): [K, V][] => Array.from(m.entries());

// Helper to convert serializable Array back to Map
const arrayToMap = <K, V>(arr: [K, V][]): Map<K, V> => new Map(arr);

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
      lastModified: new Date().toISOString()
    }
  };
};

/**
 * Serializes the current ForecastCycle into a JSON-compatible format.
 */
export const serializeForecast = (
  forecastCycle: ForecastCycle,
  mapView: { center: [number, number]; zoom: number }
): GFCForecastSaveData => {
  const serializedDays: any = {};
  
  (Object.keys(forecastCycle.days) as unknown as DayType[]).forEach(day => {
    const outlookDay = forecastCycle.days[day];
    if (outlookDay) {
      const serializedData: any = {};
      
      // Only serialize outlook maps that exist for this day
      if (outlookDay.data.tornado) serializedData.tornado = mapToArray(outlookDay.data.tornado);
      if (outlookDay.data.wind) serializedData.wind = mapToArray(outlookDay.data.wind);
      if (outlookDay.data.hail) serializedData.hail = mapToArray(outlookDay.data.hail);
      if (outlookDay.data.totalSevere) serializedData.totalSevere = mapToArray(outlookDay.data.totalSevere);
      if (outlookDay.data['day4-8']) serializedData['day4-8'] = mapToArray(outlookDay.data['day4-8']);
      if (outlookDay.data.categorical) serializedData.categorical = mapToArray(outlookDay.data.categorical);
      
      serializedDays[day] = {
        day: outlookDay.day,
        metadata: outlookDay.metadata,
        data: serializedData,
        discussion: outlookDay.discussion
      };
    }
  });

  return {
    version: CURRENT_VERSION,
    type: 'forecast-cycle',
    timestamp: new Date().toISOString(),
    forecastCycle: {
      days: serializedDays,
      currentDay: forecastCycle.currentDay,
      cycleDate: forecastCycle.cycleDate
    },
    mapView
  };
};

/**
 * Deserializes the saved JSON data back into ForecastCycle.
 * Handles migration from single-day format.
 */
export const deserializeForecast = (data: GFCForecastSaveData): ForecastCycle => {
  // Check for v0.5.0+ format
  if (data.forecastCycle) {
    const days: Partial<Record<DayType, OutlookDay>> = {};
    const cycle = data.forecastCycle;
    
    (Object.keys(cycle.days) as unknown as DayType[]).forEach(day => {
      const savedDay = cycle.days[day];
      if (savedDay) {
        const outlookData: OutlookData = {};
        
        // Only deserialize outlook maps that exist in the saved data
        if (savedDay.data.tornado) outlookData.tornado = arrayToMap(savedDay.data.tornado);
        if (savedDay.data.wind) outlookData.wind = arrayToMap(savedDay.data.wind);
        if (savedDay.data.hail) outlookData.hail = arrayToMap(savedDay.data.hail);
        if (savedDay.data.totalSevere) outlookData.totalSevere = arrayToMap(savedDay.data.totalSevere);
        if (savedDay.data['day4-8']) outlookData['day4-8'] = arrayToMap(savedDay.data['day4-8']);
        if (savedDay.data.categorical) outlookData.categorical = arrayToMap(savedDay.data.categorical);
        
        days[day] = {
          day: savedDay.day,
          metadata: {
            issueDate: savedDay.metadata.issueDate,
            validDate: savedDay.metadata.validDate,
            issuanceTime: savedDay.metadata.issuanceTime,
            createdAt: (savedDay.metadata as any).createdAt || new Date().toISOString(),
            lastModified: (savedDay.metadata as any).lastModified || new Date().toISOString()
          },
          data: outlookData,
          discussion: (savedDay as any).discussion
        };
      }
    });

    return {
      days,
      currentDay: cycle.currentDay,
      cycleDate: cycle.cycleDate
    };
  }

  // Legacy Migration (v0.4.0 and older)
  // Wrap single outlook into Day 1 of a new cycle
  const day1 = createEmptyOutlook(1);
  if (data.outlooks) { // Old format used 'outlooks'
    const outlookData: OutlookData = {};
    if (data.outlooks.tornado) outlookData.tornado = arrayToMap(data.outlooks.tornado);
    if (data.outlooks.wind) outlookData.wind = arrayToMap(data.outlooks.wind);
    if (data.outlooks.hail) outlookData.hail = arrayToMap(data.outlooks.hail);
    if (data.outlooks.categorical) outlookData.categorical = arrayToMap(data.outlooks.categorical);
    day1.data = outlookData;
  }

  return {
    days: { 1: day1 },
    currentDay: 1,
    cycleDate: new Date().toISOString().split('T')[0]
  };
};

/**
 * Triggers a download of the serialized forecast data as a JSON file.
 */
export const exportForecastToJson = (
  forecastCycle: ForecastCycle,
  mapView: { center: [number, number]; zoom: number }
) => {
  const data = serializeForecast(forecastCycle, mapView);
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
