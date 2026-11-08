/**
 * Layer ordering tests: adding, removing, reordering, and clamping opacity for the
 * ordered active-layer list, plus theme grouping of catalog parameters.
 */
import type { MesoscaleCatalogParameter } from '../../mesoscale';
import { groupParameters } from './layerGroups';
import { addLayer, moveLayer, removeLayer, setOpacity } from './layerOrdering';

const layers = [{ id: 'a', opacity: 0.5 }, { id: 'b', opacity: 0.7 }, { id: 'c', opacity: 0.9 }];

describe('layerOrdering', () => {
  it('adds a layer on top once and ignores duplicates', () => {
    const added = addLayer(layers, 'd');
    expect(added.map(layer => layer.id)).toEqual(['a', 'b', 'c', 'd']);
    expect(addLayer(added, 'd')).toBe(added);
  });

  it('removes a layer by id', () => {
    expect(removeLayer(layers, 'b').map(layer => layer.id)).toEqual(['a', 'c']);
  });

  it('clamps opacity between zero and one', () => {
    expect(setOpacity(layers, 'a', 4)[0].opacity).toBe(1);
    expect(setOpacity(layers, 'a', -2)[0].opacity).toBe(0);
    expect(setOpacity(layers, 'a', 0.25)[0].opacity).toBe(0.25);
  });

  it('moves a layer toward the top or bottom and stops at the ends', () => {
    expect(moveLayer(layers, 'a', 1).map(layer => layer.id)).toEqual(['b', 'a', 'c']);
    expect(moveLayer(layers, 'c', -1).map(layer => layer.id)).toEqual(['a', 'c', 'b']);
    expect(moveLayer(layers, 'c', 1)).toBe(layers);
    expect(moveLayer(layers, 'a', -1)).toBe(layers);
    expect(moveLayer(layers, 'missing', 1)).toBe(layers);
  });
});

describe('groupParameters', () => {
  const parameter = (id: string) => ({ id, displayName: id } as MesoscaleCatalogParameter);

  it('sorts parameters into themes in order and omits empty themes', () => {
    const groups = groupParameters(['cape-surface', 'srh-0-1km', 'pwat', 'mslp', 'wind-speed-10m'].map(parameter));
    expect(groups.map(group => group.id)).toEqual(['instability', 'rotation', 'moisture', 'other']);
    expect(groups[1].parameters.map(item => item.id)).toEqual(['srh-0-1km', 'wind-speed-10m']);
    expect(groupParameters([parameter('cape-surface')]).map(group => group.id)).toEqual(['instability']);
  });
});
