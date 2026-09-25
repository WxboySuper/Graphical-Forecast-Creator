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
  /** Caller-owned request id. The helper never increments the counter itself. */
  requestId: number;
  logPrefix: string;
}

interface RasterBasemapOptions {
  style: Exclude<BaseMapStyle, "blank">;
  tile: TileLayer<OSM | XYZ>;
  labels: TileLayer<OSM | XYZ>;
}

/** Applies a raster tile source and keeps its optional label overlay in sync. */
export const applyRasterBasemap = ({ style, tile, labels }: RasterBasemapOptions): void => {
  tile.setSource(createTileSource(style));
  const labelSource = createLabelOverlaySource(style);
  if (labelSource) {
    labels.setSource(labelSource);
    labels.setVisible(true);
  } else {
    labels.setVisible(false);
  }
};

/**
 * Replaces both vector groups after a successful load, falling back to raster
 * tiles and labels when vector loading fails. Callers own request-id
 * increments and all raster/blank layer setup.
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
      applyRasterBasemap({
        style,
        tile,
        labels,
      });
      tile.setVisible(true);
    });
};
