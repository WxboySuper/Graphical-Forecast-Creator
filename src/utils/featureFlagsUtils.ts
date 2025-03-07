import { FeatureFlags } from '../store/featureFlagsSlice';
import { OutlookType } from '../types/outlooks';

/**
 * Gets the first enabled outlook type from the feature flags
 * If no outlook types are enabled, returns 'categorical' as a fallback
 */
export const getFirstEnabledOutlookType = (featureFlags: FeatureFlags): OutlookType => {
  if (featureFlags.tornadoOutlookEnabled) return 'tornado';
  if (featureFlags.windOutlookEnabled) return 'wind';
  if (featureFlags.hailOutlookEnabled) return 'hail';
  if (featureFlags.categoricalOutlookEnabled) return 'categorical';
  
  // If somehow all outlooks are disabled, return categorical as a fallback
  // The UI will show emergency mode and prevent new drawings
  return 'categorical';
};

/**
 * Checks if any outlook type is enabled
 */
export const isAnyOutlookEnabled = (featureFlags: FeatureFlags): boolean => {
  return (
    featureFlags.tornadoOutlookEnabled ||
    featureFlags.windOutlookEnabled ||
    featureFlags.hailOutlookEnabled ||
    featureFlags.categoricalOutlookEnabled
  );
};

/**
 * Gets whether a specific outlook type is enabled
 */
export const isOutlookTypeEnabled = (featureFlags: FeatureFlags, type: OutlookType): boolean => {
  switch (type) {
    case 'tornado':
      return featureFlags.tornadoOutlookEnabled;
    case 'wind':
      return featureFlags.windOutlookEnabled;
    case 'hail':
      return featureFlags.hailOutlookEnabled;
    case 'categorical':
      return featureFlags.categoricalOutlookEnabled;
    default:
      return false;
  }
};