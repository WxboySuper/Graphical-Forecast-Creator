// src/lib/customProductHandoff.test.ts — GFC-WEB-Y iOS private mode hardening
import {
  CUSTOM_PRODUCT_HANDOFF_KEY,
  clearCustomProductForecastHandoff,
  consumeCustomProductForecastHandoff,
  restoreCustomProductForecastHandoff,
} from './customProductHandoff';
import { createHostedProduct } from './customProductsRepository';
import type { CustomCategoryId } from '../types/customProducts';
import { CUSTOM_PRODUCTS_SCHEMA_VERSION } from '../types/customProducts';

const category = (id: string, order: number) => ({
  id: id as CustomCategoryId,
  label: id,
  order,
  style: { fillColor: '#ff0000', fillOpacity: 0.5, strokeColor: '#990000', strokeOpacity: 1, strokeWidth: 2, hatch: 'none' as const },
});

const draft = () => ({
  label: 'Winter hazards',
  description: 'Reusable desk template',
  categories: [category('Moderate', 0), category('High', 1)],
});

const validLayer = () => ({
  schemaVersion: CUSTOM_PRODUCTS_SCHEMA_VERSION,
  id: 'layer-1',
  label: 'Test',
  order: 0,
  categories: [category('Moderate', 0)],
  features: [],
  productSnapshot: {
    schemaVersion: CUSTOM_PRODUCTS_SCHEMA_VERSION,
    sourceProductId: 'product-01',
    sourceProductVersion: 1,
    label: 'Test',
    categories: [category('Moderate', 0)],
    capturedAt: '2026-07-17T12:00:00.000Z',
  },
  createdAt: '2026-07-17T12:00:00.000Z',
  updatedAt: '2026-07-17T12:00:00.000Z',
});

describe('customProductHandoff — iOS private mode hardening (GFC-WEB-Y)', () => {
  beforeEach(() => { localStorage.clear(); sessionStorage.clear(); jest.restoreAllMocks(); });

  test('consume returns null when getItem throws SecurityError', () => {
    sessionStorage.setItem(CUSTOM_PRODUCT_HANDOFF_KEY, JSON.stringify({ bogus: true }));
    jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new DOMException('The operation is insecure.', 'SecurityError'); });
    expect(consumeCustomProductForecastHandoff(true)).toBeNull();
    expect(() => consumeCustomProductForecastHandoff(true)).not.toThrow();
  });

  test('consume returns null when getItem throws DOMException code 18 (legacy SECURITY_ERR)', () => {
    const err = new DOMException('Blocked', 'SecurityError');
    Object.defineProperty(err, 'code', { value: 18 });
    jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw err; });
    expect(consumeCustomProductForecastHandoff(true)).toBeNull();
  });

  test('consume returns null when removeItem SecurityError prevents consume-once semantics', () => {
    sessionStorage.setItem(CUSTOM_PRODUCT_HANDOFF_KEY, JSON.stringify(validLayer()));
    jest.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => { throw new DOMException('The operation is insecure.', 'SecurityError'); });
    expect(consumeCustomProductForecastHandoff(true)).toBeNull();
    expect(consumeCustomProductForecastHandoff(true)).toBeNull();
  });

  test('restore does not throw when setItem throws SecurityError', () => {
    jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('The operation is insecure.', 'SecurityError'); });
    const product = createHostedProduct({ id: 'product-01', userId: 'user-1', draft: draft(), now: '2026-07-17T12:00:00.000Z' });
    const layer = {
      schemaVersion: CUSTOM_PRODUCTS_SCHEMA_VERSION,
      id: 'layer-restore-test' as never,
      label: 'Restore test',
      order: 0,
      categories: [category('Moderate', 0)],
      features: [],
      productSnapshot: { schemaVersion: CUSTOM_PRODUCTS_SCHEMA_VERSION, sourceProductId: product.id, sourceProductVersion: 1, label: 'Restore test', categories: [category('Moderate', 0)], capturedAt: '2026-07-17T12:00:00.000Z' },
      createdAt: '2026-07-17T12:00:00.000Z',
      updatedAt: '2026-07-17T12:00:00.000Z',
    } as never;
    expect(() => restoreCustomProductForecastHandoff(layer as never)).not.toThrow();
  });

  test('clear does not throw when getItem throws SecurityError', () => {
    jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new DOMException('The operation is insecure.', 'SecurityError'); });
    expect(() => clearCustomProductForecastHandoff('product-01' as never)).not.toThrow();
  });

  test('clear does not throw when removeItem throws QuotaExceededError variant', () => {
    sessionStorage.setItem(CUSTOM_PRODUCT_HANDOFF_KEY, JSON.stringify(validLayer()));
    jest.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => { throw new DOMException('Quota exceeded', 'QuotaExceededError'); });
    sessionStorage.setItem(CUSTOM_PRODUCT_HANDOFF_KEY, '{bad json');
    jest.spyOn(Storage.prototype, 'getItem').mockReturnValue('{bad json');
    expect(() => clearCustomProductForecastHandoff('product-01' as never)).not.toThrow();
  });

  test('hook path: Forecast still renders when storage is blocked', async () => {
    jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new DOMException('The operation is insecure.', 'SecurityError'); });
    expect(consumeCustomProductForecastHandoff(false)).toBeNull();
  });
});
