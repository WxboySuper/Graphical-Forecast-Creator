/**
 * Keyboard-accessible vertex editing for the selected area. The arrow keys nudge the active vertex
 * (on the nudge pad, or with the direction buttons), and the active vertex is highlighted on the map
 * and announced to screen readers. Pointer users can still drag vertices on the map.
 */
import React, { useEffect, useState } from 'react';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, ChevronLeft, ChevronRight, Minus, Plus } from 'lucide-react';
import type { Polygon } from 'geojson';
import {
  MIN_VERTICES,
  NUDGE_STEPS_DEGREES,
  addVertexAfter,
  formatVertex,
  moveVertex,
  nextIndex,
  removeVertex,
  vertexAt,
  vertexCount,
} from './vertexEdit';

interface Props {
  areaId: string;
  geometry: Polygon;
  /** `coalesce` merges a run of nudges into one undo step. */
  onChange: (geometry: Polygon, coalesce: boolean) => void;
  onActiveVertex: (index: number | null) => void;
}

const DIRECTIONS: Record<string, { lon: number; lat: number }> = {
  ArrowUp: { lon: 0, lat: 1 },
  ArrowDown: { lon: 0, lat: -1 },
  ArrowLeft: { lon: -1, lat: 0 },
  ArrowRight: { lon: 1, lat: 0 },
};

interface IconButtonProps { label: string; disabled?: boolean; onClick: () => void; children: React.ReactNode }

const IconButton: React.FC<IconButtonProps> = ({ label, disabled, onClick, children }) => (
  <button type="button" className="mesoscale-vertex__button" aria-label={label} title={label} disabled={disabled} onClick={onClick}>
    {children}
  </button>
);

export const VertexEditor: React.FC<Props> = ({ areaId, geometry, onChange, onActiveVertex }) => {
  const [index, setIndex] = useState(0);
  const [step, setStep] = useState<number>(NUDGE_STEPS_DEGREES[1]);
  const count = vertexCount(geometry);
  const active = Math.min(index, count - 1);
  const vertex = vertexAt(geometry, active);

  // A different area starts at its first vertex; the map highlight follows the active vertex.
  useEffect(() => setIndex(0), [areaId]);
  useEffect(() => {
    onActiveVertex(active);
    return () => onActiveVertex(null);
  }, [active, areaId, onActiveVertex]);

  const nudge = (direction: { lon: number; lat: number }): void => {
    const next = moveVertex(geometry, active, { lon: direction.lon * step, lat: direction.lat * step });
    if (next) onChange(next, true);
  };
  const apply = (next: Polygon | null, newIndex: number): void => {
    if (!next) return;
    onChange(next, false);
    setIndex(newIndex);
  };
  const onKeyDown = (event: React.KeyboardEvent): void => {
    const direction = DIRECTIONS[event.key];
    if (!direction) return;
    event.preventDefault();
    nudge(direction);
  };

  return (
    <fieldset className="mesoscale-form__window mesoscale-vertex">
      <legend>Vertices (keyboard)</legend>
      <div className="mesoscale-vertex__row">
        <IconButton label="Previous vertex" onClick={() => setIndex(nextIndex(active, count, -1))}><ChevronLeft aria-hidden="true" /></IconButton>
        <span className="mesoscale-vertex__readout" aria-live="polite" aria-atomic="true">
          Vertex {active + 1} of {count}{vertex ? `: ${formatVertex(vertex)}` : ''}
        </span>
        <IconButton label="Next vertex" onClick={() => setIndex(nextIndex(active, count, 1))}><ChevronRight aria-hidden="true" /></IconButton>
      </div>
      <label className="mesoscale-form__field">
        <span>Nudge step</span>
        <select value={step} onChange={(event) => setStep(Number(event.target.value))}>
          {NUDGE_STEPS_DEGREES.map(value => <option key={value} value={value}>{value}°</option>)}
        </select>
      </label>
      <div className="mesoscale-vertex__pad" role="group" tabIndex={0} aria-label="Nudge pad: arrow keys move the active vertex" onKeyDown={onKeyDown}>
        <IconButton label="Move vertex north" onClick={() => nudge(DIRECTIONS.ArrowUp)}><ArrowUp aria-hidden="true" /></IconButton>
        <IconButton label="Move vertex west" onClick={() => nudge(DIRECTIONS.ArrowLeft)}><ArrowLeft aria-hidden="true" /></IconButton>
        <IconButton label="Move vertex east" onClick={() => nudge(DIRECTIONS.ArrowRight)}><ArrowRight aria-hidden="true" /></IconButton>
        <IconButton label="Move vertex south" onClick={() => nudge(DIRECTIONS.ArrowDown)}><ArrowDown aria-hidden="true" /></IconButton>
      </div>
      <div className="mesoscale-vertex__row">
        <button type="button" className="mesoscale-shape-action" onClick={() => apply(addVertexAfter(geometry, active), active + 1)}>
          <Plus aria-hidden="true" /><span>Add vertex after</span>
        </button>
        <button type="button" className="mesoscale-shape-action" disabled={count <= MIN_VERTICES} onClick={() => apply(removeVertex(geometry, active), Math.max(0, active - 1))}>
          <Minus aria-hidden="true" /><span>Delete vertex</span>
        </button>
      </div>
    </fieldset>
  );
};
