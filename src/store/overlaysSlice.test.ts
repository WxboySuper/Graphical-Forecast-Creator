import reducer, { applyOverlaySettings, normalizeBaseMapStyle, setBaseMapStyle } from './overlaysSlice';

describe('overlaysSlice', () => {
  test('defaults ghost outlook overlays to off', () => {
    const state = reducer(undefined, { type: '@@INIT' });

    expect(Object.values(state.ghostOutlooks)).toEqual([false, false, false, false, false, false]);
    expect(state.outlookTrimAutoOnDraw).toBe(false);
    expect(state.outlookTrimPreviewOnly).toBe(false);
    expect(state.outlookTrimStrategy).toBe('us-country-minus-great-lakes');
  });

  test('redirects the retired dark basemap to light', () => {
    expect(normalizeBaseMapStyle('carto-dark')).toBe('carto-light');
    expect(reducer(undefined, setBaseMapStyle('carto-dark')).baseMapStyle).toBe('carto-light');
    expect(reducer(undefined, applyOverlaySettings({ baseMapStyle: 'carto-dark' })).baseMapStyle).toBe('carto-light');
  });
});
