import React, { useRef } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { IntegratedToolbar, TabbedIntegratedToolbar } from './IntegratedToolbar';
import { useForecastWorkspaceController } from '../ForecastWorkspace/useForecastWorkspaceController';
import forecastReducer, { addFeature } from '../../store/forecastSlice';
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

const ToolbarTestHarness: React.FC<{ variant: 'legacy' | 'tabbed' }> = ({ variant }) => {
  const mapRef = useRef<ForecastMapHandle | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const controller = useForecastWorkspaceController({
    onSave: jest.fn(),
    onLoad: jest.fn(),
    mapRef,
    fileInputRef,
    addToast: mockAddToast,
  });

  return variant === 'tabbed'
    ? <TabbedIntegratedToolbar controller={controller} />
    : <IntegratedToolbar controller={controller} />;
};

const renderToolbar = (variant: 'legacy' | 'tabbed', store = createStore()) => render(
  <Provider store={store}>
    <ToolbarTestHarness variant={variant} />
  </Provider>
);

describe('IntegratedToolbar undo/redo buttons', () => {
  beforeEach(() => {
    mockAddToast.mockReset();
  });

  test('renders undo and redo buttons with disabled state from selectors', () => {
    renderToolbar('legacy');

    expect(screen.getByLabelText('Undo')).toBeDisabled();
    expect(screen.getByLabelText('Redo')).toBeDisabled();
  });

  test('clicking undo and redo dispatches history actions through the toolbar', async () => {
    const user = userEvent.setup();
    const store = createStore();
    store.dispatch(addFeature({ feature: createFeature() }));

    renderToolbar('legacy', store);

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

describe('TabbedIntegratedToolbar completion validation exposure', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test.each([
    [false, false],
    [true, true],
  ])(
    'Complete action visibility follows forecastWorkflowV2 exposure (exposed=%s)',
    async (exposed, visible) => {
      jest.spyOn(require('../../config/featureExposure'), 'isFeatureExposed').mockReturnValue(exposed);
      const user = userEvent.setup();

      renderToolbar('tabbed');
      await user.click(screen.getByRole('tab', { name: /Tools/i }));

      if (visible) {
        expect(screen.getByText('Complete')).toBeInTheDocument();
      } else {
        expect(screen.queryByText('Complete')).not.toBeInTheDocument();
      }
    }
  );
});
