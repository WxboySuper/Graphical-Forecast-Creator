import { useMemo, useState } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { useEntitlement } from '../billing/EntitlementProvider';
import type { HostedCustomProduct, HostedCustomProductStatus, OneOffCustomLayer } from '../types/customProducts';
import { getCustomProductsRepository, type CustomProductDraft } from '../lib/customProductsRepository';
import { listBuiltInCustomProducts } from '../lib/builtInCustomProducts';
import { useCustomProductActions } from './useCustomProductActions';
import { useCustomProductSubscription } from './useCustomProductSubscription';

export interface UseCustomProductsResult {
  products: HostedCustomProduct[];
  builtInProducts: HostedCustomProduct[];
  userProducts: HostedCustomProduct[];
  loading: boolean;
  /** Mutation / handoff failures surfaced in the editor (or page banner when no editor is open). */
  error: string | null;
  /** Live subscription load failures; never shown inside the editor. */
  loadError: string | null;
  premiumActive: boolean;
  pendingAction: { action: string; productId?: string } | null;
  createProduct(draft: CustomProductDraft): Promise<boolean>;
  updateProduct(product: HostedCustomProduct, draft: CustomProductDraft): Promise<boolean>;
  duplicateProduct(product: HostedCustomProduct): Promise<boolean>;
  setProductStatus(product: HostedCustomProduct, status: HostedCustomProductStatus): Promise<boolean>;
  deleteProduct(product: HostedCustomProduct): Promise<boolean>;
  useProduct(product: HostedCustomProduct): OneOffCustomLayer | null;
}

/** Composes subscription and mutation hooks for the gated reusable-product page. */
export const useCustomProducts = (): UseCustomProductsResult => {
  const { user } = useAuth();
  const { premiumActive } = useEntitlement();
  const repository = useMemo(getCustomProductsRepository, []);
  const [saveError, setSaveError] = useState<string | null>(null);
  const subscription = useCustomProductSubscription(repository, user?.uid);
  const builtInProducts = useMemo(listBuiltInCustomProducts, []);
  const actions = useCustomProductActions({
    repository,
    userId: user?.uid,
    premiumActive,
    setError: setSaveError,
  });
  const userProducts = subscription.state.products;
  return {
    ...subscription.state,
    error: saveError,
    loadError: subscription.state.loadError,
    products: [...builtInProducts, ...userProducts],
    builtInProducts,
    userProducts,
    ...actions,
    premiumActive,
  };
};
