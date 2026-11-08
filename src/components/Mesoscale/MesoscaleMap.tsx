/**
 * Mesoscale map: an OpenLayers map with a raster basemap and the active model
 * layers. Layer instances are owned by the shared layer sync helper, so toggling
 * visibility or opacity never recreates tiles that did not change.
 */
import React, { useEffect, useRef } from 'react';
import 'ol/ol.css';
import OLMap from 'ol/Map';
import View from 'ol/View';
import TileLayer from 'ol/layer/Tile';
import OSM from 'ol/source/OSM';
import { fromLonLat, transformExtent } from 'ol/proj';
import { createMesoscaleLayerRegistry, syncMesoscaleLayers, type MesoscaleLayerSpec } from '../../mesoscale';

const CONUS_CENTER = fromLonLat([-96, 38.5]);
const DEFAULT_ZOOM = 4;

interface MesoscaleMapProps {
  layers: MesoscaleLayerSpec[];
  /** Data domain as [west, south, east, north] in degrees; the map frames it on first load. */
  domainBounds?: [number, number, number, number];
}

const FIT_PADDING = [24, 24, 24, 24];

/** Frames the data domain, falling back to the default CONUS view. */
const fitToDomain = (map: OLMap, bounds?: [number, number, number, number]): void => {
  if (!bounds) return;
  map.getView().fit(transformExtent(bounds, 'EPSG:4326', 'EPSG:3857'), { padding: FIT_PADDING, size: map.getSize(), maxZoom: 6 });
};

/** Creates the map once and returns it for layer syncing. */
const createMap = (target: HTMLElement): OLMap =>
  new OLMap({
    target,
    layers: [new TileLayer({ source: new OSM(), properties: { mesoscaleBasemap: true } })],
    view: new View({ center: CONUS_CENTER, zoom: DEFAULT_ZOOM, minZoom: 3, maxZoom: 9 }),
    controls: [],
  });

export const MesoscaleMap: React.FC<MesoscaleMapProps> = ({ layers, domainBounds }) => {
  const targetRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<OLMap | null>(null);
  const registryRef = useRef(createMesoscaleLayerRegistry());

  useEffect(() => {
    if (!targetRef.current) return undefined;
    const map = createMap(targetRef.current);
    mapRef.current = map;
    map.updateSize();
    fitToDomain(map, domainBounds);
    // The data rail opening or closing, and window resizes, change the container's size.
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => map.updateSize());
    observer?.observe(targetRef.current);
    const registry = registryRef.current;
    return () => {
      observer?.disconnect();
      syncMesoscaleLayers({ map, specs: [], registry });
      map.setTarget(undefined);
      mapRef.current = null;
    };
    // The map frames the domain once on creation; later bound changes must not reset the user's view.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!mapRef.current) return;
    syncMesoscaleLayers({ map: mapRef.current, specs: layers, registry: registryRef.current });
  }, [layers]);

  return <div ref={targetRef} className="mesoscale-map" data-testid="mesoscale-map" role="application" aria-label="Mesoscale map" />;
};
