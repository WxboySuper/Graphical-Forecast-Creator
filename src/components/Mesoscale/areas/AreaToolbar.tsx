/** Floating map toolbar: pick or draw areas, add one from the current view, undo/redo, delete. */
import React from 'react';
import type OLMap from 'ol/Map';
import { Hand, PenLine, Redo2, Square, Trash2, Undo2 } from 'lucide-react';
import { transformExtent } from 'ol/proj';
import type { Polygon } from 'geojson';
import type { MesoscaleAreasController } from './useMesoscaleAreas';

/** A rectangle covering the middle half of the current view, so areas can be added without a pointer. */
export const viewBoxPolygon = (map: OLMap): Polygon | null => {
  const size = map.getSize();
  if (!size) return null;
  const [west, south, east, north] = transformExtent(map.getView().calculateExtent(size), 'EPSG:3857', 'EPSG:4326');
  const dx = (east - west) / 4;
  const dy = (north - south) / 4;
  const [w, s, e, n] = [west + dx, south + dy, east - dx, north - dy];
  return { type: 'Polygon', coordinates: [[[w, s], [e, s], [e, n], [w, n], [w, s]]] };
};

interface ToolButtonProps {
  label: string;
  pressed?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}

const ToolButton: React.FC<ToolButtonProps> = ({ label, pressed, disabled, onClick, children }) => (
  <button type="button" className="mesoscale-tool" aria-label={label} title={label} aria-pressed={pressed} disabled={disabled} onClick={onClick}>
    {children}
  </button>
);

export const AreaToolbar: React.FC<{ map: OLMap; areas: MesoscaleAreasController }> = ({ map, areas }) => {
  const addFromView = (): void => {
    const polygon = viewBoxPolygon(map);
    if (polygon) areas.addPolygon(polygon);
  };
  const removeSelected = (): void => {
    if (areas.selectedId) areas.removeArea(areas.selectedId);
  };
  return (
    <div className="mesoscale-toolbar" role="toolbar" aria-label="Area tools">
      <ToolButton label="Select and edit areas" pressed={areas.tool === 'select'} onClick={() => areas.setTool('select')}><Hand aria-hidden="true" /></ToolButton>
      <ToolButton label={areas.atLimit ? 'Area limit reached' : 'Draw an area'} pressed={areas.tool === 'draw'} disabled={areas.atLimit} onClick={() => areas.setTool('draw')}><PenLine aria-hidden="true" /></ToolButton>
      <ToolButton label="Add a box in the middle of the view" disabled={areas.atLimit} onClick={addFromView}><Square aria-hidden="true" /></ToolButton>
      <span className="mesoscale-toolbar__divider" aria-hidden="true" />
      <ToolButton label="Undo" disabled={!areas.canUndo} onClick={areas.undo}><Undo2 aria-hidden="true" /></ToolButton>
      <ToolButton label="Redo" disabled={!areas.canRedo} onClick={areas.redo}><Redo2 aria-hidden="true" /></ToolButton>
      <ToolButton label="Delete selected area" disabled={!areas.selectedId} onClick={removeSelected}><Trash2 aria-hidden="true" /></ToolButton>
    </div>
  );
};
