import {
  collection,
  doc,
  getDocs,
  onSnapshot,
  runTransaction,
} from 'firebase/firestore';
import { v4 as uuidv4 } from 'uuid';
import { getBuildTarget } from '../config/buildTarget';
import {
  CUSTOM_PRODUCT_LIMITS,
  CUSTOM_PRODUCTS_SCHEMA_VERSION,
  type CustomCategoryTemplate,
  type HostedCustomProduct,
  type HostedCustomProductStatus,
} from '../types/customProducts';
import {
  asCustomProductId,
  isHostedCustomProduct,
  reviseHostedCustomProduct,
} from './customProducts';
import { requireDb } from './firebase';

const LOCAL_LIBRARY_PREFIX = 'gfc-local-custom-products';
/** Stable Firestore document names reserved for future per-slot security rules. */
export const CUSTOM_PRODUCT_DOCUMENT_SLOTS = Array.from(
  { length: CUSTOM_PRODUCT_LIMITS.productsPerAccount },
  (_, index) => `product-${String(index + 1).padStart(2, '0')}`,
);

export interface CustomProductDraft {
  label: string;
  description?: string;
  categories: CustomCategoryTemplate[];
}

export interface CustomProductsRepository {
  list(userId: string): Promise<HostedCustomProduct[]>;
  subscribe(
    userId: string,
    onUpdate: (products: HostedCustomProduct[]) => void,
    onError?: (error: Error) => void,
  ): () => void;
  create(userId: string, draft: CustomProductDraft): Promise<HostedCustomProduct>;
  update(userId: string, product: HostedCustomProduct, draft: CustomProductDraft): Promise<HostedCustomProduct>;
  setStatus(userId: string, product: HostedCustomProduct, status: HostedCustomProductStatus): Promise<HostedCustomProduct>;
  delete(userId: string, product: HostedCustomProduct): Promise<void>;
}

/** Returns detached categories with array order normalized into the persisted order field. */
export const normalizeCustomProductCategories = (
  categories: CustomCategoryTemplate[],
): CustomCategoryTemplate[] => categories.map((category, order) => ({
  ...category,
  order,
  style: { ...category.style },
}));

/** Builds and validates one new hosted product before any repository writes occur. */
export const createHostedProduct = ({
  id,
  userId,
  draft,
  now = new Date().toISOString(),
}: {
  id: string;
  userId: string;
  draft: CustomProductDraft;
  now?: string;
}): HostedCustomProduct => {
  const product: HostedCustomProduct = {
    schemaVersion: CUSTOM_PRODUCTS_SCHEMA_VERSION,
    id: asCustomProductId(id),
    userId,
    label: draft.label.trim(),
    ...(draft.description?.trim() ? { description: draft.description.trim() } : {}),
    version: 1,
    status: 'active',
    categories: normalizeCustomProductCategories(draft.categories),
    createdAt: now,
    updatedAt: now,
  };

  if (!isHostedCustomProduct(product)) {
    throw new Error('Product name, description, or categories are invalid.');
  }
  return product;
};

/** Produces a validated new revision while keeping the product identity stable. */
const reviseProduct = (
  product: HostedCustomProduct,
  draft: CustomProductDraft,
  status = product.status,
): HostedCustomProduct => {
  const revised = reviseHostedCustomProduct(product, {
    label: draft.label.trim(),
    ...(draft.description?.trim() ? { description: draft.description.trim() } : { description: undefined }),
    categories: normalizeCustomProductCategories(draft.categories),
    status,
  });
  if (!draft.description?.trim()) delete revised.description;
  if (!isHostedCustomProduct(revised)) {
    throw new Error('Product name, description, or categories are invalid.');
  }
  return revised;
};

const sortProducts = (products: HostedCustomProduct[]) => [...products].sort((left, right) => {
  if (left.status !== right.status) return left.status === 'active' ? -1 : 1;
  return left.label.localeCompare(right.label);
});

const findOpenSlot = (occupiedSlots: Iterable<string>): string => {
  const occupied = new Set(occupiedSlots);
  const slot = CUSTOM_PRODUCT_DOCUMENT_SLOTS.find((candidate) => !occupied.has(candidate));
  if (!slot) throw new Error(`Custom product limit reached (${CUSTOM_PRODUCT_LIMITS.productsPerAccount}).`);
  return slot;
};

const localKey = (userId: string) => `${LOCAL_LIBRARY_PREFIX}:${userId}`;

const readLocalProducts = (userId: string): HostedCustomProduct[] => {
  try {
    const parsed = JSON.parse(localStorage.getItem(localKey(userId)) ?? '[]') as unknown;
    if (!Array.isArray(parsed)) return [];
    return sortProducts(parsed.filter(isHostedCustomProduct).filter((product) => product.userId === userId));
  } catch {
    return [];
  }
};

const writeLocalProducts = (userId: string, products: HostedCustomProduct[]): void => {
  localStorage.setItem(localKey(userId), JSON.stringify(sortProducts(products)));
};

const localSubscribers = new Map<string, Set<(products: HostedCustomProduct[]) => void>>();

const emitLocalProducts = (userId: string): void => {
  const products = readLocalProducts(userId);
  localSubscribers.get(userId)?.forEach((subscriber) => subscriber(products));
};

const assertExpectedVersion = (current: HostedCustomProduct, expected: HostedCustomProduct): void => {
  if (current.version !== expected.version) {
    throw new Error('This product changed in another session. Refresh and try again.');
  }
};

/** Development-only repository used by localhost UI and Playwright without touching hosted data. */
export const localCustomProductsRepository: CustomProductsRepository = {
  async list(userId) {
    return readLocalProducts(userId);
  },
  subscribe(userId, onUpdate) {
    const subscribers = localSubscribers.get(userId) ?? new Set();
    subscribers.add(onUpdate);
    localSubscribers.set(userId, subscribers);
    onUpdate(readLocalProducts(userId));
    const handleStorage = (event: StorageEvent) => {
      if (event.key === localKey(userId)) onUpdate(readLocalProducts(userId));
    };
    window.addEventListener('storage', handleStorage);
    return () => {
      window.removeEventListener('storage', handleStorage);
      subscribers.delete(onUpdate);
      if (subscribers.size === 0) localSubscribers.delete(userId);
    };
  },
  async create(userId, draft) {
    const products = readLocalProducts(userId);
    if (products.length >= CUSTOM_PRODUCT_LIMITS.productsPerAccount) {
      throw new Error(`Custom product limit reached (${CUSTOM_PRODUCT_LIMITS.productsPerAccount}).`);
    }
    const product = createHostedProduct({ id: uuidv4(), userId, draft });
    writeLocalProducts(userId, [...products, product]);
    emitLocalProducts(userId);
    return product;
  },
  async update(userId, product, draft) {
    const products = readLocalProducts(userId);
    const current = products.find((candidate) => candidate.id === product.id);
    if (!current) throw new Error('Custom product not found.');
    assertExpectedVersion(current, product);
    const revised = reviseProduct(current, draft);
    writeLocalProducts(userId, products.map((candidate) => candidate.id === revised.id ? revised : candidate));
    emitLocalProducts(userId);
    return revised;
  },
  async setStatus(userId, product, status) {
    const products = readLocalProducts(userId);
    const current = products.find((candidate) => candidate.id === product.id);
    if (!current) throw new Error('Custom product not found.');
    assertExpectedVersion(current, product);
    const revised = reviseProduct(current, current, status);
    writeLocalProducts(userId, products.map((candidate) => candidate.id === revised.id ? revised : candidate));
    emitLocalProducts(userId);
    return revised;
  },
  async delete(userId, product) {
    const products = readLocalProducts(userId);
    const current = products.find((candidate) => candidate.id === product.id);
    if (!current) return;
    assertExpectedVersion(current, product);
    writeLocalProducts(userId, products.filter((candidate) => candidate.id !== product.id));
    emitLocalProducts(userId);
  },
};

const collectionRef = (userId: string) => collection(requireDb(), 'users', userId, 'customProducts');
const productRef = (userId: string, slotId: string) => doc(requireDb(), 'users', userId, 'customProducts', slotId);

interface FirestoreProductRecord {
  slotId: string;
  product: HostedCustomProduct;
}

const readFirestoreRecords = async (userId: string): Promise<FirestoreProductRecord[]> => {
  const snapshot = await getDocs(collectionRef(userId));
  return snapshot.docs.flatMap((item) => {
    const value = item.data();
    return isHostedCustomProduct(value) && value.userId === userId
      ? [{ slotId: item.id, product: value }]
      : [];
  });
};

const findFirestoreRecord = async (userId: string, productId: string): Promise<FirestoreProductRecord> => {
  const record = (await readFirestoreRecords(userId)).find(({ product }) => product.id === productId);
  if (!record) throw new Error('Custom product not found.');
  return record;
};

/** Firestore repository used once hosted exposure is explicitly enabled on a non-local target. */
export const firestoreCustomProductsRepository: CustomProductsRepository = {
  async list(userId) {
    return sortProducts((await readFirestoreRecords(userId)).map(({ product }) => product));
  },
  subscribe(userId, onUpdate, onError) {
    return onSnapshot(
      collectionRef(userId),
      (snapshot) => {
        const products = snapshot.docs
          .map((item) => item.data())
          .filter(isHostedCustomProduct)
          .filter((product) => product.userId === userId);
        onUpdate(sortProducts(products));
      },
      (error) => onError?.(error),
    );
  },
  async create(userId, draft) {
    const existing = await readFirestoreRecords(userId);
    const slot = findOpenSlot(existing.map(({ slotId }) => slotId));
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
  async update(userId, product, draft) {
    const { slotId } = await findFirestoreRecord(userId, product.id);
    return runTransaction(requireDb(), async (transaction) => {
      const reference = productRef(userId, slotId);
      const current = (await transaction.get(reference)).data();
      if (!isHostedCustomProduct(current) || current.userId !== userId || current.id !== product.id) {
        throw new Error('Custom product not found.');
      }
      assertExpectedVersion(current, product);
      const revised = reviseProduct(current, draft);
      transaction.set(reference, revised);
      return revised;
    });
  },
  async setStatus(userId, product, status) {
    const { slotId } = await findFirestoreRecord(userId, product.id);
    return runTransaction(requireDb(), async (transaction) => {
      const reference = productRef(userId, slotId);
      const current = (await transaction.get(reference)).data();
      if (!isHostedCustomProduct(current) || current.userId !== userId || current.id !== product.id) {
        throw new Error('Custom product not found.');
      }
      assertExpectedVersion(current, product);
      const revised = reviseProduct(current, current, status);
      transaction.set(reference, revised);
      return revised;
    });
  },
  async delete(userId, product) {
    const { slotId } = await findFirestoreRecord(userId, product.id);
    await runTransaction(requireDb(), async (transaction) => {
      const reference = productRef(userId, slotId);
      const current = (await transaction.get(reference)).data();
      if (!isHostedCustomProduct(current) || current.userId !== userId || current.id !== product.id) {
        throw new Error('Custom product not found.');
      }
      assertExpectedVersion(current, product);
      transaction.delete(reference);
    });
  },
};

/** Keeps local-only review isolated from production Firebase while retaining the hosted adapter for rollout. */
export const getCustomProductsRepository = (): CustomProductsRepository =>
  getBuildTarget() === 'local' ? localCustomProductsRepository : firestoreCustomProductsRepository;
