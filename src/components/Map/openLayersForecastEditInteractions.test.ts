import Feature from "ol/Feature";
import type Geometry from "ol/geom/Geometry";
import Polygon from "ol/geom/Polygon";
import type OLMap from "ol/Map";
import VectorSource from "ol/source/Vector";

import { registerForecastEditInteractions } from "./openLayersForecastEditInteractions";

type FilterFn = (feature: Feature<Geometry>) => boolean;
type DeleteConditionFn = (event: {
  type: string;
  originalEvent: {
    altKey: boolean;
    shiftKey: boolean;
    metaKey: boolean;
    ctrlKey: boolean;
  };
}) => boolean;

type MutableState = {
  customMode: boolean;
  categoryId: string | undefined;
  outlookType: string;
  probability: string;
};

const polygon = (): Polygon => new Polygon([[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]]);

const makeFeature = (props: Record<string, unknown>): Feature<Geometry> => {
  const feature = new Feature<Geometry>({ geometry: polygon() });
  Object.entries(props).forEach(([key, value]) => {
    feature.set(key, value);
  });
  return feature;
};

const setup = (overrides: Partial<MutableState> = {}) => {
  const state: MutableState = {
    customMode: false,
    categoryId: "cat-a",
    outlookType: "tornado",
    probability: "5%",
    ...overrides,
  };
  const vectorSource = new VectorSource();
  const catSource = new VectorSource();
  const ghostSource = new VectorSource();
  const onModifyEnd = jest.fn();
  const map = { addInteraction: jest.fn() } as unknown as OLMap;

  const interactions = registerForecastEditInteractions({
    map,
    vectorSource,
    catSource,
    ghostSource,
    isCustomMode: () => state.customMode,
    activeCustomCategoryId: () => state.categoryId,
    activeOutlookType: () => state.outlookType,
    activeProbability: () => state.probability,
    onModifyEnd,
  });

  const filterOf = (interaction: { get: (key: string) => unknown }): FilterFn =>
    (interaction as unknown as { filter_: FilterFn }).filter_;
  const deleteConditionOf = (interaction: { get: (key: string) => unknown }): DeleteConditionFn =>
    (interaction as unknown as { deleteCondition_: DeleteConditionFn }).deleteCondition_;

  return { state, map, interactions, onModifyEnd, filterOf, deleteConditionOf };
};

const clickEvent = (
  type: string,
  modifiers: { altKey?: boolean; shiftKey?: boolean; metaKey?: boolean; ctrlKey?: boolean } = {},
) => ({
  type,
  originalEvent: {
    altKey: modifiers.altKey ?? false,
    shiftKey: modifiers.shiftKey ?? false,
    metaKey: modifiers.metaKey ?? false,
    ctrlKey: modifiers.ctrlKey ?? false,
  },
});

describe("openLayersForecastEditInteractions", () => {
  test("registers modify, categorical modify, and three snap interactions on the map", () => {
    const { map, interactions } = setup();

    expect(map.addInteraction).toHaveBeenCalledTimes(5);
    expect(interactions.modify).toBeDefined();
    expect(interactions.catModify).toBeDefined();
    expect(interactions.snap).toBeDefined();
    expect(interactions.catSnap).toBeDefined();
    expect(interactions.ghostSnap).toBeDefined();
  });

  test("regular filter allows custom features only in custom mode with a matching category", () => {
    const { interactions, filterOf } = setup({ customMode: true, categoryId: "cat-a" });
    const filter = filterOf(interactions.modify);

    const matching = makeFeature({
      featureId: "custom-1",
      customLayerId: "layer-1",
      categoryId: "cat-a",
      title: "Title",
    });
    const otherCategory = makeFeature({
      featureId: "custom-2",
      customLayerId: "layer-1",
      categoryId: "cat-b",
      title: "Title",
    });

    expect(filter(matching)).toBe(true);
    expect(filter(otherCategory)).toBe(false);
  });

  test("regular filter rejects custom features when custom mode is off", () => {
    const { state, interactions, filterOf } = setup({ customMode: true, categoryId: "cat-a" });
    const filter = filterOf(interactions.modify);
    const custom = makeFeature({
      featureId: "custom-1",
      customLayerId: "layer-1",
      categoryId: "cat-a",
      title: "Title",
    });

    expect(filter(custom)).toBe(true);
    state.customMode = false;
    expect(filter(custom)).toBe(false);
  });

  test("regular filter falls back to the active outlook tier for standard features", () => {
    const { interactions, filterOf } = setup({ outlookType: "tornado", probability: "5%" });
    const filter = filterOf(interactions.modify);

    expect(filter(makeFeature({ outlookType: "tornado", probability: "5%" }))).toBe(true);
    expect(filter(makeFeature({ outlookType: "wind", probability: "5%" }))).toBe(false);
    expect(filter(makeFeature({ outlookType: "tornado", probability: "10%" }))).toBe(false);
  });

  test("categorical filter rejects auto-generated polygons even when the tier matches", () => {
    const { interactions, filterOf } = setup({ probability: "TSTM" });
    const filter = filterOf(interactions.catModify);

    expect(
      filter(makeFeature({ outlookType: "categorical", probability: "TSTM", derivedFrom: "auto-generated" })),
    ).toBe(false);
    expect(filter(makeFeature({ outlookType: "categorical", probability: "TSTM" }))).toBe(true);
    expect(filter(makeFeature({ outlookType: "categorical", probability: "MRGL" }))).toBe(false);
  });

  test("delete condition allows only single Alt-click or single Shift-click", () => {
    const { interactions, deleteConditionOf } = setup();
    const deleteCondition = deleteConditionOf(interactions.modify);
    const catDeleteCondition = deleteConditionOf(interactions.catModify);

    expect(deleteCondition(clickEvent("singleclick", { altKey: true }))).toBe(true);
    expect(deleteCondition(clickEvent("singleclick", { shiftKey: true }))).toBe(true);
    expect(catDeleteCondition(clickEvent("singleclick", { altKey: true }))).toBe(true);
    expect(catDeleteCondition(clickEvent("singleclick", { shiftKey: true }))).toBe(true);

    expect(deleteCondition(clickEvent("singleclick"))).toBe(false);
    expect(deleteCondition(clickEvent("singleclick", { altKey: true, shiftKey: true }))).toBe(false);
    expect(deleteCondition(clickEvent("click", { altKey: true }))).toBe(false);
    expect(deleteCondition(clickEvent("dblclick", { shiftKey: true }))).toBe(false);
  });

  test("filters read getter values dynamically after registration", () => {
    const { state, interactions, filterOf } = setup({
      customMode: false,
      outlookType: "tornado",
      probability: "5%",
    });
    const filter = filterOf(interactions.modify);
    const catFilter = filterOf(interactions.catModify);
    const tierFeature = makeFeature({ outlookType: "tornado", probability: "5%" });

    expect(filter(tierFeature)).toBe(true);
    state.outlookType = "wind";
    expect(filter(tierFeature)).toBe(false);

    state.customMode = true;
    state.categoryId = "cat-a";
    const custom = makeFeature({
      featureId: "custom-1",
      customLayerId: "layer-1",
      categoryId: "cat-a",
      title: "Title",
    });
    expect(filter(custom)).toBe(true);
    state.categoryId = "cat-b";
    expect(filter(custom)).toBe(false);

    state.probability = "TSTM";
    expect(catFilter(makeFeature({ outlookType: "categorical", probability: "TSTM" }))).toBe(true);
    state.probability = "MRGL";
    expect(catFilter(makeFeature({ outlookType: "categorical", probability: "TSTM" }))).toBe(false);
  });

  test("modifyend forwards edited features with the categorical flag", () => {
    const { interactions, onModifyEnd } = setup();
    const edited = makeFeature({ outlookType: "tornado", probability: "5%" });
    const catEdited = makeFeature({ outlookType: "categorical", probability: "TSTM" });

    interactions.modify.dispatchEvent({
      type: "modifyend",
      features: { getArray: () => [edited] },
    } as unknown as never);
    interactions.catModify.dispatchEvent({
      type: "modifyend",
      features: { getArray: () => [catEdited] },
    } as unknown as never);

    expect(onModifyEnd).toHaveBeenCalledTimes(2);
    expect(onModifyEnd).toHaveBeenNthCalledWith(1, [edited], false);
    expect(onModifyEnd).toHaveBeenNthCalledWith(2, [catEdited], true);
  });
});
