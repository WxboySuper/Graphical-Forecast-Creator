import type { MutableRefObject } from "react";
import type LayerGroup from "ol/layer/Group";
import type TileLayer from "ol/layer/Tile";
import type OSM from "ol/source/OSM";
import type XYZ from "ol/source/XYZ";
import type { BaseMapStyle } from "../../store/overlaysSlice";
import { getOpenFreeMapStyleSet } from "../../lib/openFreeMap";
import {
  createLabelOverlaySource,
  createTileSource,
  isCurrentOpenFreeMapRequest,
  loadOpenFreeMapLayerGroups,
  replaceLayerGroupLayers,
} from "./openLayersMapStyles";

interface OpenFreeMapBasemapOptions {
  style: Exclude<BaseMapStyle, "blank">;
  tile: TileLayer<OSM | XYZ>;
  labels: TileLayer<OSM | XYZ>;
  vectorBaseGroup: LayerGroup;
  vectorReferenceGroup: LayerGroup;
  requestRef: MutableRefObject<number>;
  /** Caller-owned request id from beginOpenFreeMapBasemapRequest. */
  requestId: number;
  logPrefix: string;
}

/**
 * Starts the next basemap request: increments the caller's counter and
 * returns the fresh id. Every style change calls this before branching so a
 * pending vector load from an earlier selection can never apply.
 */
export const beginOpenFreeMapBasemapRequest = (
  requestRef: MutableRefObject<number>,
): number => {
  requestRef.current += 1;
  return requestRef.current;
};

/**
 * Replaces both vector groups after a successful load, falling back to raster
 * tiles and labels when vector loading fails. Callers take the id from
 * beginOpenFreeMapBasemapRequest and own all raster/blank layer setup.
 */
export const loadOpenFreeMapBasemap = ({
  style,
  tile,
  labels,
  vectorBaseGroup,
  vectorReferenceGroup,
  requestRef,
  requestId,
  logPrefix,
}: OpenFreeMapBasemapOptions): void => {
  getOpenFreeMapStyleSet(style)
    .then(loadOpenFreeMapLayerGroups)
    .then(({ baseGroup, referenceGroup }) => {
      if (!isCurrentOpenFreeMapRequest(requestRef.current, requestId)) return;
      replaceLayerGroupLayers(vectorBaseGroup, baseGroup);
      replaceLayerGroupLayers(vectorReferenceGroup, referenceGroup);
      vectorBaseGroup.setVisible(true);
      vectorReferenceGroup.setVisible(true);
    })
    .catch((error) => {
      if (!isCurrentOpenFreeMapRequest(requestRef.current, requestId)) return;
      console.warn(
        `[${logPrefix}] falling back to raster basemap after vector load failure`,
        { baseMapStyle: style, error },
      );
      vectorBaseGroup.getLayers().clear();
      vectorReferenceGroup.getLayers().clear();
      tile.setSource(createTileSource(style));
      tile.setVisible(true);
      const labelSource = createLabelOverlaySource(style);
      if (labelSource) {
        labels.setSource(labelSource);
        labels.setVisible(true);
      }
    });
};
