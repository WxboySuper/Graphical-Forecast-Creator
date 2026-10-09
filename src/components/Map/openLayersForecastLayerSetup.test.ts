jest.mock("ol-mapbox-style", () => ({ apply: jest.fn() }));

jest.mock("./openLayersMapStyles", () => {
  const actual = jest.requireActual("./openLayersMapStyles") as Record<string, unknown>;
  const createLabelOverlaySource = actual["createLabelOverlaySource"] as (...args: never[]) => unknown;
  return {
    ...actual,
    createLabelOverlaySource: jest.fn((...args: never[]) => createLabelOverlaySource(...args)),
  };
});

import OSM from "ol/source/OSM";
import XYZ from "ol/source/XYZ";
import VectorSource from "ol/source/Vector";

import { createForecastMapLayers } from "./openLayersForecastLayerSetup";
import {
  GHOST_REFERENCE_LAYER_Z_INDEX,
  TOP_LABEL_LAYER_Z_INDEX,
  TOP_OUTLINE_LAYER_Z_INDEX,
  TOP_VECTOR_REFERENCE_LAYER_Z_INDEX,
  createLabelOverlaySource,
} from "./openLayersMapStyles";
import {
  BLANK_LAND_FILL_STYLE,
  BLANK_LAND_OUTLINE_STYLE,
} from "./openLayersBlankBasemap";

const mockedCreateLabelOverlaySource = createLabelOverlaySource as jest.MockedFunction<
  typeof createLabelOverlaySource
>;

/** Builds one fresh vector source per forecast layer input. */
const createLayerSources = () => ({
  worldSource: new VectorSource(),
  lakesSource: new VectorSource(),
  landSource: new VectorSource(),
  catSource: new VectorSource(),
  ghostSource: new VectorSource(),
  tstmPreviewSource: new VectorSource(),
  trimPreviewSource: new VectorSource(),
  vectorSource: new VectorSource(),
});

beforeEach(() => {
  mockedCreateLabelOverlaySource.mockReset();
  const actual = jest.requireActual("./openLayersMapStyles") as {
    createLabelOverlaySource: typeof createLabelOverlaySource;
  };
  mockedCreateLabelOverlaySource.mockImplementation((...args) =>
    actual.createLabelOverlaySource(...args),
  );
});

describe("createForecastMapLayers", () => {
  test("keeps each vector layer on its supplied source", () => {
    const sources = createLayerSources();
    const layers = createForecastMapLayers(sources);

    expect(layers.worldLayer.getSource()).toBe(sources.worldSource);
    expect(layers.lakesLayer.getSource()).toBe(sources.lakesSource);
    expect(layers.catLayer.getSource()).toBe(sources.catSource);
    expect(layers.ghostLayer.getSource()).toBe(sources.ghostSource);
    expect(layers.tstmPreviewLayer.getSource()).toBe(sources.tstmPreviewSource);
    expect(layers.trimPreviewLayer.getSource()).toBe(sources.trimPreviewSource);
    expect(layers.vectorLayer.getSource()).toBe(sources.vectorSource);
    expect(layers.landLayer.getSource()).toBe(sources.landSource);
    expect(layers.landOutlineLayer.getSource()).toBe(sources.landSource);
    expect(layers.landLayer).not.toBe(layers.landOutlineLayer);
  });

  test("sets the expected visibility, z-index, opacity, and blank styles", () => {
    const layers = createForecastMapLayers(createLayerSources());

    expect(layers.vectorBaseGroup.getVisible()).toBe(false);
    expect(layers.vectorBaseGroup.getZIndex()).toBe(1);
    expect(layers.vectorReferenceGroup.getVisible()).toBe(false);
    expect(layers.vectorReferenceGroup.getZIndex()).toBe(TOP_VECTOR_REFERENCE_LAYER_Z_INDEX);

    expect(layers.worldLayer.getVisible()).toBe(false);
    expect(layers.worldLayer.getZIndex()).toBe(1);
    expect(layers.lakesLayer.getVisible()).toBe(false);
    expect(layers.lakesLayer.getZIndex()).toBe(1.5);
    expect(layers.landLayer.getVisible()).toBe(false);
    expect(layers.landLayer.getZIndex()).toBe(2);
    expect(layers.landLayer.getStyle()).toBe(BLANK_LAND_FILL_STYLE);
    expect(layers.landOutlineLayer.getVisible()).toBe(false);
    expect(layers.landOutlineLayer.getZIndex()).toBe(TOP_OUTLINE_LAYER_Z_INDEX);
    expect(layers.landOutlineLayer.getStyle()).toBe(BLANK_LAND_OUTLINE_STYLE);

    expect(layers.catLayer.getZIndex()).toBe(3);
    expect(layers.catLayer.getOpacity()).toBe(1);
    expect(layers.ghostLayer.getZIndex()).toBe(GHOST_REFERENCE_LAYER_Z_INDEX);
    expect(layers.tstmPreviewLayer.getZIndex()).toBe(TOP_OUTLINE_LAYER_Z_INDEX + 5);
    expect(layers.trimPreviewLayer.getZIndex()).toBe(TOP_OUTLINE_LAYER_Z_INDEX + 6);
    expect(layers.vectorLayer.getZIndex()).toBe(4);

    expect(layers.labelLayer.getVisible()).toBe(true);
    expect(layers.labelLayer.getZIndex()).toBe(TOP_LABEL_LAYER_Z_INDEX);
  });

  test("orders previews and outlines above the main outlook layers", () => {
    const layers = createForecastMapLayers(createLayerSources());

    expect(layers.vectorLayer.getZIndex() ?? 0).toBeGreaterThan(layers.catLayer.getZIndex() ?? 0);
    expect(layers.ghostLayer.getZIndex() ?? 0).toBeGreaterThan(layers.catLayer.getZIndex() ?? 0);
    expect(layers.tstmPreviewLayer.getZIndex() ?? 0).toBeGreaterThan(
      layers.ghostLayer.getZIndex() ?? 0,
    );
    expect(layers.trimPreviewLayer.getZIndex() ?? 0).toBeGreaterThan(
      layers.tstmPreviewLayer.getZIndex() ?? 0,
    );
    expect(layers.labelLayer.getZIndex() ?? 0).toBeGreaterThan(
      layers.trimPreviewLayer.getZIndex() ?? 0,
    );
  });

  test("starts on OSM and accepts an XYZ basemap source", () => {
    const layers = createForecastMapLayers(createLayerSources());

    expect(layers.tileLayer.getSource()).toBeInstanceOf(OSM);

    const xyz = new XYZ({ url: "https://example.com/{z}/{x}/{y}.png" });
    layers.tileLayer.setSource(xyz);

    expect(layers.tileLayer.getSource()).toBe(xyz);
  });

  test("uses the OSM label overlay source when available", () => {
    const layers = createForecastMapLayers(createLayerSources());

    expect(mockedCreateLabelOverlaySource).toHaveBeenCalledWith("osm");
    expect(layers.labelLayer.getSource()).toBeInstanceOf(XYZ);
  });

  test("keeps the label layer usable when no overlay source is available", () => {
    mockedCreateLabelOverlaySource.mockReturnValueOnce(null);
    const layers = createForecastMapLayers(createLayerSources());

    expect(layers.labelLayer.getSource()).toBeNull();
    expect(layers.labelLayer.getVisible()).toBe(true);
    expect(layers.labelLayer.getZIndex()).toBe(TOP_LABEL_LAYER_Z_INDEX);
  });
});
