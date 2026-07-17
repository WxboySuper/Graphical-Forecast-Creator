import { useCallback, useRef, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { HostedCustomProduct, HostedCustomProductStatus, OneOffCustomLayer } from '../types/customProducts';
import type { CustomProductDraft, CustomProductsRepository } from '../lib/customProductsRepository';
import { stageCustomProductForForecast } from '../lib/customProductHandoff';

type PendingAction = { action: string; productId?: string } | null;

const mutationError = (error: unknown): string =>
  error instanceof Error ? error.message : 'Unable to update custom products.';

const handoffError = (error: unknown): string =>
  error instanceof Error ? error.message : 'Unable to load custom product.';

const duplicateDraft = (product: HostedCustomProduct): CustomProductDraft => ({
  label: `${product.label} copy`.slice(0, 64),
  description: product.description,
  categories: product.categories,
});

export const useCustomProductActions = ({
  repository,
  userId,
  premiumActive,
  setError,
}: {
  repository: CustomProductsRepository;
  userId?: string;
  premiumActive: boolean;
  setError: Dispatch<SetStateAction<string | null>>;
}) => {
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const pendingRef = useRef(false);

  const runWrite = useCallback(async (
    action: string,
    productId: string | undefined,
    operation: (resolvedUserId: string) => Promise<unknown>,
  ): Promise<boolean> => {
    if (!userId) {
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
      await operation(userId);
      return true;
    } catch (error) {
      setError(mutationError(error));
      return false;
    } finally {
      pendingRef.current = false;
      setPendingAction(null);
    }
  }, [premiumActive, setError, userId]);

  const createProduct = useCallback((draft: CustomProductDraft) =>
    runWrite('create', undefined, (uid) => repository.create(uid, draft)), [repository, runWrite]);
  const updateProduct = useCallback((product: HostedCustomProduct, draft: CustomProductDraft) =>
    runWrite('update', product.id, (uid) => repository.update(uid, product, draft)), [repository, runWrite]);
  const duplicateProduct = useCallback((product: HostedCustomProduct) =>
    runWrite('duplicate', product.id, (uid) => repository.create(uid, duplicateDraft(product))), [repository, runWrite]);
  const setProductStatus = useCallback((product: HostedCustomProduct, status: HostedCustomProductStatus) =>
    runWrite('status', product.id, (uid) => repository.setStatus(uid, product, status)), [repository, runWrite]);
  const deleteProduct = useCallback((product: HostedCustomProduct) =>
    runWrite('delete', product.id, (uid) => repository.delete(uid, product)), [repository, runWrite]);
  const useProduct = useCallback((product: HostedCustomProduct): OneOffCustomLayer | null => {
    try {
      setError(null);
      return stageCustomProductForForecast(product, premiumActive);
    } catch (error) {
      setError(handoffError(error));
      return null;
    }
  }, [premiumActive, setError]);

  return {
    pendingAction,
    createProduct,
    updateProduct,
    duplicateProduct,
    setProductStatus,
    deleteProduct,
    useProduct,
  };
};
