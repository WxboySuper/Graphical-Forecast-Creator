import React, { useRef } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router';
import { configureStore } from '@reduxjs/toolkit';
import { TabbedIntegratedToolbar } from './IntegratedToolbar';
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
  outlookOpacity: 1,
  handleOutlookOpacityChange: jest.fn(),
  activeProbabilisticHazard: 'tornado',
  otherProbabilisticHazards: ['wind', 'hail'],
  canCopyAllFrom: jest.fn(() => false),
  canCopyProbabilityFrom: jest.fn(() => false),
  handleCopyAllGeometryFrom: jest.fn(),
  handleCopyProbabilityGeometryFrom: jest.fn(),
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
jest.mock('../../auth/AuthProvider', () => ({
  useAuth: () => ({ user: null }),
}));
jest.mock('../../billing/EntitlementProvider', () => ({
  useEntitlement: () => ({ premiumActive: false }),
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

const ToolbarTestHarness: React.FC = () => {
  const mapRef = useRef<ForecastMapHandle | null>(null);
  const controller = useForecastWorkspaceController({
    mapRef,
    addToast: mockAddToast,
    onImportResult: jest.fn(),
    onExportComplete: jest.fn(),
  });

  return <TabbedIntegratedToolbar controller={controller} />;
};

const renderToolbar = (store = createStore()) => render(
  <MemoryRouter>
    <Provider store={store}>
      <ToolbarTestHarness />
    </Provider>
  </MemoryRouter>
);

describe('TabbedIntegratedToolbar undo/redo buttons', () => {
  beforeEach(() => {
    mockAddToast.mockReset();
  });

  test('renders undo and redo buttons with disabled state from selectors', async () => {
    const user = userEvent.setup();
    renderToolbar();

    await user.click(screen.getByRole('tab', { name: /Tools/i }));

    expect(screen.getByRole('button', { name: 'Undo' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Redo' })).toBeDisabled();
  });

  test('clicking undo and redo dispatches history actions through the toolbar', async () => {
    const user = userEvent.setup();
    const store = createStore();
    store.dispatch(addFeature({ feature: createFeature() }));

    renderToolbar(store);

    await user.click(screen.getByRole('tab', { name: /Tools/i }));

    const undoButton = screen.getByRole('button', { name: 'Undo' });
    const redoButton = screen.getByRole('button', { name: 'Redo' });

    expect(undoButton).toBeEnabled();
    expect(redoButton).toBeDisabled();

    await user.click(undoButton);
    expect(screen.getByRole('button', { name: 'Undo' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Redo' })).toBeEnabled();

    await user.click(screen.getByRole('button', { name: 'Redo' }));
    expect(screen.getByRole('button', { name: 'Undo' })).toBeEnabled();
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

      renderToolbar();
      await user.click(screen.getByRole('tab', { name: /Tools/i }));

      expect(Boolean(screen.queryByRole('button', { name: 'Complete' }))).toBe(visible);
    }
  );
});

describe('custom Draw mode exposure', () => {
  afterEach(() => jest.restoreAllMocks());

  test('keeps hosted Draw UI unchanged with no custom toggle or placeholder', () => {
    jest.spyOn(require('../../config/featureExposure'), 'isFeatureExposed').mockImplementation((feature) => feature !== 'customProducts');
    renderToolbar();
    expect(screen.queryByRole('radiogroup', { name: 'Drawing product' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Saved products/i })).not.toBeInTheDocument();
    expect(screen.getByTitle('Wind')).toBeInTheDocument();
    expect(screen.queryByText(/not available/i)).not.toBeInTheDocument();
  });

  test('animates a clean Severe/Custom swap and creates signed-out layers', async () => {
    jest.spyOn(require('../../config/featureExposure'), 'isFeatureExposed').mockReturnValue(true);
    const user = userEvent.setup();
    const store = createStore();
    renderToolbar(store);
    await user.click(screen.getByRole('tab', { name: /Tools/i }));
    expect(screen.getByRole('button', { name: 'Undo' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Redo' })).toBeDisabled();
    await user.click(screen.getByRole('tab', { name: /Draw/i }));
    const toggle = screen.getByTestId('custom-product-toggle');
    expect(toggle).not.toHaveClass('is-custom-mode');
    expect(screen.getByRole('radio', { name: 'Severe' }))
      .toHaveClass('custom-product-toggle__button--leading');
    const customButton = screen.getByRole('radio', { name: 'Custom' });
    expect(customButton).toHaveClass('custom-product-toggle__button--trailing');
    expect(customButton).toHaveClass('integrated-toolbar-mode-toggle-btn');
    expect(customButton).not.toHaveClass('mode-toggle-btn');
    expect(screen.getByRole('radio', { name: 'Severe' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.queryByRole('button', { name: /Saved products/i })).not.toBeInTheDocument();

    await user.click(screen.getByRole('radio', { name: 'Custom' }));
    expect(toggle).toHaveClass('is-custom-mode');
    expect(screen.queryByTitle('Wind')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Saved products/i })).toBeInTheDocument();
    expect(screen.getByTestId('custom-draw-panel')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Add custom layer' }));
    expect(screen.getByLabelText('Layer title')).toHaveValue('Custom Layer 1');
    await user.clear(screen.getByLabelText('Layer title'));
    await user.type(screen.getByLabelText('Layer title'), 'Winter impacts');
    await user.tab();
    expect(screen.getByLabelText('Layer title')).toHaveValue('Winter impacts');
    await user.click(screen.getByRole('tab', { name: /Tools/i }));
    expect(screen.getByRole('button', { name: 'Undo' })).toBeEnabled();
    await user.click(screen.getByRole('button', { name: 'Undo' }));
    await user.click(screen.getByRole('tab', { name: /Draw/i }));
    await waitFor(() => expect(screen.getByLabelText('Layer title')).toHaveValue('Custom Layer 1'));
    await user.click(screen.getByRole('tab', { name: /Tools/i }));
    expect(screen.getByRole('button', { name: 'Redo' })).toBeEnabled();
    await user.click(screen.getByRole('button', { name: 'Redo' }));
    await user.click(screen.getByRole('tab', { name: /Draw/i }));
    await waitFor(() => expect(screen.getByLabelText('Layer title')).toHaveValue('Winter impacts'));

    await user.click(screen.getByRole('radio', { name: 'Severe' }));
    expect(screen.getByTitle('Wind')).toBeInTheDocument();
    expect(screen.queryByTestId('custom-draw-panel')).not.toBeInTheDocument();
  });
});
