import { useCallback, useEffect, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { selectMesoscaleAreas, setMesoscaleAreas, type MesoscaleArea } from '../../../store/mesoscaleSlice';

const MAX_HISTORY = 50;
const COALESCE_WINDOW_MS = 1500;

type Areas = MesoscaleArea[];

/** Undo and redo stacks plus the last keyed edit, kept together so they reset as one. */
class AreaHistoryStacks {
  past: Areas[] = [];
  future: Areas[] = [];
  private lastEdit: { key: string; at: number } | null = null;

  reset(): void {
    this.past = [];
    this.future = [];
    this.lastEdit = null;
  }

  /** Records `current` as an undo step, unless this edit continues the previous keyed edit. */
  record(current: Areas, coalesceKey: string | undefined, now: number): void {
    const merges = this.continuesLastEdit(coalesceKey, now);
    this.lastEdit = coalesceKey === undefined ? null : { key: coalesceKey, at: now };
    if (!merges) this.past = [...this.past, current].slice(-MAX_HISTORY);
    this.future = [];
  }

  /** Moves one step back and returns the areas to restore, or null when there is nothing to undo. */
  undo(current: Areas): Areas | null {
    const previous = this.past[this.past.length - 1];
    if (!previous) return null;
    this.lastEdit = null;
    this.past = this.past.slice(0, -1);
    this.future = [...this.future, current];
    return previous;
  }

  redo(current: Areas): Areas | null {
    const next = this.future[this.future.length - 1];
    if (!next) return null;
    this.lastEdit = null;
    this.future = this.future.slice(0, -1);
    this.past = [...this.past, current];
    return next;
  }

  private continuesLastEdit(coalesceKey: string | undefined, now: number): boolean {
    const previous = this.lastEdit;
    if (coalesceKey === undefined || !previous) return false;
    return previous.key === coalesceKey && now - previous.at < COALESCE_WINDOW_MS;
  }
}

export interface AreaHistory {
  areas: Areas;
  /**
   * Applies a change. An updater function receives the latest areas, so back-to-back edits never
   * build on a stale copy. `coalesceKey` merges rapid edits of the same field into one undo step.
   */
  commit: (update: Areas | ((current: Areas) => Areas), coalesceKey?: string) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

/** Undo/redo over the stored areas. Snapshots are small (at most 20 polygons) and live for the session. */
export const useAreaHistory = (): AreaHistory => {
  const dispatch = useDispatch();
  const areas = useSelector(selectMesoscaleAreas);
  const stacks = useRef(new AreaHistoryStacks());
  const [, setVersion] = useState(0);
  const areasRef = useRef(areas);
  areasRef.current = areas;

  // The areas this hook last wrote. A different array means something else replaced the product
  // (an import, a reset, or restoring a saved session), which makes old undo steps meaningless.
  const lastWritten = useRef(areas);
  useEffect(() => {
    if (areas === lastWritten.current) return;
    lastWritten.current = areas;
    stacks.current.reset();
    setVersion(v => v + 1);
  }, [areas]);

  const apply = useCallback((next: Areas) => {
    lastWritten.current = next;
    dispatch(setMesoscaleAreas(next));
    setVersion(v => v + 1);
  }, [dispatch]);

  const commit = useCallback((update: Areas | ((current: Areas) => Areas), coalesceKey?: string) => {
    const current = areasRef.current;
    const next = typeof update === 'function' ? update(current) : update;
    if (next === current) return;
    stacks.current.record(current, coalesceKey, Date.now());
    areasRef.current = next;
    apply(next);
  }, [apply]);

  const undo = useCallback(() => {
    const restored = stacks.current.undo(areasRef.current);
    if (restored) apply(restored);
  }, [apply]);

  const redo = useCallback(() => {
    const restored = stacks.current.redo(areasRef.current);
    if (restored) apply(restored);
  }, [apply]);

  const { past, future } = stacks.current;
  return { areas, commit, undo, redo, canUndo: past.length > 0, canRedo: future.length > 0 };
};
