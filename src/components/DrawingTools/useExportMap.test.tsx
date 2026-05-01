import { renderHook, act } from '@testing-library/react';
import type { RefObject } from 'react';
import { useExportMap } from './useExportMap';
import { exportMapAsImage, downloadDataUrl, getFormattedDate } from '../../utils/exportUtils';
import type { ForecastMapHandle } from '../Map/ForecastMap';

jest.mock('../../utils/exportUtils', () => ({
  exportMapAsImage: jest.fn(),
  downloadDataUrl: jest.fn(),
  getFormattedDate: jest.fn(() => '2026-04-22 15:49'),
}));

const mockExportMapAsImage = exportMapAsImage as jest.MockedFunction<typeof exportMapAsImage>;
const mockDownloadDataUrl = downloadDataUrl as jest.MockedFunction<typeof downloadDataUrl>;
const mockGetFormattedDate = getFormattedDate as jest.MockedFunction<typeof getFormattedDate>;
type MockMapHandle = {
  getEngine: () => 'leaflet' | 'openlayers';
  getMap: () => unknown;
  getView: () => { center: [number, number]; zoom: number };
};

type RenderProps = {
  disabled: boolean;
  current: MockMapHandle | null;
};

const createMapRef = (current: MockMapHandle | null) => ({ current } as RefObject<ForecastMapHandle | null>);

describe('useExportMap', () => {
  const outlooks = { tornado: new Map([['1', []]]) } as never;
  const addToast = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetFormattedDate.mockReturnValue('2026-04-22 15:49');
  });

  test('rejects disabled and invalid export preconditions', () => {
    const { result, rerender } = renderHook(
      ({ disabled, current }: RenderProps) =>
        useExportMap({
          mapRef: createMapRef(current),
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
        getMap: () => null,
        getView: () => ({ center: [0, 0], zoom: 1 }),
      },
    });
    act(() => result.current.initiateExport());
    expect(addToast).toHaveBeenCalledWith('Map not fully loaded. Please try again.', 'error');

    rerender({
      disabled: false,
      current: {
        getEngine: () => 'leaflet',
        getMap: () => null,
        getView: () => ({ center: [0, 0], zoom: 1 }),
      },
    });
    act(() => result.current.initiateExport());
    expect(addToast).toHaveBeenCalledWith('Map not fully loaded. Please try again.', 'error');
  });

  test('exports successfully and closes the modal', async () => {
    const map = { id: 'map-1' };
    const current: MockMapHandle = {
      getEngine: () => 'leaflet',
      getMap: () => map,
      getView: () => ({ center: [0, 0], zoom: 1 }),
    };

    mockExportMapAsImage.mockResolvedValue('data:image/jpeg;base64,abc');

    const { result } = renderHook(() =>
      useExportMap({
        mapRef: createMapRef(current),
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
    const current: MockMapHandle = {
      getEngine: () => 'leaflet',
      getMap: () => ({ id: 'map-1' }),
      getView: () => ({ center: [0, 0], zoom: 1 }),
    };

    mockExportMapAsImage.mockRejectedValue(new Error('boom'));

    const { result } = renderHook(() =>
      useExportMap({
        mapRef: createMapRef(current),
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
    const current: MockMapHandle = {
      getEngine: () => {
        throw new Error('engine unavailable');
      },
      getMap: () => ({ id: 'map-1' }),
      getView: () => ({ center: [0, 0], zoom: 1 }),
    };

    const { result } = renderHook(() =>
      useExportMap({
        mapRef: createMapRef(current),
        outlooks,
        isExportDisabled: false,
        addToast,
      })
    );

    act(() => result.current.initiateExport());

    expect(result.current.isModalOpen).toBe(true);
  });
});
