import { useEffect, useMemo, useState } from 'react';
import type { HostedCustomProduct } from '../types/customProducts';
import type { CustomProductsRepository } from '../lib/customProductsRepository';

interface CustomProductSubscriptionState {
  products: HostedCustomProduct[];
  loading: boolean;
  loadError: string | null;
}

export const useCustomProductSubscription = (
  repository: CustomProductsRepository,
  userId?: string,
): { state: CustomProductSubscriptionState } => {
  const [products, setProducts] = useState<HostedCustomProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) {
      setProducts([]);
      setLoading(false);
      setLoadError(null);
      return undefined;
    }
    setLoading(true);
    return repository.subscribe(userId, (nextProducts) => {
      setProducts(nextProducts);
      setLoading(false);
      setLoadError(null);
    }, (nextError) => {
      setLoadError(nextError.message);
      setLoading(false);
    });
  }, [repository, userId]);

  const state = useMemo(
    () => ({ products, loading, loadError }),
    [loadError, loading, products],
  );
  return { state };
};
