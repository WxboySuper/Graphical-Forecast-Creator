import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { configureStore } from '@reduxjs/toolkit';
import { Provider } from 'react-redux';
import { createElement } from 'react';

const mockAddToast = jest.fn();

jest.mock('../../utils/fileUtils', () => ({
  readForecastImportFile: jest.fn(),
  validateForecastData: jest.fn(),
  validateForecastDataReason: jest.fn(),
}));

jest.mock('../../utils/forecastTransfer/nativeImportUtils', () => ({
  resolveNativeFileContent: jest.fn(),
}));

jest.mock('../Layout/AppLayout', () => ({
  useAppLayout: () => ({ addToast: mockAddToast }),
}));

jest.mock('../../hooks/useModalFocusTrap', () => ({
  useModalFocusTrap: () => ({ setModalRef: jest.fn() }),
}));

import CopyFromPreviousModal, { parseForecastFile, parseForecastFileWithOwner } from './CopyFromPreviousModal';
import forecastReducer, { setForecastWorkspace } from '../../store/forecastSlice';

const { readForecastImportFile, validateForecastData, validateForecastDataReason } = jest.requireMock('../../utils/fileUtils') as {
  readForecastImportFile: jest.Mock;
  validateForecastData: jest.Mock;
  validateForecastDataReason: jest.Mock;
};
const { resolveNativeFileContent } = jest.requireMock('../../utils/forecastTransfer/nativeImportUtils') as {
  resolveNativeFileContent: jest.Mock;
};

describe('parseForecastFile workspace ownership', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    readForecastImportFile.mockResolvedValue({});
    validateForecastData.mockReturnValue(true);
    validateForecastDataReason.mockReturnValue(null);
    resolveNativeFileContent.mockReturnValue({ workspaceId: 'custom', forecastCycle: { cycleDate: '2026-09-22' } });
  });

  it('surfaces the specific reason when validation rejects the file', async () => {
    validateForecastData.mockReturnValue(false);
    validateForecastDataReason.mockReturnValue('This forecast belongs to an unknown workspace.');

    await expect(parseForecastFileWithOwner(new File(['{}'], 'bad.json'), 'severe'))
      .rejects.toThrow('This forecast belongs to an unknown workspace.');
  });

  it('falls back to a generic reason when validation gives none', async () => {
    validateForecastData.mockReturnValue(false);
    validateForecastDataReason.mockReturnValue(null);

    await expect(parseForecastFileWithOwner(new File(['{}'], 'bad.json'), 'severe'))
      .rejects.toThrow('Invalid GFC forecast file.');
  });

  it('accepts a file owned by the active workspace', async () => {
    await expect(parseForecastFile(new File(['{}'], 'cycle.json'), 'custom'))
      .resolves.toEqual({ cycleDate: '2026-09-22' });
  });

  it('rejects a file owned by another workspace before copying features', async () => {
    await expect(parseForecastFile(new File(['{}'], 'cycle.json'), 'severe'))
      .rejects.toThrow('This forecast belongs to the custom workspace.');
  });

  it('returns the owning workspace and warnings so dispatch can re-check', async () => {
    resolveNativeFileContent.mockReturnValue({
      workspaceId: 'custom',
      forecastCycle: { cycleDate: '2026-09-22' },
      warnings: ['This package labels an untagged legacy forecast as custom workspace.'],
    });
    await expect(parseForecastFileWithOwner(new File(['{}'], 'cycle.json'), 'custom'))
      .resolves.toEqual({
        cycle: { cycleDate: '2026-09-22' },
        workspaceId: 'custom',
        warnings: ['This package labels an untagged legacy forecast as custom workspace.'],
      });
    await expect(parseForecastFileWithOwner(new File(['{}'], 'cycle.json'), 'severe'))
      .rejects.toThrow('This forecast belongs to the custom workspace.');
  });
});

describe('CopyFromPreviousModal file selection', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    validateForecastData.mockReturnValue(true);
    validateForecastDataReason.mockReturnValue(null);
    resolveNativeFileContent.mockReturnValue({
      workspaceId: 'severe',
      forecastCycle: { cycleDate: '2026-09-22' },
      warnings: [],
    });
  });

  it('clears the previous loaded file when a newly selected file fails to parse', async () => {
    const store = configureStore({
      reducer: { forecast: forecastReducer },
      middleware: (getDefaultMiddleware) => getDefaultMiddleware({ serializableCheck: false, immutableCheck: false }),
    });
    store.dispatch(setForecastWorkspace('severe'));
    readForecastImportFile
      .mockResolvedValueOnce({ valid: true })
      .mockRejectedValueOnce(new Error('bad file'));
    render(createElement(
      Provider,
      { store, children: createElement(CopyFromPreviousModal, { isOpen: true, onClose: jest.fn() }) },
    ));

    const fileInput = screen.getByLabelText('Load Forecast File:');
    fireEvent.change(fileInput, { target: { files: [new File(['{}'], 'valid.json')] } });
    expect(await screen.findByText(/Loaded: valid\.json/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copy Features' })).toBeEnabled();

    fireEvent.change(fileInput, { target: { files: [new File(['bad'], 'invalid.json')] } });

    await waitFor(() => {
      expect(screen.queryByText(/Loaded: valid\.json/)).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Copy Features' })).toBeDisabled();
    });
    expect(mockAddToast).toHaveBeenCalledWith(
      "Failed to load forecast file. Please ensure it's a valid GFC JSON file.",
      'error',
    );
  });

  it('keeps the latest selected file when earlier reads finish afterward', async () => {
    const store = configureStore({
      reducer: { forecast: forecastReducer },
      middleware: (getDefaultMiddleware) => getDefaultMiddleware({ serializableCheck: false, immutableCheck: false }),
    });
    store.dispatch(setForecastWorkspace('severe'));
    let finishFirstRead!: (value: { valid: boolean }) => void;
    const firstRead = new Promise<{ valid: boolean }>((resolve) => { finishFirstRead = resolve; });
    readForecastImportFile.mockReturnValueOnce(firstRead).mockResolvedValueOnce({ valid: true });
    render(createElement(
      Provider,
      { store, children: createElement(CopyFromPreviousModal, { isOpen: true, onClose: jest.fn() }) },
    ));

    const fileInput = screen.getByLabelText('Load Forecast File:');
    fireEvent.change(fileInput, { target: { files: [new File(['{}'], 'first.json')] } });
    fireEvent.change(fileInput, { target: { files: [new File(['{}'], 'second.json')] } });
    expect(await screen.findByText(/Loaded: second\.json/)).toBeInTheDocument();

    await act(async () => {
      finishFirstRead({ valid: true });
      await firstRead;
    });
    expect(screen.getByText(/Loaded: second\.json/)).toBeInTheDocument();
    expect(screen.queryByText(/Loaded: first\.json/)).not.toBeInTheDocument();
  });
});
