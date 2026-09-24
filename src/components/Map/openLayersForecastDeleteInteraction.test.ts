/**
 * Focused tests for the extracted forecast delete interaction seam.
 * Covers the inactive default, the auto-generated categorical guard,
 * custom/forecast deletion dispatches, and the unknown-identity no-op.
 */
import Feature from "ol/Feature";
import Polygon from "ol/geom/Polygon";
import VectorLayer from "ol/layer/Vector";
import VectorSource from "ol/source/Vector";
import { SelectEvent } from "ol/interaction/Select";

import type { AppDispatch } from "../../store";
import { createForecastDeleteInteraction } from "./openLayersForecastDeleteInteraction";

const createLayers = () => ({
  vectorLayer: new VectorLayer({ source: new VectorSource() }),
  catLayer: new VectorLayer({ source: new VectorSource() }),
});

const createPolygonFeature = (properties: Record<string, unknown>) => {
  const feature = new Feature({
    geometry: new Polygon([[
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
      [0, 0],
    ]]),
  });
  Object.entries(properties).forEach(([key, value]) => {
    feature.set(key, value);
  });
  return feature;
};

const emitSelect = (select: ReturnType<typeof createForecastDeleteInteraction>, selected: Feature[]) => {
  select.dispatchEvent(new SelectEvent("select", selected as never[], [], undefined as never));
};

describe("createForecastDeleteInteraction", () => {
  test("creates an inactive selector", () => {
    const dispatch = jest.fn() as unknown as AppDispatch;
    const select = createForecastDeleteInteraction({ ...createLayers(), dispatch });

    expect(select.getActive()).toBe(false);
  });

  test("keeps auto-generated categorical features read-only", () => {
    const dispatch = jest.fn() as unknown as AppDispatch;
    const select = createForecastDeleteInteraction({ ...createLayers(), dispatch });
    const feature = createPolygonFeature({
      featureId: "cat-1",
      outlookType: "categorical",
      probability: "TSTM",
      derivedFrom: "auto-generated",
    });
    select.getFeatures().push(feature as never);

    emitSelect(select, [feature as never]);

    expect(dispatch).not.toHaveBeenCalled();
    expect(select.getFeatures().getLength()).toBe(0);
  });

  test("dispatches custom deletion for custom features", () => {
    const dispatch = jest.fn() as unknown as AppDispatch;
    const select = createForecastDeleteInteraction({ ...createLayers(), dispatch });
    const feature = createPolygonFeature({
      featureId: "custom-1",
      customLayerId: "layer-1",
      categoryId: "category-1",
      title: "Custom title",
    });
    select.getFeatures().push(feature as never);

    emitSelect(select, [feature as never]);

    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({
      type: expect.stringContaining("removeCustomFeature"),
      payload: { layerId: "layer-1", featureId: "custom-1" },
    }));
    expect(select.getFeatures().getLength()).toBe(0);
  });

  test("dispatches forecast deletion for outlook features", () => {
    const dispatch = jest.fn() as unknown as AppDispatch;
    const select = createForecastDeleteInteraction({ ...createLayers(), dispatch });
    const feature = createPolygonFeature({
      featureId: "tornado-1",
      outlookType: "tornado",
      probability: "2%",
    });
    select.getFeatures().push(feature as never);

    emitSelect(select, [feature as never]);

    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({
      type: expect.stringContaining("removeFeature"),
      payload: { outlookType: "tornado", probability: "2%", featureId: "tornado-1" },
    }));
    expect(select.getFeatures().getLength()).toBe(0);
  });

  test("clears unknown identities without dispatching", () => {
    const dispatch = jest.fn() as unknown as AppDispatch;
    const select = createForecastDeleteInteraction({ ...createLayers(), dispatch });
    const feature = createPolygonFeature({ outlookType: "tornado" });
    select.getFeatures().push(feature as never);

    emitSelect(select, [feature as never]);

    expect(dispatch).not.toHaveBeenCalled();
    expect(select.getFeatures().getLength()).toBe(0);
  });

  test("ignores empty selections without dispatching", () => {
    const dispatch = jest.fn() as unknown as AppDispatch;
    const select = createForecastDeleteInteraction({ ...createLayers(), dispatch });

    emitSelect(select, []);

    expect(dispatch).not.toHaveBeenCalled();
  });
});
