import { useCallback, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { selectMesoscaleAreas, setMesoscaleAreas, type MesoscaleArea } from '../../../store/mesoscaleSlice';

const MAX_HISTORY = 50;

export interface AreaHistory {
  areas: MesoscaleArea[];
  /** Applies a change and records the previous areas for undo. */
  commit: (next: MesoscaleArea[]) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

/** Undo/redo over the stored areas. Snapshots are small (at most 20 polygons) and live for the session. */
export const useAreaHistory = (): AreaHistory => {
  const dispatch = useDispatch();
  const areas = useSelector(selectMesoscaleAreas);
  const past = useRef<MesoscaleArea[][]>([]);
  const future = useRef<MesoscaleArea[][]>([]);
  const [, setVersion] = useState(0);
  const areasRef = useRef(areas);
  areasRef.current = areas;

  const apply = useCallback((next: MesoscaleArea[]) => { dispatch(setMesoscaleAreas(next)); setVersion(v => v + 1); }, [dispatch]);

  const commit = useCallback((next: MesoscaleArea[]) => {
    past.current = [...past.current, areasRef.current].slice(-MAX_HISTORY);
    future.current = [];
    apply(next);
  }, [apply]);

  const undo = useCallback(() => {
    const previous = past.current[past.current.length - 1];
    if (!previous) return;
    past.current = past.current.slice(0, -1);
    future.current = [...future.current, areasRef.current];
    apply(previous);
  }, [apply]);

  const redo = useCallback(() => {
    const next = future.current[future.current.length - 1];
    if (!next) return;
    future.current = future.current.slice(0, -1);
    past.current = [...past.current, areasRef.current];
    apply(next);
  }, [apply]);

  return { areas, commit, undo, redo, canUndo: past.current.length > 0, canRedo: future.current.length > 0 };
};
