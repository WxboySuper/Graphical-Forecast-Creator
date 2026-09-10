/**
 * File: src/components/Map/openLayersForecastEditInteractions.ts
 * Purpose: Defines OpenLayers edit interactions for modifying forecast features and geometry.
 */

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
  /** Allows vertex deletion only on a single Alt-click or Shift-click. */
  const deleteCondition = (event: Parameters<typeof singleClick>[0]) =>
    singleClick(event) && (altKeyOnly(event) || shiftKeyOnly(event));
  const modify = new Modify({
    source: vectorSource,
    filter: (feature) => {
      const customIdentity = getCustomFeatureIdentity(feature);
      if (customIdentity) {
        return isCustomMode() && customIdentity.categoryId === activeCustomCategoryId();
      }
      return matchesPrecisionEditTier(feature, activeOutlookType(), activeProbability());
    },
    deleteCondition,
  });
  modify.on("modifyend", (event) => onModifyEnd(event.features.getArray(), false));
  map.addInteraction(modify);

  const catModify = new Modify({
    source: catSource,
    filter: (feature) => {
      if (feature.get("derivedFrom") === "auto-generated") return false;
      return matchesPrecisionEditTier(feature, "categorical", activeProbability());
    },
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
