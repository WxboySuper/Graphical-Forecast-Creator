import { forwardRef as mockForwardRef } from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import VerificationMode from './VerificationMode';
import verificationReducer from '../../store/verificationSlice';
import stormReportsReducer from '../../store/stormReportsSlice';
import type { StormReport } from '../../types/stormReports';

const mockAddToast = jest.fn();

jest.mock('../../auth/AuthProvider', () => ({
  useAuth: jest.fn(),
}));

jest.mock('../Layout/AppLayout', () => ({
  useAppLayout: jest.fn(() => ({ addToast: mockAddToast })),
}));

jest.mock('../../utils/productMetrics', () => ({
  queueProductMetric: jest.fn(),
}));

jest.mock('../../utils/fileUtils', () => ({
  readForecastImportFile: jest.fn(),
  validateForecastDataReason: jest.fn(),
  deserializeForecast: jest.fn(),
}));

jest.mock('../../utils/stormReportParser', () => ({
  fetchStormReports: jest.fn(),
  fetchTodayStormReports: jest.fn(),
  fetchYesterdayStormReports: jest.fn(),
  formatReportDate: jest.fn((date: Date) =>
    `${String(date.getFullYear()).slice(-2)}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`
  ),
}));

jest.mock('../../utils/verificationUtils', () => ({
  analyzeVerification: jest.fn(),
  formatVerificationSummary: jest.fn(() => 'Verification summary'),
}));

jest.mock('../Map/VerificationMap', () => ({
  __esModule: true,
  default: mockForwardRef(() => <div data-testid="verification-map" />),
}));

const mockUseAuth = jest.requireMock('../../auth/AuthProvider').useAuth as jest.Mock;
const mockReadForecastImportFile = jest.requireMock('../../utils/fileUtils').readForecastImportFile as jest.Mock;
const mockValidateForecastDataReason = jest.requireMock('../../utils/fileUtils').validateForecastDataReason as jest.Mock;
const mockDeserializeForecast = jest.requireMock('../../utils/fileUtils').deserializeForecast as jest.Mock;
const mockFetchStormReports = jest.requireMock('../../utils/stormReportParser').fetchStormReports as jest.Mock;
const mockFetchTodayStormReports = jest.requireMock('../../utils/stormReportParser').fetchTodayStormReports as jest.Mock;
const mockFetchYesterdayStormReports = jest.requireMock('../../utils/stormReportParser').fetchYesterdayStormReports as jest.Mock;

const renderWithStore = () => {
  const store = configureStore({
    reducer: { verification: verificationReducer, stormReports: stormReportsReducer },
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware({ serializableCheck: false, immutableCheck: false }),
  });

  const view = render(
    <Provider store={store}>
      <VerificationMode />
    </Provider>
  );

  return { ...view, store };
};

describe('VerificationMode with in-flight storm reports', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseAuth.mockReturnValue({ user: { uid: 'user-1' }, status: 'signed_in' });
    mockValidateForecastDataReason.mockReturnValue(null);
    mockReadForecastImportFile.mockResolvedValue({ forecastCycle: {}, outlooks: {} });
    mockDeserializeForecast.mockReturnValue({
      currentDay: 1,
      cycleDate: '2026-04-20',
      days: {
        1: {
          day: 1,
          data: { categorical: new Map([['cat', []]]) },
          metadata: {
            issueDate: '2026-04-20T06:00:00Z',
            validDate: '2026-04-20T06:00:00Z',
            issuanceTime: '0600',
            createdAt: '2026-04-20T06:00:00Z',
            lastModified: '2026-04-20T06:00:00Z',
            lowProbabilityOutlooks: [],
          },
        },
      },
    });
    mockFetchStormReports.mockReset();
    mockFetchTodayStormReports.mockReset();
    mockFetchYesterdayStormReports.mockReset();
  });

  test('does not restore reports when a pending request finishes after clearing the forecast', async () => {
    const user = userEvent.setup();
    let resolveReports!: (reports: StormReport[]) => void;
    const pendingReports = new Promise<StormReport[]>((resolve) => {
      resolveReports = resolve;
    });
    mockFetchStormReports.mockReturnValue(pendingReports);
    mockFetchTodayStormReports.mockReturnValue(pendingReports);
    mockFetchYesterdayStormReports.mockReturnValue(pendingReports);

    const { store } = renderWithStore();
    const fileInput = screen.getByLabelText(/Choose Forecast File/i) as HTMLInputElement;
    await user.upload(fileInput, new File(['{}'], 'forecast.json', { type: 'application/json' }));
    expect(await screen.findByText(/Forecast Loaded/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Load Reports/i }));
    await waitFor(() => expect(
      mockFetchStormReports.mock.calls.length +
      mockFetchTodayStormReports.mock.calls.length +
      mockFetchYesterdayStormReports.mock.calls.length
    ).toBe(1));
    expect(store.getState().stormReports.loading).toBe(true);

    await user.click(screen.getByRole('button', { name: /Load Different Forecast/i }));
    await user.click(screen.getByRole('button', { name: /Clear/i }));
    expect(await screen.findByText(/Choose Forecast File/i)).toBeInTheDocument();
    expect(store.getState().stormReports.loading).toBe(false);

    await act(async () => {
      resolveReports([{
        id: 'late-report',
        type: 'tornado',
        latitude: 35,
        longitude: -97,
        time: '2026-04-20T00:00:00Z',
        location: 'Norman',
        county: 'Cleveland',
        state: 'OK',
      }]);
      await pendingReports;
    });

    expect(store.getState().stormReports.reports).toEqual([]);
    expect(store.getState().stormReports.date).toBeNull();
    expect(store.getState().stormReports.loading).toBe(false);
  });

  test('keeps an in-flight report load when switching between sidebar tabs', async () => {
    const user = userEvent.setup();
    let resolveReports!: (reports: StormReport[]) => void;
    const pendingReports = new Promise<StormReport[]>((resolve) => {
      resolveReports = resolve;
    });
    mockFetchStormReports.mockReturnValue(pendingReports);
    mockFetchTodayStormReports.mockReturnValue(pendingReports);
    mockFetchYesterdayStormReports.mockReturnValue(pendingReports);

    const { store } = renderWithStore();
    const fileInput = screen.getByLabelText(/Choose Forecast File/i) as HTMLInputElement;
    await user.upload(fileInput, new File(['{}'], 'forecast.json', { type: 'application/json' }));
    expect(await screen.findByText(/Forecast Loaded/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Load Reports/i }));
    await waitFor(() => expect(
      mockFetchStormReports.mock.calls.length +
      mockFetchTodayStormReports.mock.calls.length +
      mockFetchYesterdayStormReports.mock.calls.length
    ).toBe(1));

    await user.click(screen.getByRole('button', { name: /Analysis/i }));
    expect(store.getState().stormReports.loading).toBe(true);
    await user.click(screen.getByRole('button', { name: /Load Data/i }));

    await act(async () => {
      resolveReports([{
        id: 'tab-switch-report',
        type: 'tornado',
        latitude: 35,
        longitude: -97,
        time: '2026-04-20T00:00:00Z',
        location: 'Norman',
        county: 'Cleveland',
        state: 'OK',
      }]);
      await pendingReports;
    });

    expect(store.getState().stormReports.reports.map(({ id }) => id)).toEqual(['tab-switch-report']);
    expect(store.getState().stormReports.date).not.toBeNull();
    expect(store.getState().stormReports.loading).toBe(false);
  });
});
