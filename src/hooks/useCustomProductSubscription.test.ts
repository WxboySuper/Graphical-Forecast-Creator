import { act, renderHook, waitFor } from '@testing-library/react';
import type { CustomProductsRepository } from '../lib/customProductsRepository';
import type { HostedCustomProduct } from '../types/customProducts';
import { useCustomProductSubscription } from './useCustomProductSubscription';

const makeRepository = (): CustomProductsRepository & {
  emitUpdate: (products: HostedCustomProduct[]) => void;
  emitError: (error: Error) => void;
} => {
  let onUpdate: ((products: HostedCustomProduct[]) => void) | undefined;
  let onError: ((error: Error) => void) | undefined;
  return {
    list: jest.fn(),
    subscribe: jest.fn((
      _userId: string,
      update: (products: HostedCustomProduct[]) => void,
      error?: (nextError: Error) => void,
    ) => {
      onUpdate = update;
      onError = error;
      return jest.fn();
    }),
    create: jest.fn(),
    update: jest.fn(),
    setStatus: jest.fn(),
    delete: jest.fn(),
    emitUpdate: (products) => onUpdate?.(products),
    emitError: (error) => onError?.(error),
  };
};

describe('useCustomProductSubscription', () => {
  test('clears load errors after a successful snapshot', async () => {
    const repository = makeRepository();
    const { result } = renderHook(() => useCustomProductSubscription(repository, 'user-1'));

    act(() => {
      repository.emitError(new Error('Failed to load reusable products.'));
    });
    await waitFor(() => expect(result.current.state.loadError).toBe('Failed to load reusable products.'));

    act(() => {
      repository.emitUpdate([]);
    });
    await waitFor(() => expect(result.current.state.loadError).toBeNull());
  });
});
