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

const POLYGON_RING = [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]];

const createPolygonFeature = (properties: Record<string, unknown>) => {
  const feature = new Feature({ geometry: new Polygon(POLYGON_RING) });
  Object.entries(properties).forEach(([key, value]) => {
    feature.set(key, value);
  });
  return feature;
};

type DeleteInteraction = ReturnType<typeof createForecastDeleteInteraction>;

const setup = () => {
  const dispatch = jest.fn() as unknown as AppDispatch;
  const select = createForecastDeleteInteraction({ ...createLayers(), dispatch });
  return { dispatch, select };
};

const emitSelect = (select: DeleteInteraction, selected: Feature[]) => {
  select.dispatchEvent(new SelectEvent("select", selected as never[], [], undefined as never));
};

const selectFeature = (select: DeleteInteraction, properties: Record<string, unknown>) => {
  const feature = createPolygonFeature(properties);
  select.getFeatures().push(feature as never);
  emitSelect(select, [feature]);
  return feature;
};

describe("createForecastDeleteInteraction", () => {
  test("creates an inactive selector", () => {
    const { select } = setup();

    expect(select.getActive()).toBe(false);
  });

  const deletionCases = [
    {
      name: "dispatches custom deletion for custom features",
      properties: {
        featureId: "custom-1",
        customLayerId: "layer-1",
        categoryId: "category-1",
        title: "Custom title",
      },
      typeSubstring: "removeCustomFeature",
      payload: { layerId: "layer-1", featureId: "custom-1" },
    },
    {
      name: "dispatches forecast deletion for outlook features",
      properties: {
        featureId: "tornado-1",
        outlookType: "tornado",
        probability: "2%",
      },
      typeSubstring: "removeFeature",
      payload: { outlookType: "tornado", probability: "2%", featureId: "tornado-1" },
    },
  ];

  test.each(deletionCases)("$name", ({ properties, typeSubstring, payload }) => {
    const { dispatch, select } = setup();

    selectFeature(select, properties);

    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({
      type: expect.stringContaining(typeSubstring),
      payload,
    }));
    expect(select.getFeatures().getLength()).toBe(0);
  });

  const noDispatchCases = [
    {
      name: "keeps auto-generated categorical features read-only",
      properties: {
        featureId: "cat-1",
        outlookType: "categorical",
        probability: "TSTM",
        derivedFrom: "auto-generated",
      },
    },
    {
      name: "clears unknown identities without dispatching",
      properties: { outlookType: "tornado" },
    },
  ];

  test.each(noDispatchCases)("$name", ({ properties }) => {
    const { dispatch, select } = setup();

    selectFeature(select, properties);

    expect(dispatch).not.toHaveBeenCalled();
    expect(select.getFeatures().getLength()).toBe(0);
  });

  test("ignores empty selections without dispatching", () => {
    const { dispatch, select } = setup();

    emitSelect(select, []);

    expect(dispatch).not.toHaveBeenCalled();
  });
});
