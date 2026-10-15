import reducer, { normalizeBaseMapStyle, setBaseMapStyle, applyOverlaySettings } from './overlaysSlice';

describe('overlaysSlice', () => {
  test('defaults ghost outlook overlays to off', () => {
    const state = reducer(undefined, { type: '@@INIT' });

    expect(Object.values(state.ghostOutlooks)).toEqual([false, false, false, false, false, false]);
  });

  test('redirects saved CARTO styles to OpenStreetMap', () => {
    expect(normalizeBaseMapStyle('carto-light')).toBe('osm');
    expect(normalizeBaseMapStyle('carto-dark')).toBe('osm');
    expect(reducer(undefined, setBaseMapStyle('carto-dark')).baseMapStyle).toBe('osm');
    expect(reducer(undefined, applyOverlaySettings({ baseMapStyle: 'carto-light' })).baseMapStyle).toBe('osm');
  });
});
