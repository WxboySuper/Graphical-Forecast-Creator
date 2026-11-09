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
import Draw from 'ol/interaction/Draw';
import Modify from 'ol/interaction/Modify';
import Snap from 'ol/interaction/Snap';
import { Fill, Stroke, Style, Text } from 'ol/style';
import type { Geometry } from 'ol/geom';
import type { Polygon } from 'geojson';
import type { MesoscaleArea } from '../../../store/mesoscaleSlice';
import { removeDrawInteraction } from '../../Map/openLayersForecastUtilityHelpers';
import { featureToPolygon, hazardHue, polygonToGeometry } from './areaModel';

export type AreaTool = 'select' | 'draw';

interface Props {
  map: OLMap;
  areas: MesoscaleArea[];
  selectedId: string | null;
  tool: AreaTool;
  onDrawn: (polygon: Polygon) => void;
  onModified: (id: string, polygon: Polygon) => void;
  onSelect: (id: string | null) => void;
}

const AREA_LAYER_Z_INDEX = 1000;

const areaStyle = (feature: Feature<Geometry>, selected: boolean): Style => {
  const hue = hazardHue(String(feature.get('hazard') ?? ''));
  return new Style({
    stroke: new Stroke({ color: `hsl(${hue} 80% ${selected ? 38 : 45}%)`, width: selected ? 4 : 2.5 }),
    fill: new Fill({ color: `hsl(${hue} 80% 50% / ${selected ? 0.28 : 0.16})` }),
    text: new Text({
      text: String(feature.get('title') ?? ''),
      font: '600 13px system-ui, sans-serif',
      fill: new Fill({ color: '#111' }),
      stroke: new Stroke({ color: '#fff', width: 3 }),
      overflow: true,
    }),
  });
};

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
    source.addFeatures(areas.map((area) => {
      const feature = new Feature({ geometry: polygonToGeometry(area.geometry), title: area.title, hazard: area.hazard });
      feature.setId(area.id);
      return feature;
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

const useDrawTool = (map: OLMap, source: VectorSource, active: boolean, onDrawn: (polygon: Polygon) => void): void => {
  useEffect(() => {
    if (!active) return undefined;
    const draw = new Draw({ source: new VectorSource(), type: 'Polygon' });
    const snap = new Snap({ source });
    draw.on('drawend', (event) => {
      const polygon = featureToPolygon(event.feature as Feature<Geometry>);
      if (polygon) onDrawn(polygon);
    });
    const onKeyDown = (event: KeyboardEvent): void => {
      if ((event.target as HTMLElement | null)?.closest?.('input, textarea, select, [contenteditable="true"]')) return;
      if (event.key === 'Escape') draw.abortDrawing();
      if (event.key === 'Backspace') draw.removeLastPoint();
    };
    map.addInteraction(draw);
    map.addInteraction(snap);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      removeDrawInteraction(map, draw);
      map.removeInteraction(snap);
    };
  }, [map, source, active, onDrawn]);
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

export const MesoscaleAreaLayer = ({ map, areas, selectedId, tool, onDrawn, onModified, onSelect }: Props): null => {
  const source = useAreaSource(map, areas, selectedId);
  useSelectOnClick(map, tool === 'select', onSelect);
  useDrawTool(map, source, tool === 'draw', onDrawn);
  useModifySelected({ map, source, areas, selectedId, tool, onModified });
  return null;
};
