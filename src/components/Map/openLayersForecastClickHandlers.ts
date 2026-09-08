/**
 * Handles forecast-map click interactions for selecting and editing rendered outlook features.
 * This module owns click-to-action translation and overlay coordination; it delegates paint-bucket mutations and store updates to their boundaries.
 */
import OLMap from "ol/Map";
import Overlay from "ol/Overlay";
import VectorLayer from "ol/layer/Vector";
import type { AppDispatch } from "../../store";
import type { DayType, OutlookType } from "../../types/outlooks";
import { isPaintBucketOutlookType, type PaintBucketMode, type PaintBucketStepDirection } from "../../utils/paintBucket";
import { getCustomFeatureIdentity, hideOverlay } from "./openLayersMapStyles";
import { handlePaintBucketMapClick } from "./paintBucketMapInteraction";

/** Returns whether a click belongs to the paint-bucket editing interaction. */
export const shouldHandlePaintBucketClick = (
  paintBucketEnabled: boolean,
  interactionMode: "pan" | "draw" | "delete" | "edit",
  customMode: boolean,
  activeOutlookType: string,
): boolean => paintBucketEnabled
  && interactionMode === "edit"
  && !customMode
  && isPaintBucketOutlookType(activeOutlookType);

interface ForecastMapClickEvent {
  pixel: number[];
  coordinate: number[];
  originalEvent: { shiftKey?: boolean };
}

/** Handles map clicks for forecast editing, drawing, and paint-bucket interactions. */
export const handleForecastMapClick = ({
  map,
  event,
  mode,
  paintBucketEnabled,
  customMode,
  activeOutlookType,
  editBehavior,
  stepDirection,
  activeProbability,
  currentDay,
  vectorLayer,
  catLayer,
  dispatch,
  overlay,
  setFeedback,
  setPopupInfo,
}: {
  map: OLMap;
  event: ForecastMapClickEvent;
  mode: "pan" | "draw" | "delete" | "edit";
  paintBucketEnabled: boolean;
  customMode: boolean;
  activeOutlookType: string;
  editBehavior: PaintBucketMode;
  stepDirection: PaintBucketStepDirection;
  activeProbability: string;
  currentDay: DayType;
  vectorLayer: VectorLayer | null;
  catLayer: VectorLayer | null;
  dispatch: AppDispatch;
  overlay: Overlay | null;
  setFeedback: (value: string | null) => void;
  setPopupInfo: (value: { outlookType: string; probability: string; isSignificant: boolean } | null) => void;
}): void => {
  if (shouldHandlePaintBucketClick(paintBucketEnabled, mode, customMode, activeOutlookType)) {
    setFeedback(null);
    handlePaintBucketMapClick({
      map,
      pixel: event.pixel,
      vectorLayer,
      dispatch,
      outlookType: activeOutlookType as OutlookType,
      currentDay,
      mode: editBehavior,
      stepDirection,
      shiftKey: Boolean(event.originalEvent.shiftKey),
      activeProbability,
      onNoOp: () => setFeedback(`Set mode: this polygon already uses ${activeProbability}.`),
    });
    return;
  }

  if (mode !== "pan") return;

  const feature = map.forEachFeatureAtPixel(event.pixel, (candidate) => candidate, {
    layerFilter: (layer) => layer === vectorLayer || layer === catLayer,
  });
  if (feature && overlay) {
    const customIdentity = getCustomFeatureIdentity(feature);
    const outlookType = customIdentity
      ? (feature.get("customLayerTitle") as string || "Custom layer")
      : feature.get("outlookType") as string;
    const probability = customIdentity?.title ?? feature.get("probability") as string;
    const isSignificant = feature.get("isSignificant") as boolean;
    setPopupInfo({ outlookType, probability, isSignificant });
    overlay.setPosition(event.coordinate);
    return;
  }

  if (overlay) {
    hideOverlay(overlay);
    setPopupInfo(null);
  }
};
