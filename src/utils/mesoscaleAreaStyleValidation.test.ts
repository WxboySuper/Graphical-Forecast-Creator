import { createInitialMesoscaleState, type MesoscaleArea } from '../store/mesoscaleSlice';
import { isAreaStyle, sanitizeAreaStyle } from './mesoscaleAreaStyleValidation';
import { isMesoscaleArea } from './mesoscaleAreaValidation';
import { classifyMesoscaleSave, createMesoscaleSave, exportMesoscaleJson, importMesoscaleJson } from './mesoscalePersistence';

const t = '2026-11-20T12:00:00.000Z';
const baseArea = (): MesoscaleArea => ({
  id: 'a1', title: 'Area 1', hazard: 'Severe thunderstorms', validStart: t, validEnd: '2026-11-20T15:00:00.000Z', createdAt: t, updatedAt: t,
  geometry: { type: 'Polygon', coordinates: [[[-100, 34], [-97, 34], [-97, 36], [-100, 36], [-100, 34]]] },
});
const productWith = (area: unknown) => ({ ...createInitialMesoscaleState(), areas: [area] }) as never;
const envelope = (area: unknown) => ({ schemaVersion: 1, workspaceId: 'mesoscale', product: productWith(area) });

describe('area style validation', () => {
  it('accepts a complete valid style and the empty style', () => {
    expect(isAreaStyle({ fillPattern: 'hatch', fillColor: '#56b4e9', fillOpacity: 0.5, outlineColor: '#0072B2', outlineWidth: 4, outlineDash: 'dash-dot' })).toBe(true);
    expect(isAreaStyle({})).toBe(true);
  });

  it.each([
    ['unknown field', { glow: true }],
    ['bad color', { fillColor: 'red' }],
    ['short hex', { outlineColor: '#fff' }],
    ['opacity above range', { fillOpacity: 1.5 }],
    ['opacity below range', { fillOpacity: 0 }],
    ['width above range', { outlineWidth: 40 }],
    ['non-finite width', { outlineWidth: Number.NaN }],
    ['unknown dash', { outlineDash: 'wavy' }],
    ['unknown pattern', { fillPattern: 'checker' }],
    ['not an object', 'solid'],
  ])('rejects %s', (_name, style) => {
    expect(isAreaStyle(style)).toBe(false);
  });

  it('lets an area carry a style but rejects an invalid one', () => {
    expect(isMesoscaleArea({ ...baseArea(), style: { outlineColor: '#111827' } })).toBe(true);
    expect(isMesoscaleArea({ ...baseArea(), style: { outlineColor: 'nope' } })).toBe(false);
    expect(isMesoscaleArea({ ...baseArea(), style: null })).toBe(false);
  });
});

describe('sanitizeAreaStyle', () => {
  it('clamps numbers, lowercases colors, and drops unknown or invalid fields', () => {
    expect(sanitizeAreaStyle({ fillOpacity: 9, outlineWidth: -3, fillColor: '#ABCDEF', outlineColor: 'blue', outlineDash: 'zigzag', extra: 1 }))
      .toEqual({ fillOpacity: 1, outlineWidth: 1, fillColor: '#abcdef' });
  });

  it('returns undefined when nothing usable is left', () => {
    expect(sanitizeAreaStyle({ outlineDash: 'zigzag' })).toBeUndefined();
    expect(sanitizeAreaStyle(null)).toBeUndefined();
    expect(sanitizeAreaStyle('x')).toBeUndefined();
    expect(sanitizeAreaStyle([])).toBeUndefined();
  });
});

describe('saved areas and styles', () => {
  it('loads an old saved area without a style exactly as it was', () => {
    const saved = envelope(baseArea());
    const result = classifyMesoscaleSave(JSON.parse(JSON.stringify(saved)));
    expect(result).toMatchObject({ ok: true });
    expect(result.ok && result.payload).toEqual(saved);
    expect(result.ok && 'style' in result.payload.product.areas[0]).toBe(false);
  });

  it('round trips a style through export and import', () => {
    const style = { fillPattern: 'solid' as const, fillColor: '#56b4e9', fillOpacity: 0.35, outlineColor: '#0072b2', outlineWidth: 4, outlineDash: 'dotted' as const };
    const product = productWith({ ...baseArea(), style });
    expect(importMesoscaleJson(exportMesoscaleJson(product).json)).toEqual(product);
  });

  it('clamps or drops bad hand-edited styles on load instead of rejecting the save', () => {
    const edited = envelope({ ...baseArea(), style: { fillOpacity: 7, outlineWidth: 2, outlineColor: 'javascript:alert(1)', sparkle: true } });
    const result = classifyMesoscaleSave(JSON.parse(JSON.stringify(edited)));
    expect(result.ok && result.payload.product.areas[0].style).toEqual({ fillOpacity: 1, outlineWidth: 2 });
  });

  it('drops a style that is not an object, keeping the area', () => {
    const result = classifyMesoscaleSave(envelope({ ...baseArea(), style: 'red' }));
    expect(result.ok && result.payload.product.areas[0]).toEqual(baseArea());
  });

  it('still rejects a style that is invalid when saving', () => {
    expect(() => createMesoscaleSave(productWith({ ...baseArea(), style: { outlineWidth: 99 } }))).toThrow(/invalid fields/i);
  });
});
