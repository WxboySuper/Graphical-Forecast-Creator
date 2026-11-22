import { useCallback, useState } from 'react';
import type { Polygon } from 'geojson';
import { MAX_MESOSCALE_AREAS } from '../../../utils/mesoscaleValidationLimits';
import type { MesoscaleArea, MesoscaleAreaStyle } from '../../../store/mesoscaleSlice';
import { createArea, newAreaId, nextAreaTitle } from './areaModel';
import type { AreaTool } from './MesoscaleAreaLayer';
import { useAreaHistory, type AreaHistory } from './useAreaHistory';

/** A style change: the new style (undefined clears it) and an optional key that merges a run of changes into one undo step. */
export interface StyleEdit {
  style: MesoscaleAreaStyle | undefined;
  coalesceKey?: string;
}

export interface MesoscaleAreasController extends AreaHistory {
  tool: AreaTool;
  setTool: (tool: AreaTool) => void;
  selectedId: string | null;
  select: (id: string | null) => void;
  atLimit: boolean;
  addPolygon: (polygon: Polygon) => void;
  updateArea: (id: string, changes: Partial<MesoscaleArea>, coalesceKey?: string) => void;
  /** Sets or clears an area's custom style as one undo step; a `coalesceKey` merges a slider drag into that step. */
  setAreaStyle: (id: string, edit: StyleEdit) => void;
  /** `coalesce` merges a run of vertex nudges into one undo step. */
  setGeometry: (id: string, polygon: Polygon, coalesce?: boolean) => void;
  /** The vertex being edited from the keyboard, highlighted on the map. */
  activeVertex: number | null;
  setActiveVertex: (index: number | null) => void;
  removeArea: (id: string) => void;
}

type Commit = AreaHistory['commit'];
type Areas = MesoscaleArea[];

/** Typing in one field is one undo step; geometry changes get their own unless the caller merges them. */
const defaultCoalesceKey = (id: string, changes: Partial<MesoscaleArea>): string | undefined =>
  ('geometry' in changes ? undefined : `${id}:${Object.keys(changes).join(',')}`);

const withoutStyle = (area: MesoscaleArea): MesoscaleArea => {
  const { style: _previous, ...rest } = area;
  return rest;
};

/** The area with its style replaced, or with no `style` key at all when cleared. */
const restyled = (area: MesoscaleArea, { style }: StyleEdit, updatedAt: string): MesoscaleArea =>
  ({ ...withoutStyle(area), ...(style ? { style } : {}), updatedAt });

const mapArea = (areas: Areas, id: string, change: (area: MesoscaleArea) => MesoscaleArea): Areas =>
  areas.map(area => (area.id === id ? change(area) : area));

/** The area that is picked for editing; an undo or redo that removes it must not leave a stale id behind. */
const useAreaSelection = (areas: Areas): { selectedId: string | null; select: (id: string | null) => void; clearIf: (id: string) => void } => {
  const [pickedId, setPickedId] = useState<string | null>(null);
  const selectedId = areas.some(area => area.id === pickedId) ? pickedId : null;
  const clearIf = useCallback((id: string) => setPickedId(current => (current === id ? null : current)), []);
  return { selectedId, select: setPickedId, clearIf };
};

/** The edits that change an existing area; each one is a single undo step unless it is coalesced. */
const useAreaEdits = (commit: Commit): Pick<MesoscaleAreasController, 'updateArea' | 'setGeometry' | 'setAreaStyle' | 'removeArea'> => {
  const updateArea = useCallback((id: string, changes: Partial<MesoscaleArea>, coalesceKey?: string) => {
    const updatedAt = new Date().toISOString();
    commit(current => mapArea(current, id, area => ({ ...area, ...changes, updatedAt })), coalesceKey ?? defaultCoalesceKey(id, changes));
  }, [commit]);

  const setGeometry = useCallback(
    (id: string, geometry: Polygon, coalesce = false) => updateArea(id, { geometry }, coalesce ? `${id}:vertex` : undefined),
    [updateArea],
  );

  const setAreaStyle = useCallback((id: string, edit: StyleEdit) => {
    const updatedAt = new Date().toISOString();
    commit(current => mapArea(current, id, area => restyled(area, edit, updatedAt)), edit.coalesceKey ? `${id}:style:${edit.coalesceKey}` : undefined);
  }, [commit]);

  const removeArea = useCallback((id: string) => commit(current => current.filter(area => area.id !== id)), [commit]);
  return { updateArea, setGeometry, setAreaStyle, removeArea };
};

/** Adds a polygon as a new, selected area unless the limit is reached. */
const useAddPolygon = (commit: Commit, onAdded: (id: string) => void): ((polygon: Polygon) => void) =>
  useCallback((polygon: Polygon) => {
    const id = newAreaId();
    const added = commit(current => (current.length >= MAX_MESOSCALE_AREAS
      ? current
      : [...current, createArea(polygon, { id, title: nextAreaTitle(current.map(item => item.title)) })]));
    if (added) onAdded(id);
  }, [commit, onAdded]);

/** State and actions for drawing, selecting, and editing Mesoscale areas. */
export const useMesoscaleAreas = (): MesoscaleAreasController => {
  const history = useAreaHistory();
  const { areas, commit } = history;
  const [tool, setTool] = useState<AreaTool>('select');
  const [activeVertex, setActiveVertex] = useState<number | null>(null);
  const { selectedId, select, clearIf } = useAreaSelection(areas);
  const edits = useAreaEdits(commit);
  const { removeArea: removeFromHistory } = edits;

  const onAdded = useCallback((id: string) => { select(id); setTool('select'); }, [select]);
  const addPolygon = useAddPolygon(commit, onAdded);
  const removeArea = useCallback((id: string) => { removeFromHistory(id); clearIf(id); }, [removeFromHistory, clearIf]);

  return {
    ...history, ...edits, tool, setTool, selectedId, select, atLimit: areas.length >= MAX_MESOSCALE_AREAS,
    addPolygon, removeArea, activeVertex, setActiveVertex,
  };
};
