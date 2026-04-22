import { renderHook, act } from '@testing-library/react';
import { useExportMap } from './useExportMap';
import { exportMapAsImage, downloadDataUrl, getFormattedDate } from '../../utils/exportUtils';

jest.mock('../../utils/exportUtils', () => ({
  exportMapAsImage: jest.fn(),
  downloadDataUrl: jest.fn(),
  getFormattedDate: jest.fn(() => '2026-04-22 15:49'),
}));

const mockExportMapAsImage = exportMapAsImage as jest.MockedFunction<typeof exportMapAsImage>;
const mockDownloadDataUrl = downloadDataUrl as jest.MockedFunction<typeof downloadDataUrl>;
const mockGetFormattedDate = getFormattedDate as jest.MockedFunction<typeof getFormattedDate>;

describe('useExportMap', () => {
  const outlooks = { tornado: new Map([['1', []]]) } as never;
  const addToast = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetFormattedDate.mockReturnValue('2026-04-22 15:49');
  });

  test('rejects disabled and invalid export preconditions', () => {
    const mapRef = { current: null };

    const { result, rerender } = renderHook(
      ({ disabled, current }) =>
        useExportMap({
          mapRef: { current } as React.RefObject<any>,
          outlooks,
          isExportDisabled: disabled,
          addToast,
        }),
      { initialProps: { disabled: true, current: null } }
    );

    act(() => result.current.initiateExport());
    expect(addToast).toHaveBeenCalledWith(expect.stringContaining('currently unavailable'), 'warning');
    expect(result.current.isModalOpen).toBe(false);

    rerender({ disabled: false, current: null });
    act(() => result.current.initiateExport());
    expect(addToast).toHaveBeenCalledWith('Map reference not available. Cannot export.', 'error');

    rerender({
      disabled: false,
      current: {
        getEngine: () => 'openlayers',
        getMap: () => ({}),
      },
    });
    act(() => result.current.initiateExport());
    expect(addToast).toHaveBeenCalledWith(
      'Map export is only available for Leaflet maps right now. The current OpenLayers map cannot be exported.',
      'warning'
    );

    rerender({
      disabled: false,
      current: {
        getEngine: () => 'leaflet',
        getMap: () => null,
      },
    });
    act(() => result.current.initiateExport());
    expect(addToast).toHaveBeenCalledWith('Map not fully loaded. Please try again.', 'error');
  });

  test('exports successfully and closes the modal', async () => {
    const map = { id: 'map-1' };
    const current = {
      getEngine: () => 'leaflet',
      getMap: () => map,
    };

    mockExportMapAsImage.mockResolvedValue('data:image/jpeg;base64,abc');

    const { result } = renderHook(() =>
      useExportMap({
        mapRef: { current } as React.RefObject<any>,
        outlooks,
        isExportDisabled: false,
        addToast,
      })
    );

    act(() => result.current.initiateExport());
    expect(result.current.isModalOpen).toBe(true);

    await act(async () => {
      await result.current.confirmExport('Storm Day');
    });

    expect(mockExportMapAsImage).toHaveBeenCalledWith(
      map,
      outlooks,
      expect.objectContaining({
        title: 'Storm Day',
        format: 'jpeg',
        quality: 0.92,
        includeLegendAndStatus: true,
      })
    );
    expect(mockDownloadDataUrl).toHaveBeenCalledWith('data:image/jpeg;base64,abc', 'forecast-outlook-2026-04-22 15:49.jpg');
    expect(addToast).toHaveBeenCalledWith('Forecast exported successfully!', 'success');
    expect(result.current.isExporting).toBe(false);
    expect(result.current.isModalOpen).toBe(false);

    act(() => result.current.initiateExport());
    act(() => result.current.cancelExport());
    expect(result.current.isModalOpen).toBe(false);
  });

  test('surfaces export failures', async () => {
    const current = {
      getEngine: () => 'leaflet',
      getMap: () => ({ id: 'map-1' }),
    };

    mockExportMapAsImage.mockRejectedValue(new Error('boom'));

    const { result } = renderHook(() =>
      useExportMap({
        mapRef: { current } as React.RefObject<any>,
        outlooks,
        isExportDisabled: false,
        addToast,
      })
    );

    await act(async () => {
      await result.current.confirmExport('Broken export');
    });

    expect(addToast).toHaveBeenCalledWith('Failed to export the map. Please try again.', 'error');
  });

  test('treats engine lookup errors as unsupported exports', () => {
    const current = {
      getEngine: () => {
        throw new Error('engine unavailable');
      },
      getMap: () => ({ id: 'map-1' }),
    };

    const { result } = renderHook(() =>
      useExportMap({
        mapRef: { current } as React.RefObject<any>,
        outlooks,
        isExportDisabled: false,
        addToast,
      })
    );

    act(() => result.current.initiateExport());

    expect(addToast).toHaveBeenCalledWith(
      'Map export is only available for Leaflet maps right now. The current OpenLayers map cannot be exported.',
      'warning'
    );
    expect(result.current.isModalOpen).toBe(false);
  });
});
