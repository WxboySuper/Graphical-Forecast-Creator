import type { default as OLMap } from "ol/Map";
import type { Draw } from "ol/interaction";
import type { CustomCategoryStyle } from "../../types/customProducts";

/** Builds the style portion of a custom-feature reconciliation signature without serializing the style object. */
export const getCustomStyleSignature = (style: CustomCategoryStyle, isTopLayer: boolean): string => [
  style.fillColor,
  style.fillOpacity,
  style.strokeColor,
  style.strokeOpacity,
  style.strokeWidth,
  style.hatch,
  isTopLayer,
].join("|");

// OpenLayers 10.9.0 stores the delayed pointer callback in this private field:
// https://github.com/openlayers/openlayers/blob/v10.9.0/src/ol/interaction/Draw.js#L740-L751
// Recheck this workaround whenever `ol` is upgraded; remove it once upstream
// guarantees that detaching Draw cancels the pending callback.
type DrawWithPendingPointerMove = {
  downTimeout_?: ReturnType<typeof setTimeout>;
};

/** Removes a Draw interaction and cancels OpenLayers' delayed pointer callback. */
export const removeDrawInteraction = (map: OLMap, interaction: Draw): void => {
  const draw = interaction as unknown as DrawWithPendingPointerMove;
  if (draw.downTimeout_ !== undefined) {
    clearTimeout(draw.downTimeout_);
    draw.downTimeout_ = undefined;
  }

  map.removeInteraction(interaction);
};
