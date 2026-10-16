import VectorSource from 'ol/source/Vector';
import { Style } from 'ol/style';
import {
  ALERTS_LAYER_Z_INDEX,
  MONITOR_LAYER_Z_ORDER,
  OUTLOOK_LAYER_Z_INDEX,
  SPC_REFERENCE_LAYER_Z_INDEX,
  STATE_OUTLINE_LAYER_Z_INDEX,
  STORM_REPORTS_LAYER_Z_INDEX,
  TOP_VECTOR_REFERENCE_LAYER_Z_INDEX,
  createMesoscaleDiscussionStyle,
  createStateOutlineStyle,
  loadUsStateOutlines,
} from './monitorMapLayerUtils';

describe('monitor reference layer order', () => {
  test('keeps official references below alerts and user overlays', () => {
    expect(MONITOR_LAYER_Z_ORDER).toEqual({
      spcMesoscaleDiscussion: SPC_REFERENCE_LAYER_Z_INDEX,
      alerts: ALERTS_LAYER_Z_INDEX,
      outlook: OUTLOOK_LAYER_Z_INDEX,
      stateOutlines: STATE_OUTLINE_LAYER_Z_INDEX,
      stormReports: STORM_REPORTS_LAYER_Z_INDEX,
      mapReferenceControls: TOP_VECTOR_REFERENCE_LAYER_Z_INDEX,
    });
    expect(SPC_REFERENCE_LAYER_Z_INDEX).toBeLessThan(ALERTS_LAYER_Z_INDEX);
    expect(ALERTS_LAYER_Z_INDEX).toBeLessThan(OUTLOOK_LAYER_Z_INDEX);
    expect(OUTLOOK_LAYER_Z_INDEX).toBeLessThan(STATE_OUTLINE_LAYER_Z_INDEX);
    expect(STATE_OUTLINE_LAYER_Z_INDEX).toBeLessThan(STORM_REPORTS_LAYER_Z_INDEX);
    expect(STORM_REPORTS_LAYER_Z_INDEX).toBeLessThan(TOP_VECTOR_REFERENCE_LAYER_Z_INDEX);
  });

  test('uses the same stable z-index for mesoscale discussion polygons', () => {
    expect(createMesoscaleDiscussionStyle().getZIndex()).toBe(SPC_REFERENCE_LAYER_Z_INDEX);
  });
});

const DARK_OUTLINE_STROKE = 'rgba(226, 232, 240, 0.72)';
const LIGHT_OUTLINE_STROKE = 'rgba(51, 65, 85, 0.88)';

const outlineGeoJSON = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: {},
      geometry: {
        type: 'Polygon',
        coordinates: [[[-100, 40], [-99, 40], [-99, 41], [-100, 41], [-100, 40]]],
      },
    },
  ],
};

const outlineStrokeColorOf = (source: VectorSource): unknown => {
  const style = source.getFeatures()[0]?.getStyle() as Style | undefined;
  return style?.getStroke()?.getColor();
};

describe('loadUsStateOutlines', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  test('styles features with the theme at fetch-resolve time, not call time', async () => {
    let resolveFetch: ((value: unknown) => void) | undefined;
    global.fetch = jest.fn().mockImplementation(
      () => new Promise((resolve) => { resolveFetch = resolve; }),
    ) as jest.Mock;

    const source = new VectorSource();
    let currentTheme = false;
    const load = loadUsStateOutlines(source, () => currentTheme);

    // Theme toggles while the GeoJSON fetch is still in flight.
    currentTheme = true;
    await Promise.resolve();
    resolveFetch?.({ ok: true, json: async () => outlineGeoJSON });
    await load;

    expect(source.getFeatures()).toHaveLength(1);
    expect(outlineStrokeColorOf(source)).toBe(DARK_OUTLINE_STROKE);
  });

  test('still accepts a plain boolean theme', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => outlineGeoJSON,
    }) as jest.Mock;

    const source = new VectorSource();
    await loadUsStateOutlines(source, false);

    expect(source.getFeatures()).toHaveLength(1);
    expect(outlineStrokeColorOf(source)).toBe(LIGHT_OUTLINE_STROKE);
    expect(createStateOutlineStyle(true).getStroke()?.getColor()).toBe(DARK_OUTLINE_STROKE);
  });
});
