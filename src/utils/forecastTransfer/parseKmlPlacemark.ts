import type { DayType, OutlookType } from '../../types/outlooks';
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
  if (!match) return null;
  const day = Number(match[1]);
  return day >= 1 && day <= 8 ? day as DayType : null;
};

const parseOutlookFromFolderName = (name: string): OutlookType | null =>
  OUTLOOK_LABEL_TO_TYPE[name.trim()] ?? null;

const parsePlacemarkName = (name: string): { outlookType: OutlookType | null; probabilityKey: string | null } => {
  const trimmed = name.trim();
  for (const [label, outlookType] of Object.entries(OUTLOOK_LABEL_TO_TYPE)) {
    if (trimmed.startsWith(`${label} `)) {
      return { outlookType, probabilityKey: trimmed.slice(label.length + 1).trim() || null };
    }
  }
  return { outlookType: null, probabilityKey: trimmed || null };
};

// @codescene(disable:"Complex Conditional", disable:"Overall Code Complexity", disable:"String Heavy Function Arguments")
const normalizeProbabilityKey = (value: string, isSignificant: boolean): string => {
  const trimmed = value.trim();
  if (!trimmed || trimmed.startsWith('CIG') || trimmed.includes('#')) {
    return trimmed;
  }
  if (!isSignificant) {
    return trimmed;
  }
  return /^\d+%$/.test(trimmed) ? `${trimmed}#` : trimmed;
};

interface FolderContext {
  day: DayType;
  outlookType: OutlookType | null;
}

const findElementsByLocalName = (root: Document | Element, name: string): Element[] => {
  const target = name.toLowerCase();
  return Array.from(root.getElementsByTagName('*')).filter((node) => localTagName(node) === target);
};

export const findKmlElementsByLocalName = findElementsByLocalName;

const childElements = (node: Element): Element[] => Array.from(node.childNodes).filter(isElementNode);

export const inferKmlFolderContext = (placemark: Element, defaultDay: DayType): FolderContext => {
  const context: FolderContext = { day: defaultDay, outlookType: null };
  let current = placemark.parentElement;
  while (current) {
    if (localTagName(current) === 'folder') {
      const folderName = childElements(current)
        .find((child) => localTagName(child) === 'name')?.textContent ?? '';
      context.day = parseDayFromFolderName(folderName) ?? context.day;
      context.outlookType = parseOutlookFromFolderName(folderName) ?? context.outlookType;
    }
    current = current.parentElement;
  }
  return context;
};

// @codescene(disable:"Complex Method", disable:"Complex Conditional")
export const parseKmlPlacemark = (
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
  const outlookType = extendedOutlook && OUTLOOK_TYPES.has(extendedOutlook)
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
      properties: { outlookType, probability: probabilityKey, isSignificant },
    },
    isSignificant,
  };
};
