import React, {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { useDispatch, useSelector } from "react-redux";
import "ol/ol.css";
import OLMap from "ol/Map";
import View from "ol/View";
import LayerGroup from "ol/layer/Group";
import TileLayer from "ol/layer/Tile";
import VectorLayer from "ol/layer/Vector";
import VectorSource from "ol/source/Vector";
import OSM from "ol/source/OSM";
import XYZ from "ol/source/XYZ";
import GeoJSON from "ol/format/GeoJSON";
import { fromLonLat } from "ol/proj";
import { RootState } from "../../store";
import { selectVerificationOutlooksForDay } from "../../store/verificationSlice";
import { getGeoBoundarySource } from "../../config/geoBoundarySources";
import { setBaseMapStyle } from "../../store/overlaysSlice";
import type { BaseMapStyle } from "../../store/overlaysSlice";
import { computeZIndex, getFeatureStyle } from "../../utils/mapStyleUtils";
import { DayType } from "../../types/outlooks";
import type { MapAdapterHandle } from "../../maps/contracts";
import type { Feature as GeoJsonFeature } from "geojson";
import Feature from "ol/Feature";
import Geometry from "ol/geom/Geometry";
import Point from "ol/geom/Point";
import {
  Circle,
  Fill as StyleFill,
  Stroke as StyleStroke,
  Style as OlStyle,
  Fill,
  Stroke,
  Style,
} from "ol/style";
import { apply } from "ol-mapbox-style";
import Legend from "./Legend";
import UnofficialBadge from "./UnofficialBadge";
import {
  getOpenFreeMapStyleSet,
  isOpenFreeMapStyle,
} from "../../lib/openFreeMap";
import "./ForecastMap.css";
import {
  createHatchPattern,
  createLabelOverlaySource,
  createTileSource,
  replaceLayerGroupLayers,
  resolveFillOpacity,
  resolveStrokeWidth,
  toRgbaColor,
  TOP_OUTLINE_LAYER_Z_INDEX,
  TOP_VECTOR_REFERENCE_LAYER_Z_INDEX,
  TOP_LABEL_LAYER_Z_INDEX,
} from "./openLayersMapStyles";
import { ReportType } from "../../types/stormReports";
import { STORM_REPORT_COLORS, STORM_REPORT_FALLBACK_COLOR } from "../../utils/stormReportColors";
import type { DatEvidence } from "../../utils/dat";
import { isTornadoDamagePoint } from "../../utils/dat";

interface OpenLayersVerificationMapProps {
  activeOutlookType?: "categorical" | "tornado" | "wind" | "hail";
  selectedDay?: DayType;
  legendOpen?: boolean;
  datEvidence?: DatEvidence | null;
  datVisible?: boolean;
}

type VerificationOutlookType = NonNullable<
  OpenLayersVerificationMapProps["activeOutlookType"]
>;

interface OutlookStyleDescriptor {
  outlookType: VerificationOutlookType;
  probability: string;
}

const datColors = {
  EF0: '#94a3b8',
  EF1: '#38bdf8',
  EF2: '#f59e0b',
  EF3: '#f43f5e',
  EF4: '#d946ef',
  EF5: '#7f1d1d',
  EFU: '#f8fafc',
};

/** Returns the display color for a DAT Enhanced Fujita scale. */
const datColorFor = (efScale: string | null | undefined): string => {
  const key = (efScale ?? '').toUpperCase() as keyof typeof datColors;
  return datColors[key] ?? '#fbbf24';
};

/** Builds the line style used for a DAT damage track. */
const buildDatTrackStyle = () => new OlStyle({
  stroke: new StyleStroke({ color: '#fbbf24', width: 3 }),
});

/** Builds the polygon style used for a DAT damage area. */
const buildDatPolygonStyle = (efScale: string | null | undefined) => new OlStyle({
  fill: new StyleFill({ color: 'rgba(245, 158, 11, 0.16)' }),
  stroke: new StyleStroke({ color: datColorFor(efScale), width: 1.5 }),
});

/** Builds the point style used for a DAT damage report. */
const buildDatPointStyle = (efScale: string | null | undefined) => new OlStyle({
  image: new Circle({
    radius: 4,
    fill: new StyleFill({ color: datColorFor(efScale) }),
    stroke: new StyleStroke({ color: '#111827', width: 1 }),
  }),
});

// Style function for storm reports
const buildReportStyle = (type: ReportType) => {
  return new OlStyle({
    image: new Circle({
      radius: 6,
      fill: new StyleFill({
        color: STORM_REPORT_COLORS[type] || STORM_REPORT_FALLBACK_COLOR,
      }),
      stroke: new StyleStroke({
        color: "#FFFFFF", // White border
        width: 1,
      }),
    }),
  });
};

// Cached US states GeoJSON for blank map style (fetched once per session)
let cachedUsStatesGeoJSONVerif: object | null = null;

// Blank land fill for verification map.
const BLANK_LAND_FILL_STYLE_VERIF = new Style({
  fill: new Fill({ color: "#f2ede2" }),
});

// Blank land outlines rendered above outlook polygons.
const BLANK_LAND_OUTLINE_STYLE_VERIF = new Style({
  fill: new Fill({ color: "rgba(0, 0, 0, 0)" }),
  stroke: new Stroke({ color: "#9e9585", width: 1 }),
});

/** Keeps verification paint translucent so reports and geographic outlines remain visible. */
export const buildStyle = ({ outlookType, probability }: OutlookStyleDescriptor) => {
  const style = getFeatureStyle(outlookType, probability);
  const isCig = probability.startsWith("CIG");
  const fillOpacity = Math.min(resolveFillOpacity({ fillOpacity: style.fillOpacity }), 0.42);
  const fillColor = toRgbaColor({ color: String(style.fillColor || "#999999"), alpha: fillOpacity });
  const strokeColor = toRgbaColor({
    color: String(style.color || "#000000"),
    alpha: typeof style.opacity === "number" ? style.opacity : 1,
  });
  return new Style({
    fill: new Fill({
      color: isCig
        ? createHatchPattern({ cigLevel: probability, strokeColor: "#111111", strokeWidth: 1.1 }) ?? "rgba(0, 0, 0, 0)"
        : fillColor,
    }),
    stroke: new Stroke({
      color: isCig ? "#111111" : strokeColor,
      width: isCig ? 1.2 : resolveStrokeWidth({ weight: style.weight, isTopLayer: false }),
    }),
    zIndex: isCig ? 1000 + (parseInt(probability.slice(3), 10) || 0) : computeZIndex(outlookType, probability),
  });
};

// Sub-component for the base map style-picker dropdown in the verification map.
const VerifMapStylePicker: React.FC<{
  baseMapStyle: BaseMapStyle;
  onSelect: (e: React.MouseEvent<HTMLButtonElement>) => void;
}> = ({ baseMapStyle, onSelect }) => (
  <div className="absolute bottom-full mb-2 right-0 rounded-md bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 shadow-lg p-2 flex flex-col gap-1 min-w-[120px] z-50">
    {(
      [
        { value: "blank", label: "Blank (Weather)" },
        { value: "osm", label: "OpenStreetMap" },
        { value: "carto-light", label: "Light" },
        { value: "carto-dark", label: "Dark" },
        { value: "esri-satellite", label: "Satellite" },
      ] as { value: BaseMapStyle; label: string }[]
    ).map(({ value, label }) => (
      <button
        key={value}
        data-style={value}
        type="button"
        className={`text-left px-2 py-1 rounded text-xs hover:bg-gray-100 dark:hover:bg-gray-700 ${baseMapStyle === value ? "font-bold bg-gray-100 dark:bg-gray-700" : ""}`}
        onClick={onSelect}
      >
        {label}
      </button>
    ))}
  </div>
);

/** Map toolbar button that toggles the base map style picker in the verification map. */
const VerifMapStylePickerButton: React.FC<{
  showStylePicker: boolean;
  baseMapStyle: BaseMapStyle;
  onToggle: () => void;
  onSelect: (e: React.MouseEvent<HTMLButtonElement>) => void;
}> = ({ showStylePicker, baseMapStyle, onToggle, onSelect }) => (
  <div className="relative">
    <button
      type="button"
      className="map-toolbar-button"
      onClick={onToggle}
      title="Base map style"
      aria-label="Base map style"
    >
      Map
    </button>
    {showStylePicker && (
      <VerifMapStylePicker baseMapStyle={baseMapStyle} onSelect={onSelect} />
    )}
  </div>
);

export const VerifMapLegendToggleButton: React.FC<{
  mobileOpen: boolean;
  onToggle: () => void;
}> = ({ mobileOpen, onToggle }) => (
  <button
    type="button"
    className="map-toolbar-button map-legend-toggle-button"
    onClick={onToggle}
    title={mobileOpen ? 'Hide map key' : 'Show map key'}
    aria-label={mobileOpen ? 'Hide map key' : 'Show map key'}
    aria-controls="map-legend"
    aria-expanded={mobileOpen}
  >
    Key
  </button>
);

// OpenLayers map component for verification view,
// supporting categorical and probabilistic outlooks with storm report overlays and base map style switching.
const OpenLayersVerificationMap = forwardRef<
  MapAdapterHandle<OLMap> | null,
  OpenLayersVerificationMapProps
>(({ activeOutlookType = "categorical", selectedDay = 1, legendOpen = false, datEvidence = null, datVisible = true }, ref) => {
  const dispatch = useDispatch();
  const [showStylePicker, setShowStylePicker] = useState(false);
  const [mobileLegendOpen, setMobileLegendOpen] = useState(false);
  const mapElementRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<OLMap | null>(null);
  const tileLayerRef = useRef<TileLayer<OSM | XYZ> | null>(null);
  const vectorBaseGroupRef = useRef<LayerGroup | null>(null);
  const vectorReferenceGroupRef = useRef<LayerGroup | null>(null);
  const vectorStyleRequestRef = useRef(0);
  const landSourceRef = useRef<VectorSource>(new VectorSource());
  const landLayerRef = useRef<VectorLayer<VectorSource> | null>(null);
  const landOutlineLayerRef = useRef<VectorLayer<VectorSource> | null>(null);
  const labelLayerRef = useRef<TileLayer<XYZ> | null>(null);
  const vectorSourceRef = useRef<VectorSource>(new VectorSource());
  const outlookLayerRef = useRef<VectorLayer<VectorSource> | null>(null);
  const stormReportsSourceRef = useRef<VectorSource>(new VectorSource()); // New source for storm reports
  const datEvidenceSourceRef = useRef<VectorSource>(new VectorSource());
  const mapView = useSelector(
    (state: RootState) => state.forecast.currentMapView,
  );
  const initialMapViewRef = useRef(mapView);
  const outlooks = useSelector((state: RootState) =>
    selectVerificationOutlooksForDay(state, selectedDay),
  );
  const baseMapStyle = useSelector(
    (state: RootState) => state.overlays.baseMapStyle,
  );
  const {
    reports,
    visible: reportsVisible,
    filterByType,
  } = useSelector((state: RootState) => state.stormReports); // Select storm reports state

  // Memoize active features based on selected outlook type and available outlooks for the day,
  const activeFeatures = useMemo(() => {
    const outlook = outlooks[activeOutlookType];
    if (!outlook) {
      return [] as Array<{ feature: GeoJsonFeature; probability: string }>;
    }

    // Flatten features from the selected outlook type into a single array with associated probabilities for styling.
    const items: Array<{ feature: GeoJsonFeature; probability: string }> = [];
    outlook.forEach((features, probability) => {
      features.forEach((feature) => {
        items.push({ feature, probability });
      });
    });

    return items;
  }, [activeOutlookType, outlooks]);

  useImperativeHandle(
    ref,
    () => ({
      getMap: () => mapRef.current,
      getEngine: () => "openlayers",
      getView: () => ({
        center: mapView.center,
        zoom: mapView.zoom,
      }),
    }),
    [mapView.center, mapView.zoom],
  );

  useEffect(() => {
    if (!mapElementRef.current || mapRef.current) return undefined;

    const baseTileLayer = new TileLayer({
      source: new OSM({ crossOrigin: "anonymous" }),
    });
    tileLayerRef.current = baseTileLayer;
    const vectorBaseGroup = new LayerGroup({
      visible: false,
      zIndex: 1,
    });
    vectorBaseGroupRef.current = vectorBaseGroup;
    const vectorReferenceGroup = new LayerGroup({
      visible: false,
      zIndex: TOP_VECTOR_REFERENCE_LAYER_Z_INDEX,
    });
    vectorReferenceGroupRef.current = vectorReferenceGroup;
    // Land fill sits above the base tile layer for blank style.
    const landLayer = new VectorLayer({
      source: landSourceRef.current,
      visible: false,
      zIndex: 1,
      style: BLANK_LAND_FILL_STYLE_VERIF,
    });
    landLayerRef.current = landLayer;
    const landOutlineLayer = new VectorLayer({
      source: landSourceRef.current,
      visible: false,
      zIndex: TOP_OUTLINE_LAYER_Z_INDEX,
      style: BLANK_LAND_OUTLINE_STYLE_VERIF,
    });
    landOutlineLayerRef.current = landOutlineLayer;
    const outlookLayer = new VectorLayer({
      source: vectorSourceRef.current,
      zIndex: 3,
    });
    outlookLayerRef.current = outlookLayer;
    const labelLayer = new TileLayer({
      source: createLabelOverlaySource("osm") ?? undefined,
      visible: true,
      zIndex: TOP_LABEL_LAYER_Z_INDEX,
    });
    labelLayerRef.current = labelLayer;

    // Initialize the map with the base tile layer, land layer, outlook layer, and storm reports layer.
    const map = new OLMap({
      target: mapElementRef.current,
      layers: [
        baseTileLayer,
        vectorBaseGroup,
        landLayer,
        outlookLayer,
        landOutlineLayer,
        vectorReferenceGroup,
        new VectorLayer({
          source: stormReportsSourceRef.current,
          zIndex: 4,
          style: (feature) =>
            buildReportStyle(feature.get("type") as ReportType),
        }),
        new VectorLayer({
          source: datEvidenceSourceRef.current,
          zIndex: 5,
        }),
        labelLayer,
      ],
      view: new View({
        center: fromLonLat([
          initialMapViewRef.current.center[1],
          initialMapViewRef.current.center[0],
        ]),
        zoom: initialMapViewRef.current.zoom,
      }),
    });

    mapRef.current = map;

    // As with the forecast map, ensure we recover if the target container is 0x0 at mount.
    const targetEl = mapElementRef.current;
    // Same with the forecast map, update the map safely when timing occurs incorrectly
    const updateSizeSafely = () => {
      try {
        map.updateSize();
      } catch {
        // ignore
      }
    };
    const raf1 = window.requestAnimationFrame(updateSizeSafely);
    const raf2 = window.requestAnimationFrame(updateSizeSafely);
    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined" && targetEl) {
      resizeObserver = new ResizeObserver(() => updateSizeSafely());
      resizeObserver.observe(targetEl);
    }

    return () => {
      window.cancelAnimationFrame(raf1);
      window.cancelAnimationFrame(raf2);
      if (resizeObserver) {
        resizeObserver.disconnect();
      }
      map.setTarget();
      mapRef.current = null;
      vectorBaseGroupRef.current = null;
      vectorReferenceGroupRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const view = map.getView();
    const targetCenter = fromLonLat([mapView.center[1], mapView.center[0]]);
    const currentCenter = view.getCenter();
    const currentZoom = view.getZoom() || 4;

    const centerChanged =
      !currentCenter ||
      Math.abs(currentCenter[0] - targetCenter[0]) > 0.01 ||
      Math.abs(currentCenter[1] - targetCenter[1]) > 0.01;
    const zoomChanged = Math.abs(currentZoom - mapView.zoom) > 0.000001;

    if (!centerChanged && !zoomChanged) {
      return;
    }

    view.setCenter(targetCenter);
    view.setZoom(mapView.zoom);
  }, [mapView.center, mapView.zoom]);

  // Swap base tile source / blank land layer when style changes
  useEffect(() => {
    const tile = tileLayerRef.current;
    const vectorBaseGroup = vectorBaseGroupRef.current;
    const vectorReferenceGroup = vectorReferenceGroupRef.current;
    const land = landLayerRef.current;
    const landOutline = landOutlineLayerRef.current;
    const labels = labelLayerRef.current;
    const el = mapElementRef.current;
    if (
      !tile ||
      !vectorBaseGroup ||
      !vectorReferenceGroup ||
      !land ||
      !landOutline ||
      !labels ||
      !el
    )
      return;

    /**
     * Load US state boundary features into the `landSourceRef` if they
     * are not already present. This creates the state outline layer
     * used for rendering above outlook polygons.
     */
    const loadStatesBoundaries = () => {
      if (landSourceRef.current.getFeatures().length > 0) {
        return;
      }

      /**
       * Fetch and parse US states GeoJSON and add features to the
       * verification map's `landSourceRef`. Cached in
       * `cachedUsStatesGeoJSONVerif` to avoid repeated network calls.
       */
      const loadStates = async () => {
        let geoData = cachedUsStatesGeoJSONVerif;
        if (!geoData) {
          const res = await fetch(
            getGeoBoundarySource("usStates").url,
          );
          if (!res.ok) {
            throw new Error(`Failed to load US states boundaries: HTTP ${res.status}`);
          }
          geoData = await res.json();
          cachedUsStatesGeoJSONVerif = geoData;
        }
        const format = new GeoJSON();
        const features = format.readFeatures(geoData, {
          dataProjection: "EPSG:4326",
          featureProjection: "EPSG:3857",
        });
        landSourceRef.current.addFeatures(features as Feature[]);
      };

      loadStates().catch(() => {
        /* US states layer fetch failed — non-fatal */
      });
    };

    // Keep state outlines above outlook polygons across base-map styles.
    loadStatesBoundaries();

    /** Clears the split OpenFreeMap base/reference groups so non-vector styles can render normally. */
    const hideVectorBasemapGroups = () => {
      vectorBaseGroup.setVisible(false);
      vectorReferenceGroup.setVisible(false);
      vectorBaseGroup.getLayers().clear();
      vectorReferenceGroup.getLayers().clear();
    };

    if (baseMapStyle === "blank") {
      hideVectorBasemapGroups();
      tile.setVisible(false);
      land.setVisible(true);
      landOutline.setVisible(true);
      labels.setVisible(false);
      el.style.backgroundColor = "#b8d4e8";
      return;
    }

    if (isOpenFreeMapStyle(baseMapStyle)) {
      const requestId = vectorStyleRequestRef.current + 1;
      vectorStyleRequestRef.current = requestId;

      tile.setVisible(false);
      land.setVisible(false);
      landOutline.setVisible(true);
      labels.setVisible(false);
      el.style.backgroundColor = "";
      vectorBaseGroup.setVisible(false);
      vectorReferenceGroup.setVisible(false);
      vectorBaseGroup.getLayers().clear();
      vectorReferenceGroup.getLayers().clear();

      getOpenFreeMapStyleSet(baseMapStyle)
        .then(({ baseStyle, overlayStyle }) => {
          const nextBaseGroup = new LayerGroup();
          const nextReferenceGroup = new LayerGroup();

          return Promise.all([
            apply(nextBaseGroup, baseStyle),
            apply(nextReferenceGroup, overlayStyle),
          ]).then(() => ({ nextBaseGroup, nextReferenceGroup }));
        })
        .then(({ nextBaseGroup, nextReferenceGroup }) => {
          if (vectorStyleRequestRef.current !== requestId) {
            return;
          }

          replaceLayerGroupLayers(vectorBaseGroup, nextBaseGroup);
          replaceLayerGroupLayers(vectorReferenceGroup, nextReferenceGroup);
          vectorBaseGroup.setVisible(true);
          vectorReferenceGroup.setVisible(true);
        })
        .catch((error) => {
          if (vectorStyleRequestRef.current !== requestId) {
            return;
          }

          console.warn(
            "[verification-map] falling back to raster basemap after vector load failure",
            {
              baseMapStyle,
              error,
            },
          );
          vectorBaseGroup.getLayers().clear();
          vectorReferenceGroup.getLayers().clear();
          tile.setSource(createTileSource(baseMapStyle));
          tile.setVisible(true);
          const labelSource =
            createLabelOverlaySource(baseMapStyle);
          if (labelSource) {
            labels.setSource(labelSource);
            labels.setVisible(true);
          }
        });
    } else {
      hideVectorBasemapGroups();
      tile.setVisible(true);
      land.setVisible(false);
      landOutline.setVisible(true);
      el.style.backgroundColor = "";
      tile.setSource(
        createTileSource(baseMapStyle as Exclude<BaseMapStyle, "blank">),
      );
      const labelSource = createLabelOverlaySource(
        baseMapStyle as Exclude<BaseMapStyle, "blank">,
      );
      if (labelSource) {
        labels.setSource(labelSource);
        labels.setVisible(true);
      } else {
        labels.setVisible(false);
      }
    }
  }, [baseMapStyle]);

  useEffect(() => {
    const outlookLayer = outlookLayerRef.current;
    if (!outlookLayer) {
      return;
    }

    outlookLayer.setOpacity(1);
  }, [activeOutlookType]);

  useEffect(() => {
    const source = vectorSourceRef.current;
    source.clear();

    const format = new GeoJSON();

    // Sort features by computed z-index to ensure correct rendering order in OpenLayers,
    // since it doesn't automatically handle SVG-style layering based on feature properties. Higher z-index features will be added last and rendered on top. CIG overlays are always on top, with CIG3 above CIG2 above CIG1, followed by regular probabilities sorted by their computed z-index.
    const sortedFeatures = [...activeFeatures].sort((a, b) => {
      return (
        computeZIndex(
          activeOutlookType as VerificationOutlookType,
          a.probability,
        ) -
        computeZIndex(
          activeOutlookType as VerificationOutlookType,
          b.probability,
        )
      );
    });

    sortedFeatures.forEach(({ feature, probability }) => {
      const olFeature = format.readFeature(feature, {
        dataProjection: "EPSG:4326",
        featureProjection: "EPSG:3857",
      });

      if (Array.isArray(olFeature)) {
        olFeature.forEach((item) => {
          item.setStyle(
            buildStyle({ outlookType: activeOutlookType, probability }),
          );
          source.addFeature(item);
        });
      } else {
        olFeature.setStyle(
          buildStyle({ outlookType: activeOutlookType, probability }),
        );
        source.addFeature(olFeature);
      }
    });
  }, [activeFeatures, activeOutlookType]);

  useEffect(() => {
    const source = stormReportsSourceRef.current;
    source.clear();

    if (reportsVisible) {
      // Filter reports based on type visibility settings and active outlook type.
      // If a report type is toggled off in the filter, it will be excluded.
      // Additionally, if the active outlook type is probabilistic (tornado/wind/hail),
      // only matching report types will be shown. If the active outlook type is categorical,
      // all report types will be shown regardless of their specific type, as categorical view encompasses all types.
      const filteredReports = reports.filter((report) => {
        if (!filterByType[report.type]) {
          return false;
        }

        // Probabilistic verification views should only show matching report type.
        // Categorical view keeps all report types visible.
        if (activeOutlookType === "categorical") {
          return true;
        }

        return report.type === activeOutlookType;
      });

      filteredReports.forEach((report) => {
        const geometry = new Point(
          fromLonLat([report.longitude, report.latitude]),
        );
        // Create a new feature for each storm report with the appropriate geometry and styling based on its type,
        // then add it to the storm reports source.
        const feature = new Feature({
          geometry,
          type: report.type, // Store type for styling
          reportId: report.id, // Store ID for potential future interactions
        });
        feature.setStyle(buildReportStyle(report.type));
        source.addFeature(feature);
      });
    }
  }, [reports, reportsVisible, filterByType, activeOutlookType]);

  useEffect(() => {
    const source = datEvidenceSourceRef.current;
    source.clear();
    if (!datVisible || !datEvidence || (activeOutlookType !== "categorical" && activeOutlookType !== 'tornado')) {
      return;
    }

    const format = new GeoJSON();
    datEvidence.tracks
      .filter((track) => /^EF(?:[0-5]|U)$/i.test(track.efScale ?? ''))
      .forEach((track) => {
        const feature = format.readFeature({
          type: 'Feature',
          geometry: track.geometry,
          properties: { datType: 'track', objectId: track.objectId, efScale: track.efScale },
        }, { dataProjection: 'EPSG:4326', featureProjection: 'EPSG:3857' }) as Feature<Geometry>;
        feature.setStyle(buildDatTrackStyle());
        source.addFeature(feature);
      });

    datEvidence.damagePolygons
      .filter((polygon) => /^EF(?:[0-5]|U)$/i.test(polygon.efScale ?? ''))
      .forEach((polygon) => {
        const feature = format.readFeature({
          type: 'Feature',
          geometry: polygon.geometry,
          properties: { datType: 'polygon', objectId: polygon.objectId, efScale: polygon.efScale },
        }, { dataProjection: 'EPSG:4326', featureProjection: 'EPSG:3857' }) as Feature<Geometry>;
        feature.setStyle(buildDatPolygonStyle(polygon.efScale));
        source.addFeature(feature);
      });

    datEvidence.damagePoints
      .filter((damagePoint) => isTornadoDamagePoint(damagePoint) && damagePoint.longitude !== null && damagePoint.latitude !== null)
      .forEach((damagePoint) => {
        if (damagePoint.longitude === null || damagePoint.latitude === null) {
          return;
        }
        const feature = new Feature({
          geometry: new Point(fromLonLat([damagePoint.longitude, damagePoint.latitude])),
          datType: 'point',
          objectId: damagePoint.objectId,
          efScale: damagePoint.efScale,
        });
        feature.setStyle(buildDatPointStyle(damagePoint.efScale));
        source.addFeature(feature);
      });
  }, [activeOutlookType, datEvidence, datVisible]);

  // Handlers for toolbar buttons to switch interaction modes and toggle style picker.
  const handleToggleStylePicker = () => {
    setShowStylePicker((v) => !v);
  };

  // Handle selection of a base map style from the style picker, updating the Redux store and hiding the picker.
  const handleBaseMapStyleSelect = (e: React.MouseEvent<HTMLButtonElement>) => {
    const style = e.currentTarget.dataset.style as BaseMapStyle | undefined;
    if (!style) {
      return;
    }

    dispatch(setBaseMapStyle(style));
    setShowStylePicker(false);
  };

  return (
    <div className="forecast-map-container" translate="no">
      <div ref={mapElementRef} style={{ width: "100%", height: "100%" }} />
      <div className="map-toolbar-bottom-right">
        <div className="flex items-center gap-1 rounded-md bg-white dark:bg-gray-800 p-1 shadow-md border border-gray-300 dark:border-gray-600">
          <VerifMapStylePickerButton
            showStylePicker={showStylePicker}
            baseMapStyle={baseMapStyle}
            onToggle={handleToggleStylePicker}
            onSelect={handleBaseMapStyleSelect}
          />
          <VerifMapLegendToggleButton
            mobileOpen={mobileLegendOpen}
            onToggle={() => setMobileLegendOpen((open) => !open)}
          />
        </div>
      </div>
      <Legend activeOutlookType={activeOutlookType} desktopOpen={legendOpen} mobileOpen={mobileLegendOpen} showReportLegend />
      <UnofficialBadge />
    </div>
  );
});

OpenLayersVerificationMap.displayName = "OpenLayersVerificationMap";

export default OpenLayersVerificationMap;
