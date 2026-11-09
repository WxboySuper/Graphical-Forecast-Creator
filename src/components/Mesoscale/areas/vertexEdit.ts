/**
 * Pure vertex operations on a stored area polygon, used by keyboard editing. A stored ring repeats its
 * first position at the end, so `n` vertices are `n + 1` positions. Only the outer ring is edited.
 * Every function returns a new polygon, or null when the change is not allowed.
 */
import type { Polygon, Position } from 'geojson';
import { isMesoscalePolygon } from '../../../utils/mesoscaleGeometryValidation';

export const MIN_VERTICES = 3;
export const NUDGE_STEPS_DEGREES = [0.1, 0.5, 1, 2] as const;

const MAX_LATITUDE = 90;
const MAX_LONGITUDE = 180;

const outerVertices = (polygon: Polygon): Position[] => polygon.coordinates[0].slice(0, -1);

const withOuterVertices = (polygon: Polygon, vertices: Position[]): Polygon | null => {
  const next: Polygon = { type: 'Polygon', coordinates: [[...vertices, vertices[0]], ...polygon.coordinates.slice(1)] };
  return isMesoscalePolygon(next) ? next : null;
};

const clamp = (value: number, limit: number): number => Math.max(-limit, Math.min(limit, value));

export const vertexCount = (polygon: Polygon): number => outerVertices(polygon).length;

export const vertexAt = (polygon: Polygon, index: number): Position | null => outerVertices(polygon)[index] ?? null;

/** "35.12°N 98.40°W", the way the active vertex is announced. */
export const formatVertex = ([longitude, latitude]: Position): string => {
  const lat = `${Math.abs(latitude).toFixed(2)}°${latitude >= 0 ? 'N' : 'S'}`;
  const lon = `${Math.abs(longitude).toFixed(2)}°${longitude >= 0 ? 'E' : 'W'}`;
  return `${lat} ${lon}`;
};

/** Moves one vertex by a number of degrees, keeping it on the globe. */
export const moveVertex = (polygon: Polygon, index: number, delta: { lon: number; lat: number }): Polygon | null => {
  const vertices = outerVertices(polygon);
  const current = vertices[index];
  if (!current) return null;
  const moved: Position = [clamp(current[0] + delta.lon, MAX_LONGITUDE), clamp(current[1] + delta.lat, MAX_LATITUDE)];
  return withOuterVertices(polygon, vertices.map((vertex, i) => (i === index ? moved : vertex)));
};

/** Adds a vertex halfway between the given vertex and the next one. */
export const addVertexAfter = (polygon: Polygon, index: number): Polygon | null => {
  const vertices = outerVertices(polygon);
  const from = vertices[index];
  if (!from) return null;
  const to = vertices[(index + 1) % vertices.length];
  const midpoint: Position = [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2];
  return withOuterVertices(polygon, [...vertices.slice(0, index + 1), midpoint, ...vertices.slice(index + 1)]);
};

const hasIndex = (vertices: Position[], index: number): boolean => index >= 0 && index < vertices.length;
const canRemoveFrom = (vertices: Position[], index: number): boolean => vertices.length > MIN_VERTICES && hasIndex(vertices, index);

/** Removes a vertex; a polygon keeps at least three. */
export const removeVertex = (polygon: Polygon, index: number): Polygon | null => {
  const vertices = outerVertices(polygon);
  if (!canRemoveFrom(vertices, index)) return null;
  return withOuterVertices(polygon, vertices.filter((_, i) => i !== index));
};

export const nextIndex = (index: number, count: number, direction: 1 | -1): number => (index + direction + count) % count;
