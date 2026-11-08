/**
 * Pure helpers for editing the ordered list of active layers. The array order is
 * draw order, bottom to top; the panel shows it top first.
 */
import type { MesoscaleModelContext } from '../../store/mesoscaleSlice';
import { DEFAULT_LAYER_OPACITY } from './layerGroups';

export type ActiveLayers = MesoscaleModelContext['activeLayers'];

export const addLayer = (layers: ActiveLayers, id: string): ActiveLayers =>
  layers.some(layer => layer.id === id) ? layers : [...layers, { id, opacity: DEFAULT_LAYER_OPACITY }];

export const removeLayer = (layers: ActiveLayers, id: string): ActiveLayers =>
  layers.filter(layer => layer.id !== id);

export const setOpacity = (layers: ActiveLayers, id: string, opacity: number): ActiveLayers =>
  layers.map(layer => (layer.id === id ? { ...layer, opacity: Math.min(1, Math.max(0, opacity)) } : layer));

/** Moves a layer one step toward the top (direction 1) or bottom (-1) of the stack. */
export const moveLayer = (layers: ActiveLayers, id: string, direction: 1 | -1): ActiveLayers => {
  const index = layers.findIndex(layer => layer.id === id);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= layers.length) return layers;
  const next = [...layers];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
};
