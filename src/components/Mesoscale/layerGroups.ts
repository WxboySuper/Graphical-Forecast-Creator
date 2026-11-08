/**
 * Layer grouping for the Mesoscale workspace: sorts the catalog's parameters into
 * a few forecaster-friendly themes. Presentation only; parameter identity, units,
 * and legends always come from the catalog.
 */
import type { MesoscaleCatalogParameter } from '../../mesoscale';

export interface LayerGroup {
  id: string;
  label: string;
  parameters: MesoscaleCatalogParameter[];
}

const GROUP_DEFINITIONS: ReadonlyArray<{ id: string; label: string; pattern: RegExp }> = [
  { id: 'instability', label: 'Instability', pattern: /^(cape|cin)-/ },
  { id: 'rotation', label: 'Wind and rotation', pattern: /^(srh|wind)-/ },
  { id: 'moisture', label: 'Temperature and moisture', pattern: /^(temperature|dewpoint|pwat|surface-lcl)/ },
  { id: 'other', label: 'Pressure and radar', pattern: /./ },
];

const groupIdFor = (parameterId: string): string =>
  (GROUP_DEFINITIONS.find(({ pattern }) => pattern.test(parameterId)) ?? GROUP_DEFINITIONS[GROUP_DEFINITIONS.length - 1]).id;

/** Groups parameters by theme, keeping catalog order and omitting empty themes. */
export const groupParameters = (parameters: MesoscaleCatalogParameter[]): LayerGroup[] =>
  GROUP_DEFINITIONS
    .map(({ id, label }) => ({ id, label, parameters: parameters.filter(parameter => groupIdFor(parameter.id) === id) }))
    .filter(group => group.parameters.length > 0);

/** The field shown first: surface-based CAPE has an unambiguous definition. */
export const DEFAULT_LAYER_ID = 'cape-surface';
export const DEFAULT_LAYER_OPACITY = 0.7;
