/**
 * File: src/components/Map/openLayersForecastLayerSetup.ts
 * Purpose: Builds and configures OpenLayers forecast layers, sources, styles, and interactions.
 */

import LayerGroup from "ol/layer/Group";
import TileLayer from "ol/layer/Tile";
import VectorLayer from "ol/layer/Vector";
import OSM from "ol/source/OSM";
import XYZ from "ol/source/XYZ";
import type VectorSource from "ol/source/Vector";

import {
  GHOST_REFERENCE_LAYER_Z_INDEX,
  TOP_LABEL_LAYER_Z_INDEX,
  TOP_OUTLINE_LAYER_Z_INDEX,
  TOP_VECTOR_REFERENCE_LAYER_Z_INDEX,
  createLabelOverlaySource,
} from "./openLayersMapStyles";
import {
  BLANK_LAND_FILL_STYLE,
  BLANK_LAND_OUTLINE_STYLE,
} from "./openLayersBlankBasemap";

export type ForecastMapLayerSet = {
  tileLayer: TileLayer<OSM>;
  vectorBaseGroup: LayerGroup;
  vectorReferenceGroup: LayerGroup;
  worldLayer: VectorLayer<VectorSource>;
  lakesLayer: VectorLayer<VectorSource>;
  landLayer: VectorLayer<VectorSource>;
  landOutlineLayer: VectorLayer<VectorSource>;
  catLayer: VectorLayer<VectorSource>;
  ghostLayer: VectorLayer<VectorSource>;
  tstmPreviewLayer: VectorLayer<VectorSource>;
  trimPreviewLayer: VectorLayer<VectorSource>;
  vectorLayer: VectorLayer<VectorSource>;
  labelLayer: TileLayer<XYZ>;
};

type ForecastMapLayerSources = {
  worldSource: VectorSource;
  lakesSource: VectorSource;
  landSource: VectorSource;
  catSource: VectorSource;
  ghostSource: VectorSource;
  tstmPreviewSource: VectorSource;
  trimPreviewSource: VectorSource;
  vectorSource: VectorSource;
};

/** Creates the stable layer graph used by the forecast OpenLayers map. */
export const createForecastMapLayers = ({
  worldSource,
  lakesSource,
  landSource,
  catSource,
  ghostSource,
  tstmPreviewSource,
  trimPreviewSource,
  vectorSource,
}: ForecastMapLayerSources): ForecastMapLayerSet => {
  const tileLayer = new TileLayer({
    source: new OSM({ crossOrigin: "anonymous" }),
  });
  const vectorBaseGroup = new LayerGroup({ visible: false, zIndex: 1 });
  const vectorReferenceGroup = new LayerGroup({
    visible: false,
    zIndex: TOP_VECTOR_REFERENCE_LAYER_Z_INDEX,
  });
  const worldLayer = new VectorLayer({ source: worldSource, visible: false, zIndex: 1 });
  const lakesLayer = new VectorLayer({ source: lakesSource, visible: false, zIndex: 1.5 });
  const landLayer = new VectorLayer({
    source: landSource,
    visible: false,
    zIndex: 2,
    style: BLANK_LAND_FILL_STYLE,
  });
  const landOutlineLayer = new VectorLayer({
    source: landSource,
    visible: false,
    zIndex: TOP_OUTLINE_LAYER_Z_INDEX,
    style: BLANK_LAND_OUTLINE_STYLE,
  });
  const catLayer = new VectorLayer({ source: catSource, zIndex: 3, opacity: 1 });
  const ghostLayer = new VectorLayer({ source: ghostSource, zIndex: GHOST_REFERENCE_LAYER_Z_INDEX });
  const tstmPreviewLayer = new VectorLayer({
    source: tstmPreviewSource,
    zIndex: TOP_OUTLINE_LAYER_Z_INDEX + 5,
  });
  const trimPreviewLayer = new VectorLayer({
    source: trimPreviewSource,
    zIndex: TOP_OUTLINE_LAYER_Z_INDEX + 6,
  });
  const vectorLayer = new VectorLayer({ source: vectorSource, zIndex: 4 });
  const labelLayer = new TileLayer({
    source: createLabelOverlaySource("osm") ?? undefined,
    visible: true,
    zIndex: TOP_LABEL_LAYER_Z_INDEX,
  });

  return {
    tileLayer,
    vectorBaseGroup,
    vectorReferenceGroup,
    worldLayer,
    lakesLayer,
    landLayer,
    landOutlineLayer,
    catLayer,
    ghostLayer,
    tstmPreviewLayer,
    trimPreviewLayer,
    vectorLayer,
    labelLayer,
  };
};
