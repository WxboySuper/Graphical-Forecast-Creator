import { useEffect, useLayoutEffect, useRef } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import type { AppDispatch, RootState } from '../store';
import { replaceMesoscaleProduct, selectMesoscaleState } from '../store/mesoscaleSlice';
import { getMesoscaleStorageKey, loadMesoscaleAutosave, saveMesoscaleAutosave } from '../utils/mesoscalePersistence';

const DEBOUNCE_MS = 5000;
interface Scope { userId?: string | null; enabled: boolean }

/** Restores the Mesoscale session and flushes pending edits before account-scope changes. */
export const useMesoscaleAutoSave = (userId?: string | null, enabled = true): void => {
  const dispatch = useDispatch<AppDispatch>();
  const product = useSelector(selectMesoscaleState);
  const previousScope = useRef<Scope>({ userId, enabled });
  const latestProduct = useRef(product);
  const restoredScope = useRef<string | null>(null);

  useLayoutEffect(() => {
    const oldScope = previousScope.current;
    if (oldScope.enabled && (oldScope.userId !== userId || !enabled)) {
      try { saveMesoscaleAutosave(latestProduct.current, oldScope.userId); } catch { /* local storage may be unavailable */ }
    }
    previousScope.current = { userId, enabled };
    latestProduct.current = product;
  }, [userId, enabled, product]);

  useEffect(() => {
    if (!enabled) return;
    const scopeKey = getMesoscaleStorageKey(userId);
    if (restoredScope.current === scopeKey) return;
    dispatch(replaceMesoscaleProduct(loadMesoscaleAutosave(userId)));
    restoredScope.current = scopeKey;
  }, [dispatch, enabled, userId]);

  useEffect(() => {
    if (!enabled || restoredScope.current !== getMesoscaleStorageKey(userId)) return;
    const snapshot = product;
    const timeout = setTimeout(() => {
      try { saveMesoscaleAutosave(snapshot, userId); } catch { /* local storage may be unavailable */ }
    }, DEBOUNCE_MS);
    return () => clearTimeout(timeout);
  }, [enabled, product, userId]);
};

export const getMesoscaleAutoSaveKey = (userId?: string | null): string => getMesoscaleStorageKey(userId);
export const selectMesoscaleAutoSaveEnabled = (state: RootState): boolean => state.forecast.workspaceId === 'mesoscale';
