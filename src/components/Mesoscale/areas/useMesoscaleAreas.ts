import { useCallback, useState } from 'react';
import type { Polygon } from 'geojson';
import { MAX_MESOSCALE_AREAS } from '../../../utils/mesoscaleValidationLimits';
import type { MesoscaleArea } from '../../../store/mesoscaleSlice';
import { createArea, newAreaId, nextAreaTitle } from './areaModel';
import type { AreaTool } from './MesoscaleAreaLayer';
import { useAreaHistory, type AreaHistory } from './useAreaHistory';

export interface MesoscaleAreasController extends AreaHistory {
  tool: AreaTool;
  setTool: (tool: AreaTool) => void;
  selectedId: string | null;
  select: (id: string | null) => void;
  atLimit: boolean;
  addPolygon: (polygon: Polygon) => void;
  updateArea: (id: string, changes: Partial<MesoscaleArea>, coalesceKey?: string) => void;
  /** `coalesce` merges a run of vertex nudges into one undo step. */
  setGeometry: (id: string, polygon: Polygon, coalesce?: boolean) => void;
  /** The vertex being edited from the keyboard, highlighted on the map. */
  activeVertex: number | null;
  setActiveVertex: (index: number | null) => void;
  removeArea: (id: string) => void;
}

/** State and actions for drawing, selecting, and editing Mesoscale areas. */
export const useMesoscaleAreas = (): MesoscaleAreasController => {
  const history = useAreaHistory();
  const { areas, commit } = history;
  const [tool, setTool] = useState<AreaTool>('select');
  const [pickedId, setSelectedId] = useState<string | null>(null);
  const [activeVertex, setActiveVertex] = useState<number | null>(null);
  // Undo or redo can remove the picked area; never expose an id that no longer exists.
  const selectedId = areas.some(area => area.id === pickedId) ? pickedId : null;
  const atLimit = areas.length >= MAX_MESOSCALE_AREAS;

  const addPolygon = useCallback((polygon: Polygon) => {
    const id = newAreaId();
    const added = commit((current) => (current.length >= MAX_MESOSCALE_AREAS
      ? current
      : [...current, createArea(polygon, { id, title: nextAreaTitle(current.map(item => item.title)) })]));
    if (!added) return;
    setSelectedId(id);
    setTool('select');
  }, [commit]);

  const updateArea = useCallback((id: string, changes: Partial<MesoscaleArea>, coalesceKey?: string) => {
    const updatedAt = new Date().toISOString();
    // Typing in one field is one undo step; geometry changes get their own unless the caller merges them.
    const key = coalesceKey ?? ('geometry' in changes ? undefined : `${id}:${Object.keys(changes).join(',')}`);
    commit((current) => current.map(area => (area.id === id ? { ...area, ...changes, updatedAt } : area)), key);
  }, [commit]);

  const setGeometry = useCallback(
    (id: string, geometry: Polygon, coalesce = false) => updateArea(id, { geometry }, coalesce ? `${id}:vertex` : undefined),
    [updateArea],
  );

  const removeArea = useCallback((id: string) => {
    commit((current) => current.filter(area => area.id !== id));
    setSelectedId(current => (current === id ? null : current));
  }, [commit]);

  const select = useCallback((id: string | null) => setSelectedId(id), []);
  return { ...history, tool, setTool, selectedId, select, atLimit, addPolygon, updateArea, setGeometry, activeVertex, setActiveVertex, removeArea };
};
