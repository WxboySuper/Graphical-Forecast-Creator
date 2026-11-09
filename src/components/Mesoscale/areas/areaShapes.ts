/**
 * Shape tools and transforms for Mesoscale areas. Shapes are drawn with OpenLayers and
 * stored as ordinary polygons, so the product format never changes.
 */
import type { Coordinate } from 'ol/coordinate';
import { createBox, createRegularPolygon, type GeometryFunction } from 'ol/interaction/Draw';
import { Polygon as OlPolygon, type Geometry } from 'ol/geom';
import { getCenter } from 'ol/extent';
import type { Polygon } from 'geojson';
import { isMesoscalePolygon } from '../../../utils/mesoscaleGeometryValidation';
import { polygonToGeometry, geometryToPolygon } from './areaModel';

export type AreaShapeTool = 'ellipse' | 'circle' | 'rectangle';

const SHAPE_SEGMENTS = 48;
export const ROTATE_STEP_DEGREES = 15;
export const SCALE_UP = 1.1;
export const SCALE_DOWN = 1 / SCALE_UP;
const MIN_SCALE_RATIO = 0.05;
const MAX_SCALE_RATIO = 20;

/** An ellipse inscribed in the box dragged between two corners. */
const ellipseFromCorners: GeometryFunction = (coordinates, geometry) => {
  const [start, end] = coordinates as Coordinate[];
  const [cx, cy] = [(start[0] + end[0]) / 2, (start[1] + end[1]) / 2];
  const [rx, ry] = [Math.abs(end[0] - start[0]) / 2, Math.abs(end[1] - start[1]) / 2];
  const ring: Coordinate[] = [];
  for (let i = 0; i < SHAPE_SEGMENTS; i += 1) {
    const angle = (2 * Math.PI * i) / SHAPE_SEGMENTS;
    ring.push([cx + rx * Math.cos(angle), cy + ry * Math.sin(angle)]);
  }
  ring.push(ring[0]);
  const polygon = (geometry as OlPolygon | undefined) ?? new OlPolygon([]);
  polygon.setCoordinates([ring]);
  return polygon;
};

/** The OpenLayers geometry function for each shape tool (a circle is center plus radius). */
export const shapeGeometryFunction = (tool: AreaShapeTool): GeometryFunction => {
  if (tool === 'ellipse') return ellipseFromCorners;
  if (tool === 'rectangle') return createBox();
  return createRegularPolygon(SHAPE_SEGMENTS);
};

export const isShapeTool = (tool: string): tool is AreaShapeTool => tool === 'ellipse' || tool === 'circle' || tool === 'rectangle';

const isReasonableScale = (original: Geometry, scaled: Geometry): boolean => {
  const [a, b] = [original.getExtent(), scaled.getExtent()];
  const ratio = (b[2] - b[0]) / Math.max(a[2] - a[0], Number.EPSILON);
  return ratio >= MIN_SCALE_RATIO && ratio <= MAX_SCALE_RATIO;
};

/** Rotates a stored polygon about its center. Returns null if the result is not a valid polygon. */
export const rotatePolygon = (polygon: Polygon, degrees: number): Polygon | null => {
  const geometry = polygonToGeometry(polygon);
  if (!geometry) return null;
  geometry.rotate((degrees * Math.PI) / 180, getCenter(geometry.getExtent()));
  const next = geometryToPolygon(geometry);
  return next && isMesoscalePolygon(next) ? next : null;
};

/** Scales a stored polygon about its center, within sane limits. Returns null when it cannot. */
export const scalePolygon = (polygon: Polygon, factor: number): Polygon | null => {
  const geometry = polygonToGeometry(polygon);
  const original = polygonToGeometry(polygon);
  if (!geometry || !original) return null;
  geometry.scale(factor, factor, getCenter(geometry.getExtent()));
  if (!isReasonableScale(original, geometry)) return null;
  const next = geometryToPolygon(geometry);
  return next && isMesoscalePolygon(next) ? next : null;
};
