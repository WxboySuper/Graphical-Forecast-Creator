import { useEffect, useLayoutEffect, useRef } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import type { AppDispatch } from '../store';
import { replaceMesoscaleProduct, selectMesoscaleState } from '../store/mesoscaleSlice';
import { getMesoscaleStorageKey, loadMesoscaleAutosave, saveMesoscaleAutosave } from '../utils/mesoscalePersistence';

const DEBOUNCE_MS = 5000;
interface Scope { userId?: string | null; enabled: boolean }
const RESTORED_SCOPES = new Set<string>();
const shouldFlushScope = (previous: Scope, userId: string | null | undefined, enabled: boolean): boolean =>
  previous.enabled && (previous.userId !== userId || !enabled);

/** Restores the Mesoscale session and flushes pending edits before account-scope changes. */
export const useMesoscaleAutoSave = (userId?: string | null, enabled = true): void => {
  const dispatch = useDispatch<AppDispatch>();
  const product = useSelector(selectMesoscaleState);
  const previousScope = useRef<Scope>({ userId, enabled });
  const latestProduct = useRef(product);
  const restoredScope = useRef<string | null>(null);

  useLayoutEffect(() => {
    const oldScope = previousScope.current;
    if (shouldFlushScope(oldScope, userId, enabled)) {
      try { saveMesoscaleAutosave(latestProduct.current, oldScope.userId); } catch { /* local storage may be unavailable */ }
    }
    previousScope.current = { userId, enabled };
    latestProduct.current = product;
  }, [userId, enabled, product]);

  useEffect(() => {
    if (!enabled) return;
    const scopeKey = getMesoscaleStorageKey(userId);
    if (RESTORED_SCOPES.has(scopeKey)) {
      restoredScope.current = scopeKey;
      return;
    }
    dispatch(replaceMesoscaleProduct(loadMesoscaleAutosave(userId)));
    RESTORED_SCOPES.add(scopeKey);
    restoredScope.current = scopeKey;
  }, [dispatch, enabled, userId]);

  useEffect(() => {
    if (!enabled || restoredScope.current !== getMesoscaleStorageKey(userId)) return;
    const snapshot = product;
    const timeout = setTimeout(() => {
      try { saveMesoscaleAutosave(snapshot, userId); } catch { /* local storage may be unavailable */ }
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(timeout);
      if (latestProduct.current !== snapshot) return;
      try { saveMesoscaleAutosave(snapshot, userId); } catch { /* local storage may be unavailable */ }
    };
  }, [enabled, product, userId]);
};

export const getMesoscaleAutoSaveKey = (userId?: string | null): string => getMesoscaleStorageKey(userId);
