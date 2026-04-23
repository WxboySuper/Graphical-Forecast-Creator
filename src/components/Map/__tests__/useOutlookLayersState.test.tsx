import { useOutlookLayersState } from '../useOutlookLayersState';
import { renderHook, act } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import forecastReducer from '../../../store/forecastSlice';

const createMockStore = () =>
  configureStore({
    reducer: {
      forecast: forecastReducer,
    },
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware({ serializableCheck: false, immutableCheck: false }),
  });

describe('useOutlookLayersState', () => {
  it('returns initial closed state', () => {
    const { result } = renderHook(() => useOutlookLayersState(), {
      wrapper: ({ children }) => (
        <Provider store={createMockStore()}>{children}</Provider>
      ),
    });

    expect(result.current.deleteModal.isOpen).toBe(false);
    expect(result.current.deleteModal.outlookType).toBeUndefined();
    expect(result.current.deleteModal.probability).toBeUndefined();
    expect(result.current.deleteModal.featureId).toBeUndefined();
  });

  it('opens delete modal with correct data', () => {
    const { result } = renderHook(() => useOutlookLayersState(), {
      wrapper: ({ children }) => (
        <Provider store={createMockStore()}>{children}</Provider>
      ),
    });

    act(() => {
      result.current.handleRequestDelete('tornado', '15%', 'feat-123');
    });

    expect(result.current.deleteModal.isOpen).toBe(true);
    expect(result.current.deleteModal.outlookType).toBe('tornado');
    expect(result.current.deleteModal.probability).toBe('15%');
    expect(result.current.deleteModal.featureId).toBe('feat-123');
  });

  it('closes modal on cancel', () => {
    const { result } = renderHook(() => useOutlookLayersState(), {
      wrapper: ({ children }) => (
        <Provider store={createMockStore()}>{children}</Provider>
      ),
    });

    act(() => {
      result.current.handleRequestDelete('wind', '30%', 'feat-456');
    });

    expect(result.current.deleteModal.isOpen).toBe(true);

    act(() => {
      result.current.handleCancelDelete();
    });

    expect(result.current.deleteModal.isOpen).toBe(false);
  });

  it('opens and closes modal for hail outlook', () => {
    const { result } = renderHook(() => useOutlookLayersState(), {
      wrapper: ({ children }) => (
        <Provider store={createMockStore()}>{children}</Provider>
      ),
    });

    act(() => {
      result.current.handleRequestDelete('hail', '15%', 'feat-789');
    });

    expect(result.current.deleteModal.outlookType).toBe('hail');

    act(() => {
      result.current.handleCancelDelete();
    });

    expect(result.current.deleteModal.isOpen).toBe(false);
  });
});
