import type { CustomProductId, HostedCustomProduct, OneOffCustomLayer } from '../types/customProducts';
import {
  asCustomLayerId,
  createLayerFromHostedProduct,
  isOneOffCustomLayer,
} from './customProducts';
import { listBuiltInCustomProducts, isBuiltInCustomProduct } from './builtInCustomProducts';
import { isBuiltInCustomProductId } from './customProductTrust';
import {
  getForecastWorkspace,
  type ForecastWorkspaceId,
} from '../config/forecastWorkspaces';

export const CUSTOM_PRODUCT_HANDOFF_KEY = 'gfc-custom-product-handoff';

/** The workspace that owns custom layers, and the only one that may consume a staged product. */
export const CUSTOM_PRODUCT_HANDOFF_WORKSPACE: ForecastWorkspaceId = 'custom';

/** A staged product names its destination so a Severe editor can never absorb it. */
export interface StagedCustomProductHandoff {
  workspaceId: ForecastWorkspaceId;
  layer: OneOffCustomLayer;
}

const isWorkspaceId = (value: unknown): value is ForecastWorkspaceId =>
  typeof value === 'string' && getForecastWorkspace(value)?.id === value;

const isStagedHandoff = (value: unknown): value is StagedCustomProductHandoff => {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<StagedCustomProductHandoff>;
  return isWorkspaceId(candidate.workspaceId) && isOneOffCustomLayer(candidate.layer);
};

const parseStagedHandoff = (serialized: string): StagedCustomProductHandoff | null => {
  try {
    const parsed = JSON.parse(serialized) as unknown;
    return isStagedHandoff(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

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

const serializeHandoff = (handoff: StagedCustomProductHandoff): string => JSON.stringify(handoff);

/** Restores a validated handoff when the forecast cannot accept it yet. */
export const restoreCustomProductForecastHandoff = (
  layer: OneOffCustomLayer,
  workspaceId: ForecastWorkspaceId = CUSTOM_PRODUCT_HANDOFF_WORKSPACE,
): void => {
  if (!isOneOffCustomLayer(layer)) throw new TypeError('Cannot restore an invalid custom product handoff.');
  if (!isWorkspaceId(workspaceId)) throw new TypeError('Cannot restore a handoff for an unknown workspace.');
  safeSetItem(CUSTOM_PRODUCT_HANDOFF_KEY, serializeHandoff({ workspaceId, layer }));
};

/** Stages a detached empty layer for its workspace editor to consume without retaining a live template reference. */
export const stageCustomProductForForecast = (
  product: HostedCustomProduct,
  premiumActive: boolean,
  workspaceId: ForecastWorkspaceId = CUSTOM_PRODUCT_HANDOFF_WORKSPACE,
): OneOffCustomLayer => {
  if (!premiumActive && !isBuiltInCustomProduct(product)) throw new Error('Premium is required to use a reusable product in a new map.');
  if (product.status !== 'active') throw new Error('Archived products cannot be loaded into a new map.');
  const nonce = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const layer = createLayerFromHostedProduct({
    product,
    layerId: asCustomLayerId(`custom-${nonce}`),
    order: 0,
  });
  restoreCustomProductForecastHandoff(layer, workspaceId);
  return layer;
};

/**
 * Consumes a staged product only for the workspace it was staged for. A handoff
 * staged for another workspace stays staged: consuming it here would inject
 * Custom layers into an editor that does not own them.
 */
export const consumeCustomProductForecastHandoff = (
  premiumActive: boolean,
  workspaceId: ForecastWorkspaceId,
): OneOffCustomLayer | null => {
  const serialized = safeGetItem(CUSTOM_PRODUCT_HANDOFF_KEY);
  if (!serialized) return null;
  const handoff = parseStagedHandoff(serialized);
  if (!handoff) {
    // A present-but-unreadable handoff is consumed defensively so it cannot linger.
    safeRemoveItem(CUSTOM_PRODUCT_HANDOFF_KEY);
    return null;
  }
  if (handoff.workspaceId !== workspaceId) return null;
  if (!safeRemoveItem(CUSTOM_PRODUCT_HANDOFF_KEY)) return null;
  return premiumActive || isKnownBuiltInProductSnapshot(handoff.layer.productSnapshot) ? handoff.layer : null;
};

/** Drops any staged handoff, used when the caller already applied the layer inline. */
export const discardCustomProductForecastHandoff = (): void => {
  safeRemoveItem(CUSTOM_PRODUCT_HANDOFF_KEY);
};

/** Clears a staged layer only when it was created from the deleted product. */
export const clearCustomProductForecastHandoff = (sourceProductId: CustomProductId): void => {
  const serialized = safeGetItem(CUSTOM_PRODUCT_HANDOFF_KEY);
  if (!serialized) return;
  try {
    const parsed = JSON.parse(serialized) as unknown;
    if (isStagedHandoff(parsed) && parsed.layer.productSnapshot?.sourceProductId === sourceProductId) {
      safeRemoveItem(CUSTOM_PRODUCT_HANDOFF_KEY);
    }
  } catch {
    safeRemoveItem(CUSTOM_PRODUCT_HANDOFF_KEY);
  }
};
