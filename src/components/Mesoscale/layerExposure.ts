import { flag } from '../../config/flags';
import type { MesoscaleCatalogParameter } from '../../mesoscale';

/** Filters parameters whose client display is behind a build-target exposure flag. */
export const filterExposedMesoscaleParameters = (
  parameters: MesoscaleCatalogParameter[],
): MesoscaleCatalogParameter[] => flag('mesoscaleDerivedParameters')
  ? parameters
  : parameters.filter(parameter => parameter.id !== 'stp-fixed-surface');
