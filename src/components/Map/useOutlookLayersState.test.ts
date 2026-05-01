import { act, renderHook } from '@testing-library/react';
import { useDispatch } from 'react-redux';
import { useOutlookLayersState } from './useOutlookLayersState';

jest.mock('react-redux', () => ({
  useDispatch: jest.fn(),
}));

const mockUseDispatch = useDispatch as jest.MockedFunction<typeof useDispatch>;

describe('useOutlookLayersState', () => {
  const dispatch = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseDispatch.mockReturnValue(dispatch);
  });

  it('opens, confirms, and clears a delete request', () => {
    const { result } = renderHook(() => useOutlookLayersState());

    act(() => {
      result.current.handleRequestDelete('wind', '15%', 'feature-1');
    });

    expect(result.current.deleteModal).toEqual({
      isOpen: true,
      outlookType: 'wind',
      probability: '15%',
      featureId: 'feature-1',
    });

    act(() => {
      result.current.handleConfirmDelete();
    });

    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({
      type: 'forecast/removeFeature',
      payload: {
        outlookType: 'wind',
        probability: '15%',
        featureId: 'feature-1',
      },
    }));
    expect(result.current.deleteModal).toEqual({ isOpen: false });
  });

  it('cancels or confirms empty modal state without dispatching', () => {
    const { result } = renderHook(() => useOutlookLayersState());

    act(() => {
      result.current.handleConfirmDelete();
    });
    expect(dispatch).not.toHaveBeenCalled();

    act(() => {
      result.current.handleRequestDelete('hail', '5%', 'feature-2');
      result.current.handleCancelDelete();
    });
    expect(result.current.deleteModal).toEqual({ isOpen: false });
  });
});
