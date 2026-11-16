import { isFeatureExposed } from '../../config/featureExposure';
import type { MesoscaleCatalogParameter } from '../../mesoscale';

/** Filters parameters whose client display is behind a build-target exposure flag. */
export const filterExposedMesoscaleParameters = (
  parameters: MesoscaleCatalogParameter[],
): MesoscaleCatalogParameter[] => isFeatureExposed('mesoscaleDerivedParameters')
  ? parameters
  : parameters.filter(parameter => parameter.id !== 'stp-fixed-surface');
