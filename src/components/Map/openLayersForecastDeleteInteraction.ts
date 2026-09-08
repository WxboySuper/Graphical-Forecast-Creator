/**
 * OpenLayers forecast-feature delete interaction.
 *
 * This module translates map delete gestures into forecast-layer updates. The forecast store owns persistence and this file manages only the map interaction boundary.
 */
import { click } from "ol/events/condition";
import type OLFeature from "ol/Feature";
import type Geometry from "ol/geom/Geometry";
import { Select } from "ol/interaction";
import type VectorLayer from "ol/layer/Vector";
import type VectorSource from "ol/source/Vector";

import { removeCustomFeature, removeFeature } from "../../store/forecastSlice";
import type { AppDispatch } from "../../store";
import {
  getCustomFeatureIdentity,
  getFeatureIdentity,
  type EditableOutlookType,
} from "./openLayersMapStyles";

type SelectableLayer = VectorLayer<VectorSource>;

/** Creates the inactive delete selector used by the forecast map. */
export const createForecastDeleteInteraction = ({
  vectorLayer,
  catLayer,
  dispatch,
}: {
  vectorLayer: SelectableLayer;
  catLayer: SelectableLayer;
  dispatch: AppDispatch;
}): Select => {
  const select = new Select({
    condition: click,
    layers: [vectorLayer, catLayer],
  });
  select.setActive(false);
  select.on("select", (event) => {
    const selected = event.selected[0] as OLFeature<Geometry> | undefined;
    if (!selected) return;

    /** Clears the transient OpenLayers selection after a delete decision. */
    const clearSelection = () => select.getFeatures().clear();
    const outlookType = selected.get("outlookType") as string | undefined;
    const derivedFrom = selected.get("derivedFrom") as string | undefined;

    // Auto-generated categorical polygons are read-only. Their source outlooks regenerate them.
    if (outlookType === "categorical" && derivedFrom === "auto-generated") {
      clearSelection();
      return;
    }

    const customIdentity = getCustomFeatureIdentity(selected);
    if (customIdentity) {
      dispatch(removeCustomFeature({ layerId: customIdentity.customLayerId, featureId: customIdentity.featureId }));
      clearSelection();
      return;
    }

    const identity = getFeatureIdentity(selected);
    if (!identity) {
      clearSelection();
      return;
    }

    dispatch(
      removeFeature({
        outlookType: identity.outlookType as EditableOutlookType,
        probability: identity.probability,
        featureId: identity.featureId,
      }),
    );
    clearSelection();
  });
  return select;
};
