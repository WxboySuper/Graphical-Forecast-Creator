import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import VerificationPanel from './VerificationPanel';
import stormReportsReducer from '../../store/stormReportsSlice';
import verificationReducer from '../../store/verificationSlice';
import forecastReducer from '../../store/forecastSlice';
import featureFlagsReducer from '../../store/featureFlagsSlice';
import overlaysReducer from '../../store/overlaysSlice';
import appModeReducer from '../../store/appModeSlice';
import themeReducer from '../../store/themeSlice';

jest.mock('uuid', () => ({
  v4: () => 'test-uuid',
}));

jest.mock('../../utils/verificationUtils', () => ({
  analyzeVerification: jest.fn(() => ({})),
  formatVerificationSummary: jest.fn(() => 'summary'),
}));

jest.mock('../../store/verificationSlice', () => ({
  selectVerificationOutlooksForDay: jest.fn(() => ({})),
}));

const createStore = () => configureStore({
  reducer: {
    forecast: forecastReducer,
    featureFlags: featureFlagsReducer,
    overlays: overlaysReducer,
    stormReports: stormReportsReducer,
    appMode: appModeReducer,
    theme: themeReducer,
    verification: verificationReducer,
  },
  middleware: (getDefaultMiddleware) => getDefaultMiddleware({
    serializableCheck: false,
    immutableCheck: false,
  }),
});

describe('VerificationPanel storm report loading', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
  });

  test('loads today.csv instead of blocking the current date', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      text: jest.fn().mockResolvedValue([
        'Raw Tornado LSR',
        'Time,LAT,LON,EF_Scale,Location,County,State,Remarks',
        '1200,35.00,-97.00,EF1,Norman,Cleveland,OK,Test remark',
      ].join('\n')),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const store = createStore();

    render(
      <Provider store={store}>
        <VerificationPanel activeOutlookType="categorical" selectedDay={1} />
      </Provider>
    );

    fireEvent.click(screen.getByRole('button', { name: /load reports/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('https://www.spc.noaa.gov/climo/reports/today.csv'));
    expect(await screen.findByText(/Loaded storm reports from SPC today\.csv/)).toBeInTheDocument();
  });

  test('loads yesterday.csv for the prior UTC date', async () => {
    const today = new Date();
    const yesterday = new Date(Date.UTC(
      today.getUTCFullYear(),
      today.getUTCMonth(),
      today.getUTCDate() - 1
    ));
    const yesterdayDate = yesterday.toISOString().slice(0, 10);

    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      text: jest.fn().mockResolvedValue([
        'Raw Wind/Gust LSR',
        'Time,LAT,LON,Speed(MPH),Location,County,State,Remarks',
        '1300,36.00,-98.00,60,Enid,Garfield,OK,Wind remark',
      ].join('\n')),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const store = createStore();

    render(
      <Provider store={store}>
        <VerificationPanel activeOutlookType="categorical" selectedDay={1} />
      </Provider>
    );

    fireEvent.change(screen.getByLabelText(/Select Date/i), { target: { value: yesterdayDate } });
    fireEvent.click(screen.getByRole('button', { name: /load reports/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('https://www.spc.noaa.gov/climo/reports/yesterday.csv'));
    expect(await screen.findByText(/Loaded storm reports from SPC yesterday\.csv/)).toBeInTheDocument();
  });

  test('shows the existing empty-state message when no reports are returned', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      text: jest.fn().mockResolvedValue(''),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const store = createStore();

    render(
      <Provider store={store}>
        <VerificationPanel activeOutlookType="categorical" selectedDay={1} />
      </Provider>
    );

    const archiveDate = '2026-03-16';
    fireEvent.change(screen.getByLabelText(/Select Date/i), { target: { value: archiveDate } });
    fireEvent.click(screen.getByRole('button', { name: /load reports/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('https://www.spc.noaa.gov/climo/reports/260316_rpts_raw.csv'));
    expect(await screen.findByText(/No storm reports found for this date\./)).toBeInTheDocument();
  });
});
