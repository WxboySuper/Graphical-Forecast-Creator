// @codescene(disable:"Overall Code Complexity")
import type { DayType, ForecastCycle, OutlookData, OutlookDay, OutlookType } from '../../types/outlooks';
import { geometryFromKmlElement } from './kmlGeometry';
import type { ParsedKmlPlacemark } from './types';
import { OUTLOOK_LABEL_TO_TYPE } from './types';

const OUTLOOK_TYPES = new Set<OutlookType>(['categorical', 'tornado', 'wind', 'hail', 'totalSevere', 'day4-8']);

const ELEMENT_NODE = 1;

const isElementNode = (node: ChildNode): node is Element => node.nodeType === ELEMENT_NODE;

const localTagName = (node: Element): string =>
  (node.localName ?? node.tagName.replace(/^[^:]+:/, '')).toLowerCase();

const getExtendedDataValue = (placemark: Element, key: string): string | null => {
  const dataNodes = placemark.getElementsByTagName('Data');
  for (let index = 0; index < dataNodes.length; index += 1) {
    const node = dataNodes[index];
    if (node.getAttribute('name') === key) {
      return node.getElementsByTagName('value')[0]?.textContent?.trim() ?? null;
    }
  }
  return null;
};

const parseDayFromFolderName = (name: string): DayType | null => {
  const match = /^Day\s+(\d+)$/i.exec(name.trim());
  if (!match) {
    return null;
  }

  const day = Number(match[1]);
  if (day < 1 || day > 8) {
    return null;
  }

  return day as DayType;
};

const parseOutlookFromFolderName = (name: string): OutlookType | null => {
  const normalized = name.trim();
  return OUTLOOK_LABEL_TO_TYPE[normalized] ?? null;
};

const parsePlacemarkName = (name: string): { outlookType: OutlookType | null; probabilityKey: string | null } => {
  const trimmed = name.trim();
  for (const [label, outlookType] of Object.entries(OUTLOOK_LABEL_TO_TYPE)) {
    if (trimmed.startsWith(`${label} `)) {
      return {
        outlookType,
        probabilityKey: trimmed.slice(label.length + 1).trim() || null,
      };
    }
  }

  return { outlookType: null, probabilityKey: trimmed || null };
};

const normalizeProbabilityKey = (value: string, isSignificant: boolean): string => {
  const trimmed = value.trim();
  if (!trimmed) {
    return trimmed;
  }

  if (trimmed.startsWith('CIG')) {
    return trimmed;
  }

  if (trimmed.includes('#')) {
    return trimmed;
  }

  if (isSignificant && /^\d+%$/.test(trimmed)) {
    return `${trimmed}#`;
  }

  return trimmed;
};

interface FolderContext {
  day: DayType;
  outlookType: OutlookType | null;
}

// @codescene(disable:"Complex Method", disable:"Complex Conditional")
const parsePlacemark = (
  placemark: Element,
  context: FolderContext,
  warnings: string[],
): ParsedKmlPlacemark | null => {
  const geometryContainer = findElementsByLocalName(placemark, 'polygon')[0]
    ?? findElementsByLocalName(placemark, 'multigeometry')[0]
    ?? placemark;

  const feature = geometryFromKmlElement(geometryContainer);
  if (!feature) {
    warnings.push('Skipped placemark without polygon geometry.');
    return null;
  }

  const extendedDay = Number(getExtendedDataValue(placemark, 'gfc_day') ?? context.day);
  const day = (extendedDay >= 1 && extendedDay <= 8 ? extendedDay : context.day) as DayType;

  const extendedOutlook = getExtendedDataValue(placemark, 'gfc_outlook_type') as OutlookType | null;
  const outlookFromName = parsePlacemarkName(placemark.getElementsByTagName('name')[0]?.textContent ?? '');
  const outlookType = (extendedOutlook && OUTLOOK_TYPES.has(extendedOutlook))
    ? extendedOutlook
    : context.outlookType ?? outlookFromName.outlookType;

  if (!outlookType) {
    warnings.push('Skipped placemark with unknown outlook type.');
    return null;
  }

  const extendedProbability = getExtendedDataValue(placemark, 'gfc_probability_key');
  const probabilityKey = normalizeProbabilityKey(
    extendedProbability ?? outlookFromName.probabilityKey ?? 'UNKNOWN',
    getExtendedDataValue(placemark, 'gfc_significant') === 'true',
  );

  if (probabilityKey === 'UNKNOWN') {
    warnings.push(`Skipped placemark on day ${day} without a probability key.`);
    return null;
  }

  const cigValue = getExtendedDataValue(placemark, 'gfc_cig');
  const isSignificant = getExtendedDataValue(placemark, 'gfc_significant') === 'true'
    || probabilityKey.includes('#')
    || (cigValue !== null && cigValue !== 'false' && cigValue !== 'CIG0');

  return {
    day,
    outlookType,
    probabilityKey,
    feature: {
      ...feature,
      properties: {
        outlookType,
        probability: probabilityKey,
        isSignificant,
      },
    },
    isSignificant,
  };
};

const findElementsByLocalName = (root: Document | Element, name: string): Element[] => {
  const target = name.toLowerCase();
  return Array.from(root.getElementsByTagName('*')).filter((node) => localTagName(node) === target);
};

const childElements = (node: Element): Element[] =>
  Array.from(node.childNodes).filter(isElementNode);

const inferFolderContext = (placemark: Element, defaultDay: DayType): FolderContext => {
  const context: FolderContext = { day: defaultDay, outlookType: null };
  let current = placemark.parentElement;

  while (current) {
    if (localTagName(current) === 'folder') {
      const folderName = childElements(current)
        .find((child) => localTagName(child) === 'name')
        ?.textContent ?? '';
      context.day = parseDayFromFolderName(folderName) ?? context.day;
      context.outlookType = parseOutlookFromFolderName(folderName) ?? context.outlookType;
    }

    current = current.parentElement;
  }

  return context;
};

/** Parses a KML document string into GFC placemark records. */
export const parseKmlDocument = (kml: string, defaultDay: DayType = 1): { placemarks: ParsedKmlPlacemark[]; warnings: string[] } => {
  const warnings: string[] = [];
  const parser = new DOMParser();
  const document = parser.parseFromString(kml, 'application/xml');
  const parserError = document.getElementsByTagName('parsererror')[0];
  if (parserError) {
    throw new Error('File is not valid KML.');
  }

  const placemarks: ParsedKmlPlacemark[] = [];
  const placemarkNodes = findElementsByLocalName(document, 'placemark');

  placemarkNodes.forEach((placemark) => {
    const context = inferFolderContext(placemark, defaultDay);
    const parsed = parsePlacemark(placemark, context, warnings);
    if (parsed) {
      placemarks.push(parsed);
    }
  });

  if (placemarks.length === 0) {
    throw new Error('No supported outlook polygons were found in the KML file.');
  }

  return { placemarks, warnings };
};

const createBaseOutlookData = (day: DayType): OutlookData => {
  if (day === 1 || day === 2) {
    return { tornado: new Map(), wind: new Map(), hail: new Map(), categorical: new Map() };
  }
  if (day === 3) {
    return { totalSevere: new Map(), categorical: new Map() };
  }
  return { 'day4-8': new Map() };
};

const createOutlookDay = (day: DayType): OutlookDay => {
  const now = new Date().toISOString();
  return {
    day,
    data: createBaseOutlookData(day),
    metadata: {
      issueDate: now,
      validDate: now,
      issuanceTime: '1200',
      createdAt: now,
      lastModified: now,
      lowProbabilityOutlooks: [],
    },
  };
};

/** Merges parsed KML placemarks into a forecast cycle, preserving untouched days. */
export const forecastCycleFromKmlPlacemarks = (
  placemarks: ParsedKmlPlacemark[],
  baseCycle?: ForecastCycle,
): ForecastCycle => {
  const cycle: ForecastCycle = baseCycle
    ? {
        ...baseCycle,
        days: { ...baseCycle.days },
      }
    : {
        cycleDate: new Date().toISOString().slice(0, 10),
        currentDay: placemarks[0]?.day ?? 1,
        days: {},
      };

  placemarks.forEach((placemark) => {
    const existingDay = cycle.days[placemark.day] ?? createOutlookDay(placemark.day);
    const outlookMap = existingDay.data[placemark.outlookType] ?? new Map();
    const bucket = [...(outlookMap.get(placemark.probabilityKey) ?? [])];
    bucket.push(placemark.feature);
    outlookMap.set(placemark.probabilityKey, bucket);

    cycle.days[placemark.day] = {
      ...existingDay,
      data: {
        ...existingDay.data,
        [placemark.outlookType]: outlookMap,
      },
      metadata: {
        ...existingDay.metadata,
        lastModified: new Date().toISOString(),
      },
    };
  });

  if (!cycle.days[cycle.currentDay]) {
    cycle.currentDay = placemarks[0]?.day ?? 1;
  }

  return cycle;
};
