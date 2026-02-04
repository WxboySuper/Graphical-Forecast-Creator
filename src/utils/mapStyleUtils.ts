import * as L from 'leaflet';
import { OutlookType } from '../types/outlooks';
import { colorMappings } from './outlookUtils';

export type FeatureStyle = L.PathOptions & {
  className?: string;
  zIndex?: number;
  fillColor?: string;
  fillOpacity?: number;
};

const RISK_ORDER: Record<string, number> = {
  TSTM: 0, MRGL: 1, SLGT: 2, ENH: 3, MDT: 4, HIGH: 5
};

export const sortProbabilities = (entries: [string, GeoJSON.Feature[]][]): [string, GeoJSON.Feature[]][] => {
  return [...entries].sort((a, b) => {
    const [probA, probB] = [a[0], b[0]];

    const isCigA = probA.startsWith('CIG');
    const isCigB = probB.startsWith('CIG');
    
    if (isCigA !== isCigB) {
      return isCigA ? 1 : -1;
    }
    
    if (isCigA && isCigB) {
      return probA.localeCompare(probB);
    }

    if (probA === 'TSTM') return -1;
    if (probB === 'TSTM') return 1;

    if (RISK_ORDER[probA] !== undefined && RISK_ORDER[probB] !== undefined) {
      return RISK_ORDER[probA] - RISK_ORDER[probB];
    }

    const getPercentValue = (prob: string) => parseInt(prob.replace(/[^0-9]/g, '')) || 0;
    return getPercentValue(probA) - getPercentValue(probB);
  });
};

export const lookupColor = (outlookType: OutlookType, probability: string) => {
  switch (outlookType) {
    case 'categorical':
      return colorMappings.categorical[probability as keyof typeof colorMappings.categorical] || '#FFFFFF';
    case 'tornado':
      return colorMappings.tornado[probability as keyof typeof colorMappings.tornado] || '#FFFFFF';
    case 'wind':
    case 'hail':
      return colorMappings.wind[probability as keyof typeof colorMappings.wind] || '#FFFFFF';
    default:
      return '#FFFFFF';
  }
};

export const computeZIndex = (outlookType: OutlookType, probability: string) => {
  let baseZIndex = 400;
  if (outlookType === 'categorical') {
    baseZIndex += (RISK_ORDER[probability] || 0) * 10;
  } else {
    if (probability.startsWith('CIG')) {
      baseZIndex = 600;
      baseZIndex += parseInt(probability.replace('CIG', '')) || 0;
    } else {
      baseZIndex += parseInt(probability) || 0;
    }
  }
  return baseZIndex;
};

export const getFeatureStyle = (outlookType: OutlookType, probability: string): FeatureStyle => {
  if (probability.startsWith('CIG')) {
    const patternMap: Record<string, string> = {
      'CIG1': 'url(#pattern-cig1)',
      'CIG2': 'url(#pattern-cig2)',
      'CIG3': 'url(#pattern-cig3)',
      'CIG0': 'none'
    };
    const fill = patternMap[probability] || 'none';
    return {
      color: '#000000',
      weight: 1,
      opacity: 1,
      fillColor: fill,
      fillOpacity: 1,
      zIndex: computeZIndex(outlookType, probability),
      className: 'hatching-layer'
    };
  }

  const color = lookupColor(outlookType, probability);
  return {
    color: color,
    weight: 2,
    opacity: 1,
    fillColor: color,
    fillOpacity: 0.2,
    zIndex: computeZIndex(outlookType, probability)
  };
};
