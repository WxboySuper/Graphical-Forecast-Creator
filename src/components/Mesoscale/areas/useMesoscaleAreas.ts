import { useCallback, useState } from 'react';
import type { Polygon } from 'geojson';
import { MAX_MESOSCALE_AREAS } from '../../../utils/mesoscaleValidationLimits';
import type { MesoscaleArea } from '../../../store/mesoscaleSlice';
import { createArea, nextAreaTitle } from './areaModel';
import type { AreaTool } from './MesoscaleAreaLayer';
import { useAreaHistory, type AreaHistory } from './useAreaHistory';

export interface MesoscaleAreasController extends AreaHistory {
  tool: AreaTool;
  setTool: (tool: AreaTool) => void;
  selectedId: string | null;
  select: (id: string | null) => void;
  atLimit: boolean;
  addPolygon: (polygon: Polygon) => void;
  updateArea: (id: string, changes: Partial<MesoscaleArea>) => void;
  setGeometry: (id: string, polygon: Polygon) => void;
  removeArea: (id: string) => void;
}

/** State and actions for drawing, selecting, and editing Mesoscale areas. */
export const useMesoscaleAreas = (): MesoscaleAreasController => {
  const history = useAreaHistory();
  const { areas, commit } = history;
  const [tool, setTool] = useState<AreaTool>('select');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const atLimit = areas.length >= MAX_MESOSCALE_AREAS;

  const addPolygon = useCallback((polygon: Polygon) => {
    if (areas.length >= MAX_MESOSCALE_AREAS) return;
    const area = createArea(polygon, new Date(), crypto.randomUUID(), nextAreaTitle(areas.map(item => item.title)));
    commit([...areas, area]);
    setSelectedId(area.id);
    setTool('select');
  }, [areas, commit]);

  const updateArea = useCallback((id: string, changes: Partial<MesoscaleArea>) => {
    commit(areas.map(area => (area.id === id ? { ...area, ...changes, updatedAt: new Date().toISOString() } : area)));
  }, [areas, commit]);

  const setGeometry = useCallback((id: string, geometry: Polygon) => updateArea(id, { geometry }), [updateArea]);

  const removeArea = useCallback((id: string) => {
    commit(areas.filter(area => area.id !== id));
    setSelectedId(current => (current === id ? null : current));
  }, [areas, commit]);

  const select = useCallback((id: string | null) => setSelectedId(id), []);
  return { ...history, tool, setTool, selectedId, select, atLimit, addPolygon, updateArea, setGeometry, removeArea };
};
