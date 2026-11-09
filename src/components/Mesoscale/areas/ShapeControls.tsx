/** Rotate and resize the selected area about its center. */
import React from 'react';
import { Maximize2, Minimize2, RotateCcw, RotateCw } from 'lucide-react';
import type { Polygon } from 'geojson';
import { ROTATE_STEP_DEGREES, SCALE_DOWN, SCALE_UP, rotatePolygon, scalePolygon } from './areaShapes';

interface Props {
  geometry: Polygon;
  onChange: (geometry: Polygon) => void;
}

interface ActionProps { label: string; onClick: () => void; children: React.ReactNode }

const Action: React.FC<ActionProps> = ({ label, onClick, children }) => (
  <button type="button" className="mesoscale-shape-action" onClick={onClick}>
    {children}
    <span>{label}</span>
  </button>
);

export const ShapeControls: React.FC<Props> = ({ geometry, onChange }) => {
  const apply = (next: Polygon | null): void => {
    if (next) onChange(next);
  };
  return (
    <fieldset className="mesoscale-form__window">
      <legend>Shape</legend>
      <div className="mesoscale-shape-actions">
        <Action label={`Rotate ${ROTATE_STEP_DEGREES}° left`} onClick={() => apply(rotatePolygon(geometry, -ROTATE_STEP_DEGREES))}><RotateCcw aria-hidden="true" /></Action>
        <Action label={`Rotate ${ROTATE_STEP_DEGREES}° right`} onClick={() => apply(rotatePolygon(geometry, ROTATE_STEP_DEGREES))}><RotateCw aria-hidden="true" /></Action>
        <Action label="Smaller" onClick={() => apply(scalePolygon(geometry, SCALE_DOWN))}><Minimize2 aria-hidden="true" /></Action>
        <Action label="Larger" onClick={() => apply(scalePolygon(geometry, SCALE_UP))}><Maximize2 aria-hidden="true" /></Action>
      </div>
    </fieldset>
  );
};
