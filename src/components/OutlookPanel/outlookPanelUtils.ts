import { OutlookType, CategoricalRiskLevel, TornadoProbability, WindProbability, HailProbability, CIGLevel } from '../../types/outlooks';
import { colorMappings } from '../../utils/outlookUtils';

export const getAvailableProbabilities = (activeOutlookType: OutlookType) => {
  const cigs: CIGLevel[] = ['CIG1', 'CIG2', 'CIG3']; // Available hatching options
  
  switch (activeOutlookType) {
    case 'categorical':
      // Only TSTM is manually drawn. Others are converted.
      return ['TSTM'] as CategoricalRiskLevel[];
    case 'tornado':
      return ['2%', '5%', '10%', '15%', '30%', '45%', '60%', ...cigs] as (TornadoProbability | CIGLevel)[];
    case 'wind':
      return ['5%', '15%', '30%', '45%', '60%', '75%', '90%', ...cigs] as (WindProbability | CIGLevel)[];
    case 'hail':
      return ['5%', '15%', '30%', '45%', '60%', ...cigs] as (HailProbability | CIGLevel)[];
    default:
      return [] as string[];
  }
};

// Legacy significance removed - always false
export const canBeSignificant = (
  activeOutlookType: OutlookType,
  activeProbability: string,
  significantThreatsEnabled: boolean
) => {
  return false;
};

export const getProbabilityButtonStyle = (activeOutlookType: OutlookType, activeProbability: string, prob: string) => {
  const isActive = activeProbability === prob;
  let color: string;
  let textColor: string;

  if (activeOutlookType === 'categorical') {
    color = colorMappings.categorical[prob as keyof typeof colorMappings.categorical] || '#FFFFFF';
    if (['TSTM', 'MRGL', 'SLGT'].includes(prob)) {
      textColor = '#000000';
    } else {
      textColor = '#FFFFFF';
    }
  } else if (prob.startsWith('CIG')) {
     // Hatching buttons
     color = '#e0e0e0';
     textColor = '#000000';
  } else {
    // Determine color map
    let colorMap: any;
    if (activeOutlookType === 'tornado') colorMap = colorMappings.tornado;
    else if (activeOutlookType === 'wind') colorMap = colorMappings.wind;
    else colorMap = colorMappings.hail;

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
  if (activeProbability.startsWith('CIG')) {
      return '#e0e0e0'; // Placeholder for color preview
  }
  
  let colorMap: any;
  if (activeOutlookType === 'tornado') colorMap = colorMappings.tornado;
  else if (activeOutlookType === 'wind') colorMap = colorMappings.wind;
  else colorMap = colorMappings.hail;
  
  return colorMap[activeProbability as keyof typeof colorMap] || '#FFFFFF';
};