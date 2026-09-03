import type { CustomProductId, HostedCustomProduct, OneOffCustomLayer } from '../types/customProducts';
import {
  asCustomLayerId,
  createLayerFromHostedProduct,
  isOneOffCustomLayer,
} from './customProducts';
import { listBuiltInCustomProducts, isBuiltInCustomProduct } from './builtInCustomProducts';
import { isBuiltInCustomProductId } from './customProductTrust';

export const CUSTOM_PRODUCT_HANDOFF_KEY = 'gfc-custom-product-handoff';

/** Returns whether a snapshot still matches one of the built-in products. */
const isKnownBuiltInProductSnapshot = (snapshot: OneOffCustomLayer['productSnapshot']): boolean =>
  Boolean(snapshot?.builtIn)
  && isBuiltInCustomProductId(snapshot?.sourceProductId)
  && listBuiltInCustomProducts().some((product) => (
    product.id === snapshot?.sourceProductId && product.version === snapshot?.sourceProductVersion
  ));

/** Reads the handoff without allowing unavailable browser storage to break forecast mounting. */
const safeGetItem = (key: string): string | null => {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
};

/** Writes the handoff when browser storage is available. */
const safeSetItem = (key: string, value: string): void => {
  try {
    sessionStorage.setItem(key, value);
  } catch {
    return; // swallow storage write failure — caller cannot recover
  }
};

/** Removes the handoff when browser storage is available. */
const safeRemoveItem = (key: string): boolean => {
  try {
    sessionStorage.removeItem(key);
    return true;
  } catch {
    return false;
  }
};

/** Restores a validated handoff when the forecast cannot accept it yet. */
export const restoreCustomProductForecastHandoff = (layer: OneOffCustomLayer): void => {
  if (!isOneOffCustomLayer(layer)) throw new TypeError('Cannot restore an invalid custom product handoff.');
  safeSetItem(CUSTOM_PRODUCT_HANDOFF_KEY, JSON.stringify(layer));
};

/** Stages a detached empty layer for the forecast editor to consume without retaining a live template reference. */
export const stageCustomProductForForecast = (
  product: HostedCustomProduct,
  premiumActive: boolean,
): OneOffCustomLayer => {
  if (!premiumActive && !isBuiltInCustomProduct(product)) throw new Error('Premium is required to use a reusable product in a new map.');
  if (product.status !== 'active') throw new Error('Archived products cannot be loaded into a new map.');
  const nonce = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const layer = createLayerFromHostedProduct({
    product,
    layerId: asCustomLayerId(`custom-${nonce}`),
    order: 0,
  });
  restoreCustomProductForecastHandoff(layer);
  return layer;
};

/** Consumes only a fully validated staged layer and clears malformed handoffs defensively. */
export const consumeCustomProductForecastHandoff = (premiumActive: boolean): OneOffCustomLayer | null => {
  const serialized = safeGetItem(CUSTOM_PRODUCT_HANDOFF_KEY);
  if (!serialized) return null;
  if (!safeRemoveItem(CUSTOM_PRODUCT_HANDOFF_KEY)) return null;
  try {
    const parsed = JSON.parse(serialized) as unknown;
    if (!isOneOffCustomLayer(parsed)) return null;
    return premiumActive || isKnownBuiltInProductSnapshot(parsed.productSnapshot) ? parsed : null;
  } catch {
    return null;
  }
};

/** Clears a staged layer only when it was created from the deleted product. */
export const clearCustomProductForecastHandoff = (sourceProductId: CustomProductId): void => {
  const serialized = safeGetItem(CUSTOM_PRODUCT_HANDOFF_KEY);
  if (!serialized) return;
  try {
    const parsed = JSON.parse(serialized) as unknown;
    if (isOneOffCustomLayer(parsed) && parsed.productSnapshot?.sourceProductId === sourceProductId) {
      safeRemoveItem(CUSTOM_PRODUCT_HANDOFF_KEY);
    }
  } catch {
    safeRemoveItem(CUSTOM_PRODUCT_HANDOFF_KEY);
  }
};
