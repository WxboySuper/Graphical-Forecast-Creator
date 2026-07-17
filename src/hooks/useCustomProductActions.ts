import { useCallback } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { HostedCustomProduct, HostedCustomProductStatus, OneOffCustomLayer } from '../types/customProducts';
import type { CustomProductDraft, CustomProductsRepository } from '../lib/customProductsRepository';
import { clearCustomProductForecastHandoff, stageCustomProductForForecast } from '../lib/customProductHandoff';
import { useCustomProductWriter } from './useCustomProductWriter';

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
  const { pendingAction, runWrite } = useCustomProductWriter({ userId, premiumActive, setError });

  const createProduct = useCallback((draft: CustomProductDraft) =>
    runWrite('create', undefined, (uid) => repository.create(uid, draft)), [repository, runWrite]);
  const updateProduct = useCallback((product: HostedCustomProduct, draft: CustomProductDraft) =>
    runWrite('update', product.id, (uid) => repository.update(uid, product, draft)), [repository, runWrite]);
  const duplicateProduct = useCallback((product: HostedCustomProduct) =>
    runWrite('duplicate', product.id, (uid) => repository.create(uid, duplicateDraft(product))), [repository, runWrite]);
  const setProductStatus = useCallback((product: HostedCustomProduct, status: HostedCustomProductStatus) =>
    runWrite('status', product.id, (uid) => repository.setStatus(uid, product, status)), [repository, runWrite]);
  const deleteProduct = useCallback((product: HostedCustomProduct) =>
    runWrite('delete', product.id, async (uid) => {
      await repository.delete(uid, product);
      clearCustomProductForecastHandoff(product.id);
    }, false), [repository, runWrite]);
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
