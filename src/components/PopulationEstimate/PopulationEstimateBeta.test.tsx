/**
 * Population-estimate beta tests. Verify map-feature selection, WorldPop lookup,
 * loading, and result presentation in the experimental estimate panel.
 */
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import forecastReducer, { addFeature, setActiveOutlookType } from '../../store/forecastSlice';
import overlaysReducer from '../../store/overlaysSlice';
import { estimatePopulation } from '../../utils/worldpop';
import { loadPlaces } from '../../utils/citiesAffected';
import PopulationEstimateBeta from './PopulationEstimateBeta';

jest.mock('../../utils/worldpop', () => ({
  ...jest.requireActual('../../utils/worldpop'),
  estimatePopulation: jest.fn(),
}));

jest.mock('../../utils/citiesAffected', () => ({
  ...jest.requireActual('../../utils/citiesAffected'),
  loadPlaces: jest.fn(),
}));

const loadPlacesMock = loadPlaces as jest.MockedFunction<typeof loadPlaces>;
const estimatePopulationMock = estimatePopulation as jest.MockedFunction<typeof estimatePopulation>;

const createStore = () => configureStore({
  reducer: { forecast: forecastReducer, overlays: overlaysReducer },
  middleware: (getDefaultMiddleware) => getDefaultMiddleware({ serializableCheck: false, immutableCheck: false }),
});

const renderEstimate = (store = createStore()) => render(
  <Provider store={store}>
    <PopulationEstimateBeta />
  </Provider>,
);

const tornadoFeature = {
  type: 'Feature' as const,
  id: 'tornado-2',
  geometry: {
    type: 'Polygon' as const,
    coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]],
  },
  properties: { outlookType: 'tornado' as const, probability: '2%', isSignificant: false },
};

describe('PopulationEstimateBeta', () => {
  beforeEach(() => {
    estimatePopulationMock.mockReset();
    loadPlacesMock.mockReset();
    loadPlacesMock.mockResolvedValue([]);
  });

  test('keeps the captured context label when the forecast context changes during polling', async () => {
    const user = userEvent.setup();
    const store = createStore();
    store.dispatch(addFeature({ feature: tornadoFeature }));
    estimatePopulationMock.mockReturnValue(new Promise(() => undefined));

    renderEstimate(store);
    await user.click(screen.getByRole('button', { name: /Estimate affected population/i }));
    expect(await screen.findByText('Day 1 Tornado polygons, merged before the request.')).toBeInTheDocument();

    act(() => { store.dispatch(setActiveOutlookType('wind')); });

    expect(await screen.findByRole('alert')).toHaveTextContent('Estimate cancelled because the forecast day or outlook changed.');
    expect(screen.getByText('Day 1 Tornado polygons, merged before the request.')).toBeInTheDocument();
    expect(screen.queryByText('Day 1 Wind polygons, merged before the request.')).not.toBeInTheDocument();
  });

  test('lists cities inside the outlook with the population result', async () => {
    const user = userEvent.setup();
    const store = createStore();
    store.dispatch(addFeature({ feature: tornadoFeature }));
    estimatePopulationMock.mockResolvedValue({ totalPopulation: 1234, dataYear: 2025, resolution: '100m' });
    loadPlacesMock.mockResolvedValue([
      { name: 'Insideville', state: 'XX', lon: 0.5, lat: 0.5, population: 9000 },
      { name: 'Faraway', state: 'XX', lon: 50, lat: 50, population: 90000 },
    ]);

    renderEstimate(store);
    await user.click(screen.getByRole('button', { name: /Estimate affected population/i }));

    expect(await screen.findByText('Insideville, XX')).toBeInTheDocument();
    expect(screen.getByText('Cities inside the outlook (1)')).toBeInTheDocument();
    expect(screen.queryByText('Faraway, XX')).not.toBeInTheDocument();
  });

  test('allows dismissing the dialog while loading and aborts the request', async () => {
    const user = userEvent.setup();
    const store = createStore();
    store.dispatch(addFeature({ feature: tornadoFeature }));
    let capturedSignal: AbortSignal | undefined;
    estimatePopulationMock.mockImplementation((_geometry, options) => {
      capturedSignal = options?.signal;
      return new Promise(() => undefined);
    });

    renderEstimate(store);
    await user.click(screen.getByRole('button', { name: /Estimate affected population/i }));
    expect(await screen.findByText('WorldPop is calculating the population inside your outlook...')).toBeInTheDocument();

    const cancelButton = await screen.findByRole('button', { name: /Cancel request/i });
    await user.click(cancelButton);

    expect(screen.queryByText('WorldPop is calculating the population inside your outlook...')).not.toBeInTheDocument();
    expect(capturedSignal?.aborted).toBe(true);
    expect(screen.getByRole('button', { name: /Estimate affected population/i })).toBeEnabled();
  });

  test('closes with Escape while loading and aborts the request', async () => {
    const user = userEvent.setup();
    const store = createStore();
    store.dispatch(addFeature({ feature: tornadoFeature }));
    let capturedSignal: AbortSignal | undefined;
    estimatePopulationMock.mockImplementation((_geometry, options) => {
      capturedSignal = options?.signal;
      return new Promise(() => undefined);
    });

    renderEstimate(store);
    const estimateButton = screen.getByRole('button', { name: /Estimate affected population/i });
    await user.click(estimateButton);
    expect(await screen.findByText('WorldPop is calculating the population inside your outlook...')).toBeInTheDocument();

    await user.keyboard('{Escape}');

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(capturedSignal?.aborted).toBe(true);
    expect(estimateButton).toBeEnabled();
  });
});
