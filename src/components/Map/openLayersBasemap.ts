import type { MutableRefObject } from "react";
import LayerGroup from "ol/layer/Group";
import TileLayer from "ol/layer/Tile";
import OSM from "ol/source/OSM";
import XYZ from "ol/source/XYZ";
import type { BaseMapStyle } from "../../store/overlaysSlice";
import { getOpenFreeMapStyleSet } from "../../lib/openFreeMap";
import {
  createLabelOverlaySource,
  createTileSource,
  replaceLayerGroupLayers,
  loadOpenFreeMapLayerGroups,
} from "./openLayersMapStyles";

interface OpenFreeMapBasemapOptions {
  style: BaseMapStyle;
  tile: TileLayer<OSM | XYZ>;
  labels: TileLayer<OSM | XYZ>;
  vectorBaseGroup: LayerGroup;
  vectorReferenceGroup: LayerGroup;
  requestRef: MutableRefObject<number>;
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

/** Loads a vector basemap and keeps its raster fallback behavior consistent across maps. */
export const loadOpenFreeMapBasemap = ({
  style,
  tile,
  labels,
  vectorBaseGroup,
  vectorReferenceGroup,
  requestRef,
  logPrefix,
}: OpenFreeMapBasemapOptions): void => {
  const requestId = requestRef.current + 1;
  requestRef.current = requestId;
  vectorBaseGroup.setVisible(false);
  vectorReferenceGroup.setVisible(false);
  vectorBaseGroup.getLayers().clear();
  vectorReferenceGroup.getLayers().clear();

  getOpenFreeMapStyleSet(style)
    .then(loadOpenFreeMapLayerGroups)
    .then(({ baseGroup, referenceGroup }) => {
      if (requestRef.current !== requestId) return;
      replaceLayerGroupLayers(vectorBaseGroup, baseGroup);
      replaceLayerGroupLayers(vectorReferenceGroup, referenceGroup);
      vectorBaseGroup.setVisible(true);
      vectorReferenceGroup.setVisible(true);
    })
    .catch((error) => {
      if (requestRef.current !== requestId) return;
      console.warn(
        `[${logPrefix}] falling back to raster basemap after vector load failure`,
        { baseMapStyle: style, error },
      );
      vectorBaseGroup.getLayers().clear();
      vectorReferenceGroup.getLayers().clear();
      applyRasterBasemap({
        style: style as Exclude<BaseMapStyle, "blank">,
        tile,
        labels,
      });
      tile.setVisible(true);
    });
};
