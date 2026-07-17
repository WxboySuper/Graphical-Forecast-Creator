import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { useEntitlement } from '../billing/EntitlementProvider';
import type { HostedCustomProduct, HostedCustomProductStatus, OneOffCustomLayer } from '../types/customProducts';
import {
  getCustomProductsRepository,
  type CustomProductDraft,
} from '../lib/customProductsRepository';
import { stageCustomProductForForecast } from '../lib/customProductHandoff';

export interface UseCustomProductsResult {
  products: HostedCustomProduct[];
  loading: boolean;
  error: string | null;
  premiumActive: boolean;
  pendingAction: { action: string; productId?: string } | null;
  createProduct(draft: CustomProductDraft): Promise<boolean>;
  updateProduct(product: HostedCustomProduct, draft: CustomProductDraft): Promise<boolean>;
  duplicateProduct(product: HostedCustomProduct): Promise<boolean>;
  setProductStatus(product: HostedCustomProduct, status: HostedCustomProductStatus): Promise<boolean>;
  deleteProduct(product: HostedCustomProduct): Promise<boolean>;
  useProduct(product: HostedCustomProduct): OneOffCustomLayer | null;
}

/** Local-only reusable-product state; this hook is imported only by the gated page chunk. */
export const useCustomProducts = (): UseCustomProductsResult => {
  const { user } = useAuth();
  const { premiumActive } = useEntitlement();
  const repository = useMemo(getCustomProductsRepository, []);
  const [products, setProducts] = useState<HostedCustomProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<UseCustomProductsResult['pendingAction']>(null);
  const pendingRef = useRef(false);

  useEffect(() => {
    if (!user?.uid) {
      setProducts([]);
      setLoading(false);
      return undefined;
    }
    setLoading(true);
    return repository.subscribe(
      user.uid,
      (nextProducts) => {
        setProducts(nextProducts);
        setLoading(false);
        setError(null);
      },
      (nextError) => {
        setError(nextError.message);
        setLoading(false);
      },
    );
  }, [repository, user?.uid]);

  const runWrite = useCallback(async (
    action: string,
    productId: string | undefined,
    operation: () => Promise<unknown>,
  ): Promise<boolean> => {
    if (!user?.uid) {
      setError('Sign in to manage reusable products.');
      return false;
    }
    if (!premiumActive) {
      setError('Premium is required to change reusable products.');
      return false;
    }
    if (pendingRef.current) return false;
    pendingRef.current = true;
    setPendingAction({ action, ...(productId ? { productId } : {}) });
    try {
      setError(null);
      await operation();
      return true;
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Unable to update custom products.');
      return false;
    } finally {
      pendingRef.current = false;
      setPendingAction(null);
    }
  }, [premiumActive, user?.uid]);

  const createProduct = useCallback((draft: CustomProductDraft) => runWrite('create', undefined,
    () => repository.create(user!.uid, draft),
  ), [repository, runWrite, user]);

  const updateProduct = useCallback((product: HostedCustomProduct, draft: CustomProductDraft) => runWrite('update', product.id,
    () => repository.update(user!.uid, product, draft),
  ), [repository, runWrite, user]);

  const duplicateProduct = useCallback((product: HostedCustomProduct) => runWrite('duplicate', product.id,
    () => repository.create(user!.uid, {
      label: `${product.label} copy`.slice(0, 64),
      description: product.description,
      categories: product.categories,
    }),
  ), [repository, runWrite, user]);

  const setProductStatus = useCallback((product: HostedCustomProduct, status: HostedCustomProductStatus) => runWrite('status', product.id,
    () => repository.setStatus(user!.uid, product, status),
  ), [repository, runWrite, user]);

  const deleteProduct = useCallback((product: HostedCustomProduct) => runWrite('delete', product.id,
    () => repository.delete(user!.uid, product),
  ), [repository, runWrite, user]);

  const useProduct = useCallback((product: HostedCustomProduct): OneOffCustomLayer | null => {
    try {
      setError(null);
      return stageCustomProductForForecast(product, premiumActive);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Unable to load custom product.');
      return null;
    }
  }, [premiumActive]);

  return {
    products,
    loading,
    error,
    premiumActive,
    pendingAction,
    createProduct,
    updateProduct,
    duplicateProduct,
    setProductStatus,
    deleteProduct,
    useProduct,
  };
};
