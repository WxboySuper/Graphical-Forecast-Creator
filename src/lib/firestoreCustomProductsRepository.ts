import {
  collection,
  doc,
  getDocs,
  onSnapshot,
  runTransaction,
  type DocumentReference,
  type Transaction,
} from 'firebase/firestore';
import { v4 as uuidv4 } from 'uuid';
import { CUSTOM_PRODUCT_LIMITS, type HostedCustomProduct } from '../types/customProducts';
import type { CustomProductDraft, CustomProductsRepository } from './customProductsRepository';
import { isHostedCustomProduct } from './customProducts';
import {
  assertExpectedVersion,
  createHostedProduct,
  reviseProduct,
  sortProducts,
} from './customProductRepositoryModel';
import { requireDb } from './firebase';
import { fetchBetaApi, isBetaClerkD1Mode, isBetaSessionInitializing } from './betaApi';

export const CUSTOM_PRODUCT_DOCUMENT_SLOTS = Array.from(
  { length: CUSTOM_PRODUCT_LIMITS.productsPerAccount },
  (_, index) => `product-${String(index + 1).padStart(2, '0')}`,
);

interface FirestoreProductRecord {
  slotId: string;
  product: HostedCustomProduct;
}

const collectionRef = (userId: string) => collection(requireDb(), 'users', userId, 'customProducts');
const productRef = (userId: string, slotId: string) => doc(requireDb(), 'users', userId, 'customProducts', slotId);

const ownedProduct = (value: unknown, userId: string): value is HostedCustomProduct =>
  isHostedCustomProduct(value) && value.userId === userId && !value.builtIn;

const readRecords = async (userId: string): Promise<FirestoreProductRecord[]> => {
  const snapshot = await getDocs(collectionRef(userId));
  return snapshot.docs.flatMap((item) => {
    const value = item.data();
    return ownedProduct(value, userId) ? [{ slotId: item.id, product: value }] : [];
  });
};

const findRecord = async (userId: string, productId: string): Promise<FirestoreProductRecord> => {
  const record = (await readRecords(userId)).find(({ product }) => product.id === productId);
  if (!record) throw new Error('Custom product not found.');
  return record;
};

const requireCurrentProduct = (value: unknown, userId: string, productId: string): HostedCustomProduct => {
  if (!isHostedCustomProduct(value)) throw new Error('Custom product not found.');
  if (value.userId !== userId) throw new Error('Custom product not found.');
  if (value.id !== productId) throw new Error('Custom product not found.');
  return value;
};

const withStoredProduct = async <T>(
  userId: string,
  expected: HostedCustomProduct,
  operation: (transaction: Transaction, reference: DocumentReference, current: HostedCustomProduct) => T,
): Promise<T> => {
  const { slotId } = await findRecord(userId, expected.id);
  return runTransaction(requireDb(), async (transaction) => {
    const reference = productRef(userId, slotId);
    const current = requireCurrentProduct((await transaction.get(reference)).data(), userId, expected.id);
    assertExpectedVersion(current, expected);
    return operation(transaction, reference, current);
  });
};

const writeRevision = (
  userId: string,
  expected: HostedCustomProduct,
  draft: CustomProductDraft,
  status = expected.status,
): Promise<HostedCustomProduct> => withStoredProduct(userId, expected, (transaction, reference, current) => {
  const revised = reviseProduct(current, draft, status);
  transaction.set(reference, revised);
  return revised;
});

/** Picks the first open slot from any occupied document ids (including malformed docs the client skips). */
export const findOpenProductSlot = (occupiedSlotIds: Iterable<string>): string => {
  const occupied = new Set(occupiedSlotIds);
  const slot = CUSTOM_PRODUCT_DOCUMENT_SLOTS.find((candidate) => !occupied.has(candidate));
  if (!slot) throw new Error(`Custom product limit reached (${CUSTOM_PRODUCT_LIMITS.productsPerAccount}).`);
  return slot;
};

const readBetaProducts = async (userId: string): Promise<HostedCustomProduct[]> => {
  const response = await fetchBetaApi('/api/custom-products');
  const body = (await response.json().catch(() => ({}))) ?? {};
  if (!response.ok) throw new Error(body.error || 'Unable to load custom products.');
  return sortProducts((Array.isArray(body?.products) ? body.products : [])
    .filter((value: unknown): value is HostedCustomProduct => ownedProduct(value, userId)));
};

const reviseBetaProduct = async (userId: string, expected: HostedCustomProduct, next: HostedCustomProduct | null): Promise<HostedCustomProduct | null> => {
  const products = await readBetaProducts(userId);
  const current = products.find((candidate) => candidate.id === expected.id);
  if (!current || current.version !== expected.version) throw new Error('This product changed in another session. Refresh and try again.');
  const response = await fetchBetaApi(`/api/custom-products/${encodeURIComponent(expected.id)}`, {
    method: next ? 'PATCH' : 'DELETE',
    headers: { 'If-Match': String(expected.version) },
    body: next ? JSON.stringify({ product: next, expectedVersion: expected.version }) : undefined,
  });
  const body = (await response.json().catch(() => ({}))) ?? {};
  if (!response.ok) throw new Error(body?.error || 'Unable to save custom product.');
  return next;
};

const readOccupiedSlots = async (userId: string): Promise<Set<string>> => {
  const snapshot = await getDocs(collectionRef(userId));
  return new Set(snapshot.docs.map((item) => item.id));
};

export const firestoreCustomProductsRepository: CustomProductsRepository = {
  async list(userId) {
    if (isBetaClerkD1Mode()) return readBetaProducts(userId);
    return sortProducts((await readRecords(userId)).map(({ product }) => product));
  },
  subscribe(userId, onUpdate, onError) {
    if (isBetaClerkD1Mode()) {
      let active = true;
      let retryTimer: ReturnType<typeof globalThis.setTimeout> | undefined;
      const refresh = () => readBetaProducts(userId).then((products) => { if (active) onUpdate(products); }).catch((error) => {
        if (!active) return;
        if (isBetaSessionInitializing(error)) {
          if (retryTimer !== undefined) globalThis.clearTimeout(retryTimer);
          retryTimer = globalThis.setTimeout(() => { retryTimer = undefined; void refresh(); }, 250);
          return;
        }
        onError?.(error instanceof Error ? error : new Error('Unable to load custom products.'));
      });
      refresh().catch(() => undefined);
      const timer = globalThis.setInterval(() => refresh().catch(() => undefined), 15_000);
      return () => { active = false; globalThis.clearInterval(timer); if (retryTimer !== undefined) globalThis.clearTimeout(retryTimer); };
    }
    return onSnapshot(collectionRef(userId), (snapshot) => {
      const products = snapshot.docs.map((item) => item.data()).filter((value) => ownedProduct(value, userId));
      onUpdate(sortProducts(products));
    }, (error) => onError?.(error));
  },
  async create(userId, draft) {
    if (isBetaClerkD1Mode()) {
      const products = await readBetaProducts(userId);
      if (products.length >= CUSTOM_PRODUCT_LIMITS.productsPerAccount) {
        throw new Error(`Custom product limit reached (${CUSTOM_PRODUCT_LIMITS.productsPerAccount}).`);
      }
      const product = createHostedProduct({ id: uuidv4(), userId, draft });
      const response = await fetchBetaApi('/api/custom-products', { method: 'POST', body: JSON.stringify({ product }) });
      const body = (await response.json().catch(() => ({}))) ?? {};
      if (!response.ok) throw new Error(body?.error || 'Unable to create custom product.');
      return body?.product && ownedProduct(body.product, userId) ? body.product : product;
    }
    const slot = findOpenProductSlot(await readOccupiedSlots(userId));
    const product = createHostedProduct({ id: uuidv4(), userId, draft });
    await runTransaction(requireDb(), async (transaction) => {
      const reference = productRef(userId, slot);
      if ((await transaction.get(reference)).exists()) {
        throw new Error('The selected product slot was claimed. Please try again.');
      }
      transaction.set(reference, product);
    });
    return product;
  },
  update(userId, product, draft) {
    if (isBetaClerkD1Mode()) return reviseBetaProduct(userId, product, reviseProduct(product, draft)).then((next) => next as HostedCustomProduct);
    return writeRevision(userId, product, draft);
  },
  setStatus(userId, product, status) {
    if (isBetaClerkD1Mode()) return reviseBetaProduct(userId, product, reviseProduct(product, product, status)).then((next) => next as HostedCustomProduct);
    return writeRevision(userId, product, product, status);
  },
  async delete(userId, product) {
    if (isBetaClerkD1Mode()) { await reviseBetaProduct(userId, product, null); return; }
    await withStoredProduct(userId, product, (transaction, reference) => transaction.delete(reference));
  },
};
