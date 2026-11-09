/**
 * Draws the forecaster's Mesoscale areas above the model layers and owns the
 * drawing interactions: Draw adds a polygon, Select picks one, and Modify edits
 * only the selected polygon. The map stores nothing; every change flows back
 * through callbacks so the store stays the single source of truth.
 */
import { useEffect, useMemo, useRef } from 'react';
import type OLMap from 'ol/Map';
import Feature from 'ol/Feature';
import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import Collection from 'ol/Collection';
import Draw, { type DrawEvent } from 'ol/interaction/Draw';
import Modify from 'ol/interaction/Modify';
import Snap from 'ol/interaction/Snap';
import { Point, type Geometry } from 'ol/geom';
import { fromLonLat } from 'ol/proj';
import CircleStyle from 'ol/style/Circle';
import { Fill, Stroke, Style } from 'ol/style';
import type { Polygon } from 'geojson';
import type { MesoscaleArea } from '../../../store/mesoscaleSlice';
import { removeDrawInteraction } from '../../Map/openLayersForecastUtilityHelpers';
import { featureToPolygon, polygonToGeometry } from './areaModel';
import { areaStyle } from './areaStyle';
import { isDegenerate, isShapeTool, shapeGeometryFunction, type AreaShapeTool } from './areaShapes';

export type AreaTool = 'select' | 'draw' | AreaShapeTool;

interface Props {
  map: OLMap;
  areas: MesoscaleArea[];
  selectedId: string | null;
  tool: AreaTool;
  onDrawn: (polygon: Polygon) => void;
  onModified: (id: string, polygon: Polygon) => void;
  onSelect: (id: string | null) => void;
  /** The vertex being edited from the keyboard, if any. */
  activeVertex?: number | null;
}

const AREA_LAYER_Z_INDEX = 1000;

/** Creates the vector layer once and mirrors the stored areas into it. */
const useAreaSource = (map: OLMap, areas: MesoscaleArea[], selectedId: string | null): VectorSource => {
  const source = useMemo(() => new VectorSource<Feature<Geometry>>(), []);
  const selectedRef = useRef(selectedId);
  selectedRef.current = selectedId;

  useEffect(() => {
    const layer = new VectorLayer({
      source,
      zIndex: AREA_LAYER_Z_INDEX,
      style: (feature) => areaStyle(feature as Feature<Geometry>, feature.getId() === selectedRef.current),
      properties: { mesoscaleAreas: true },
    });
    map.addLayer(layer);
    return () => { map.removeLayer(layer); };
  }, [map, source]);

  useEffect(() => {
    source.clear(true);
    source.addFeatures(areas.flatMap((area) => {
      const geometry = polygonToGeometry(area.geometry);
      if (!geometry) return [];
      const feature = new Feature({ geometry, title: area.title, hazard: area.hazard, validStart: area.validStart, validEnd: area.validEnd });
      feature.setId(area.id);
      return [feature];
    }));
  }, [areas, source]);

  useEffect(() => { source.changed(); }, [selectedId, source]);
  return source;
};

/** Click picks the topmost area under the pointer; clicking empty map clears the selection. */
const useSelectOnClick = (map: OLMap, active: boolean, onSelect: (id: string | null) => void): void => {
  useEffect(() => {
    if (!active) return undefined;
    const handler = (event: { pixel: number[] }): void => {
      const hit = map.forEachFeatureAtPixel(event.pixel, (feature) => feature, { layerFilter: (layer) => layer.get('mesoscaleAreas') === true });
      onSelect(hit ? String(hit.getId()) : null);
    };
    map.on('singleclick', handler);
    return () => { map.un('singleclick', handler); };
  }, [map, active, onSelect]);
};

const createDraw = (tool: AreaTool): Draw => (isShapeTool(tool)
  ? new Draw({ source: new VectorSource(), type: 'Circle', freehand: true, geometryFunction: shapeGeometryFunction(tool) })
  : new Draw({ source: new VectorSource(), type: 'Polygon' }));

const FORM_FIELD_SELECTOR = 'input, textarea, select, [contenteditable="true"]';

/** Forwards a finished sketch as a polygon, ignoring clicks that drew no area. */
const handleDrawEnd = (event: DrawEvent, onDrawn: (polygon: Polygon) => void): void => {
  const geometry = event.feature.getGeometry();
  if (!geometry || isDegenerate(geometry)) return;
  const polygon = featureToPolygon(event.feature as Feature<Geometry>);
  if (polygon) onDrawn(polygon);
};

/** Backspace and Escape edit the sketch, except while the user is typing in a form field. */
const drawKeyHandler = (draw: Draw) => (event: KeyboardEvent): void => {
  if ((event.target as HTMLElement | null)?.closest?.(FORM_FIELD_SELECTOR)) return;
  if (event.key === 'Escape') draw.abortDrawing();
  if (event.key === 'Backspace') draw.removeLastPoint();
};

const useDrawTool = (map: OLMap, source: VectorSource, tool: AreaTool, onDrawn: (polygon: Polygon) => void): void => {
  const active = tool !== 'select';
  useEffect(() => {
    if (!active) return undefined;
    const draw = createDraw(tool);
    const snap = new Snap({ source });
    const onKeyDown = drawKeyHandler(draw);
    draw.on('drawend', (event) => handleDrawEnd(event, onDrawn));
    map.addInteraction(draw);
    map.addInteraction(snap);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      removeDrawInteraction(map, draw);
      map.removeInteraction(snap);
    };
  }, [map, source, tool, active, onDrawn]);
};

/** Lets the forecaster drag the vertices of the selected area only. */
const useModifySelected = (props: Pick<Props, 'map' | 'areas' | 'selectedId' | 'tool' | 'onModified'> & { source: VectorSource }): void => {
  const { map, source, areas, selectedId, tool, onModified } = props;
  useEffect(() => {
    const selected = selectedId && tool === 'select' ? source.getFeatureById(selectedId) : null;
    if (!selected) return undefined;
    const modify = new Modify({ features: new Collection([selected as Feature<Geometry>]) });
    const snap = new Snap({ source });
    modify.on('modifyend', () => {
      const polygon = featureToPolygon(selected as Feature<Geometry>);
      if (polygon) onModified(selectedId as string, polygon);
    });
    map.addInteraction(modify);
    map.addInteraction(snap);
    return () => { map.removeInteraction(modify); map.removeInteraction(snap); };
  }, [map, source, areas, selectedId, tool, onModified]);
};

const VERTEX_LAYER_Z_INDEX = 1100;
const vertexMarkerStyle = new Style({
  image: new CircleStyle({ radius: 8, fill: new Fill({ color: '#ffffff' }), stroke: new Stroke({ color: '#1d4ed8', width: 4 }) }),
});

/** Marks the vertex being edited from the keyboard so the active position is visible on the map. */
const useActiveVertexMarker = ({ map, areas, selectedId, activeVertex }: Pick<Props, 'map' | 'areas' | 'selectedId'> & { activeVertex: number | null }): void => {
  useEffect(() => {
    const area = areas.find(item => item.id === selectedId);
    const position = area && activeVertex !== null ? area.geometry.coordinates?.[0]?.[activeVertex] : undefined;
    if (!position) return undefined;
    const layer = new VectorLayer({ source: new VectorSource({ features: [new Feature(new Point(fromLonLat(position)))] }), style: vertexMarkerStyle, zIndex: VERTEX_LAYER_Z_INDEX });
    map.addLayer(layer);
    return () => { map.removeLayer(layer); };
  }, [map, areas, selectedId, activeVertex]);
};

export const MesoscaleAreaLayer = ({ map, areas, selectedId, tool, onDrawn, onModified, onSelect, activeVertex = null }: Props): null => {
  const source = useAreaSource(map, areas, selectedId);
  useSelectOnClick(map, tool === 'select', onSelect);
  useDrawTool(map, source, tool, onDrawn);
  useModifySelected({ map, source, areas, selectedId, tool, onModified });
  useActiveVertexMarker({ map, areas, selectedId, activeVertex });
  return null;
};
