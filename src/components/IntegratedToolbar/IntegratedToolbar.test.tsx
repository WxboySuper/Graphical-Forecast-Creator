import React, { useRef } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { IntegratedToolbar } from './IntegratedToolbar';
import { useForecastWorkspaceController } from '../ForecastWorkspace/useForecastWorkspaceController';
import forecastReducer, { addFeature } from '../../store/forecastSlice';
import featureFlagsReducer from '../../store/featureFlagsSlice';
import overlaysReducer from '../../store/overlaysSlice';
import type { ForecastMapHandle } from '../Map/ForecastMap';

jest.mock('../CycleManager/CycleHistoryModal', () => () => <div>CycleHistoryModal Mock</div>);
jest.mock('../CycleManager/CopyFromPreviousModal', () => () => <div>CopyFromPreviousModal Mock</div>);
jest.mock('../DrawingTools/ExportModal', () => () => <div>ExportModal Mock</div>);
jest.mock('../OutlookPanel/useOutlookPanelLogic', () => () => ({
  activeOutlookType: 'tornado',
  activeProbability: '2%',
  isSignificant: false,
  significantThreatsEnabled: true,
  probabilities: ['2%', '5%'],
  probabilityHandlers: { '2%': jest.fn(), '5%': jest.fn() },
  outlookTypeHandlers: {
    tornado: jest.fn(),
    wind: jest.fn(),
    hail: jest.fn(),
    categorical: jest.fn(),
    totalSevere: jest.fn(),
    'day4-8': jest.fn(),
  },
  getOutlookTypeEnabled: () => true,
}));
jest.mock('../DrawingTools/useExportMap', () => ({
  useExportMap: () => ({
    isExporting: false,
    isModalOpen: false,
    initiateExport: jest.fn(),
    confirmExport: jest.fn(),
    cancelExport: jest.fn(),
  }),
}));

const mockAddToast = jest.fn();

const createStore = () => configureStore({
  reducer: {
    forecast: forecastReducer,
    featureFlags: featureFlagsReducer,
    overlays: overlaysReducer,
  },
  middleware: (getDefaultMiddleware) => getDefaultMiddleware({
    serializableCheck: false,
    immutableCheck: false,
  }),
});

const createFeature = () => ({
  type: 'Feature' as const,
  id: 'feature-1',
  geometry: {
    type: 'Polygon' as const,
    coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]],
  },
  properties: {
    outlookType: 'tornado' as const,
    probability: '2%',
    isSignificant: false,
  },
});

const ToolbarHarness: React.FC = () => {
  const mapRef = useRef<ForecastMapHandle | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const controller = useForecastWorkspaceController({
    onSave: jest.fn(),
    onLoad: jest.fn(),
    mapRef,
    fileInputRef,
    addToast: mockAddToast,
  });

  return <IntegratedToolbar controller={controller} />;
};

describe('IntegratedToolbar undo/redo buttons', () => {
  beforeEach(() => {
    mockAddToast.mockReset();
  });

  test('renders undo and redo buttons with disabled state from selectors', () => {
    const store = createStore();

    render(
      <Provider store={store}>
        <ToolbarHarness />
      </Provider>
    );

    expect(screen.getByLabelText('Undo')).toBeDisabled();
    expect(screen.getByLabelText('Redo')).toBeDisabled();
  });

  test('clicking undo and redo dispatches history actions through the toolbar', async () => {
    const user = userEvent.setup();
    const store = createStore();
    store.dispatch(addFeature({ feature: createFeature() }));

    render(
      <Provider store={store}>
        <ToolbarHarness />
      </Provider>
    );

    const undoButton = screen.getByLabelText('Undo');
    const redoButton = screen.getByLabelText('Redo');

    expect(undoButton).toBeEnabled();
    expect(redoButton).toBeDisabled();

    await user.click(undoButton);
    expect(screen.getByLabelText('Undo')).toBeDisabled();
    expect(screen.getByLabelText('Redo')).toBeEnabled();

    await user.click(screen.getByLabelText('Redo'));
    expect(screen.getByLabelText('Undo')).toBeEnabled();
  });
});
