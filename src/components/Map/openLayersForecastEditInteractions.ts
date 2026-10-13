import type OLMap from "ol/Map";
import type OLFeature from "ol/Feature";
import type Geometry from "ol/geom/Geometry";
import { Modify, Snap } from "ol/interaction";
import type VectorSource from "ol/source/Vector";
import { altKeyOnly, shiftKeyOnly, singleClick } from "ol/events/condition";

import { matchesPrecisionEditTier } from "./precisionPolygonEditing";
import { getCustomFeatureIdentity } from "./openLayersMapStyles";

export type ForecastEditInteractions = {
  modify: Modify;
  catModify: Modify;
  snap: Snap;
  catSnap: Snap;
  ghostSnap: Snap;
};

type ModifyEndHandler = (features: OLFeature<Geometry>[], isCategorical: boolean) => void;

export type ForecastEditGetters = {
  isCustomMode: () => boolean;
  activeCustomCategoryId: () => string | undefined;
  activeOutlookType: () => string;
  activeProbability: () => string;
};

/** Allows vertex deletion only on a single Alt-click or Shift-click. */
export const forecastVertexDeleteCondition = (event: Parameters<typeof singleClick>[0]): boolean =>
  singleClick(event) && (altKeyOnly(event) || shiftKeyOnly(event));

/** Matches editable standard/custom features against the active outlook tier. */
export const createForecastModifyFilter =
  ({ isCustomMode, activeCustomCategoryId, activeOutlookType, activeProbability }: ForecastEditGetters) =>
  (feature: OLFeature<Geometry>): boolean => {
    const customIdentity = getCustomFeatureIdentity(feature);
    if (customIdentity) {
      return isCustomMode() && customIdentity.categoryId === activeCustomCategoryId();
    }
    return matchesPrecisionEditTier(feature, activeOutlookType(), activeProbability());
  };

/** Matches editable categorical features, excluding auto-generated polygons. */
export const createCategoricalModifyFilter =
  ({ activeProbability }: Pick<ForecastEditGetters, "activeProbability">) =>
  (feature: OLFeature<Geometry>): boolean => {
    if (feature.get("derivedFrom") === "auto-generated") return false;
    return matchesPrecisionEditTier(feature, "categorical", activeProbability());
  };

/** Registers forecast editing and snapping interactions on the map. */
export const registerForecastEditInteractions = ({
  map,
  vectorSource,
  catSource,
  ghostSource,
  isCustomMode,
  activeCustomCategoryId,
  activeOutlookType,
  activeProbability,
  onModifyEnd,
}: {
  map: OLMap;
  vectorSource: VectorSource;
  catSource: VectorSource;
  ghostSource: VectorSource;
  isCustomMode: () => boolean;
  activeCustomCategoryId: () => string | undefined;
  activeOutlookType: () => string;
  activeProbability: () => string;
  onModifyEnd: ModifyEndHandler;
}): ForecastEditInteractions => {
  const deleteCondition = forecastVertexDeleteCondition;
  const modify = new Modify({
    source: vectorSource,
    filter: createForecastModifyFilter({
      isCustomMode,
      activeCustomCategoryId,
      activeOutlookType,
      activeProbability,
    }),
    deleteCondition,
  });
  modify.on("modifyend", (event) => onModifyEnd(event.features.getArray(), false));
  map.addInteraction(modify);

  const catModify = new Modify({
    source: catSource,
    filter: createCategoricalModifyFilter({ activeProbability }),
    deleteCondition,
  });
  catModify.on("modifyend", (event) => onModifyEnd(event.features.getArray(), true));
  map.addInteraction(catModify);

  const snap = new Snap({ source: vectorSource });
  const catSnap = new Snap({ source: catSource });
  const ghostSnap = new Snap({ source: ghostSource });
  map.addInteraction(snap);
  map.addInteraction(catSnap);
  map.addInteraction(ghostSnap);

  return { modify, catModify, snap, catSnap, ghostSnap };
};
