import { OutlookType, CategoricalRiskLevel, TornadoProbability, WindHailProbability } from '../../types/outlooks';
import { colorMappings } from '../../utils/outlookUtils';

export const getAvailableProbabilities = (activeOutlookType: OutlookType) => {
  switch (activeOutlookType) {
    case 'categorical':
      return ['TSTM', 'MRGL', 'SLGT', 'ENH', 'MDT', 'HIGH'] as CategoricalRiskLevel[];
    case 'tornado':
      return ['2%', '5%', '10%', '15%', '30%', '45%', '60%'] as TornadoProbability[];
    case 'wind':
    case 'hail':
      return ['5%', '15%', '30%', '45%', '60%'] as WindHailProbability[];
    default:
      return [] as string[];
  }
};

export const canBeSignificant = (
  activeOutlookType: OutlookType,
  activeProbability: string,
  significantThreatsEnabled: boolean
) => {
  if (!significantThreatsEnabled || activeOutlookType === 'categorical') return false;
  const probability = activeProbability.replace('#', '');
  switch (activeOutlookType) {
    case 'tornado':
      return !['2%', '5%'].includes(probability);
    case 'wind':
    case 'hail':
      return !['5%'].includes(probability);
    default:
      return false;
  }
};

export const getProbabilityButtonStyle = (activeOutlookType: OutlookType, activeProbability: string, prob: string) => {
  const isActive = activeProbability === prob;
  let color = '#FFFFFF';
  let textColor = '#000000';

  if (activeOutlookType === 'categorical') {
    color = colorMappings.categorical[prob as keyof typeof colorMappings.categorical] || '#FFFFFF';
    if (['TSTM', 'MRGL', 'SLGT'].includes(prob)) {
      textColor = '#000000';
    } else {
      textColor = '#FFFFFF';
    }
  } else {
    const colorMap = activeOutlookType === 'tornado' ? colorMappings.tornado : colorMappings.wind;
    color = colorMap[prob as keyof typeof colorMap] || '#FFFFFF';
    textColor = '#FFFFFF';
  }

  return {
    backgroundColor: color,
    color: textColor,
    boxShadow: isActive ? '0 0 0 2px white, 0 0 0 4px #3f51b5' : undefined
  };
};

export const getCurrentColor = (activeOutlookType: OutlookType, activeProbability: string) => {
  if (activeOutlookType === 'categorical') {
    return colorMappings.categorical[activeProbability as keyof typeof colorMappings.categorical] || '#FFFFFF';
  }
  const colorMap = activeOutlookType === 'tornado' ? colorMappings.tornado : colorMappings.wind;
  return colorMap[activeProbability as keyof typeof colorMap] || '#FFFFFF';
};