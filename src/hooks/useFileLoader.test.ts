import { createFileHandlers } from './useFileLoader';
import { waitFor } from '@testing-library/react';
import type { ForecastWorkspaceId } from '../config/forecastWorkspaces';
import { downloadBlob, readForecastImportFile, validateForecastDataReason } from '../utils/fileUtils';
import { serializeForecastWorkspace } from '../utils/forecastWorkspacePersistenceAdapter';
import { resolveNativeFileContent } from '../utils/forecastTransfer/nativeImportUtils';

jest.mock('../utils/fileUtils', () => ({
  downloadBlob: jest.fn(),
  readForecastImportFile: jest.fn(),
  validateForecastDataReason: jest.fn(),
}));

jest.mock('../utils/forecastWorkspacePersistenceAdapter', () => ({
  serializeForecastWorkspace: jest.fn(),
}));

jest.mock('../utils/forecastTransfer/nativeImportUtils', () => ({
  resolveNativeFileContent: jest.fn(),
}));

const mockValidateForecastDataReason = validateForecastDataReason as jest.MockedFunction<typeof validateForecastDataReason>;
const mockDownloadBlob = downloadBlob as jest.MockedFunction<typeof downloadBlob>;
const mockReadForecastImportFile = readForecastImportFile as jest.MockedFunction<typeof readForecastImportFile>;
const mockSerializeWorkspace = serializeForecastWorkspace as jest.MockedFunction<typeof serializeForecastWorkspace>;
const mockResolveNativeFile = resolveNativeFileContent as jest.MockedFunction<typeof resolveNativeFileContent>;

describe('createFileHandlers', () => {
  const forecastCycle = { id: 'cycle-1' };
  let addToast: jest.Mock;
  let dispatch: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    addToast = jest.fn();
    dispatch = jest.fn();
    mockValidateForecastDataReason.mockReturnValue(null);
    mockResolveNativeFile.mockReturnValue({
      workspaceId: 'severe',
      forecastCycle: { id: 'loaded-cycle' },
      mapView: undefined,
      cycleMetadata: undefined,
    } as never);
    mockSerializeWorkspace.mockReturnValue({ workspaceId: 'severe', forecast: { id: 'saved' } } as never);
    mockDownloadBlob.mockImplementation(() => undefined);
    mockReadForecastImportFile.mockImplementation(async (file) => JSON.parse(await file.text()) as unknown);
  });

  const createTextFile = (text: string, shouldReject = false): File => ({
    name: 'forecast.json',
    text: shouldReject ? jest.fn().mockRejectedValue(new Error('read failed')) : jest.fn().mockResolvedValue(text),
  } as unknown as File);

  const makeHandlers = (workspaceId?: ForecastWorkspaceId) =>
    createFileHandlers({ addToast, dispatch, forecastCycle: forecastCycle as never, ...(workspaceId ? { workspaceId } : {}) });

  const loadJsonPayload = (handlers: ReturnType<typeof createFileHandlers>, payload: unknown) =>
    handlers.handleLoad(createTextFile(JSON.stringify(payload)));

  const loadWorkspaceIdentityFile = (activeWorkspaceId: ForecastWorkspaceId) => {
    mockResolveNativeFile.mockReturnValue({
      workspaceId: 'custom',
      forecastCycle: { id: 'custom-cycle' },
      mapView: undefined,
      cycleMetadata: undefined,
    } as never);
    return loadJsonPayload(makeHandlers(activeWorkspaceId), { version: 1 });
  };

  const loadWorkflowPackageWithOuterWorkspace = (outerWorkspaceId: unknown) => {
    mockResolveNativeFile.mockImplementation(() => {
      throw new Error(`This workflow package declares an unknown workspace. (${String(outerWorkspaceId)})`);
    });
    return loadJsonPayload(makeHandlers('severe'), { workspaceId: outerWorkspaceId, forecast: { version: 1 } });
  };

  it('loads valid forecast JSON and dispatches the imported cycle', async () => {
    const handlers = makeHandlers();

    await loadJsonPayload(handlers, { version: 1 });

    expect(mockValidateForecastDataReason).toHaveBeenCalledWith({ version: 1 });
    expect(mockResolveNativeFile).toHaveBeenCalledWith({ version: 1 });
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({
      type: 'forecast/importForecastCycle',
      payload: { id: 'loaded-cycle' },
    }));
    expect(addToast).toHaveBeenCalledWith('Forecast loaded successfully!', 'success');
  });

  it('restores workflow metadata and map view from the resolved envelope', async () => {
    const handlers = makeHandlers('severe');
    mockResolveNativeFile.mockReturnValue({
      workspaceId: 'severe',
      forecastCycle: { id: 'loaded-cycle' },
      mapView: { center: [10, 20], zoom: 5 },
      cycleMetadata: { id: 'WF-1' },
    } as never);

    await loadJsonPayload(handlers, { version: 1 });

    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: 'forecast/importForecastCycle' }));
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: 'forecast/setWorkflowMetadata' }));
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({
      type: 'forecast/setMapView',
      payload: { center: [10, 20], zoom: 5 },
    }));
  });

  it('clears workflow metadata when the resolved envelope carries an explicit null', async () => {
    const handlers = makeHandlers('severe');
    mockResolveNativeFile.mockReturnValue({
      workspaceId: 'severe',
      forecastCycle: { id: 'loaded-cycle' },
      mapView: undefined,
      cycleMetadata: null,
    } as never);

    await loadJsonPayload(handlers, { version: 1 });

    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: 'forecast/clearWorkflowMetadata' }));
  });

  it('reports invalid JSON, invalid forecast data, and read errors', async () => {
    const handlers = makeHandlers();

    await handlers.handleLoad(createTextFile('{nope'));
    expect(addToast).toHaveBeenLastCalledWith('File is not valid JSON.', 'error');

    mockValidateForecastDataReason.mockReturnValueOnce('Invalid forecast data format.');
    await handlers.handleLoad(createTextFile('{}'));
    expect(addToast).toHaveBeenLastCalledWith('Invalid forecast data format.', 'error');

    await handlers.handleLoad(createTextFile('', true));
    expect(addToast).toHaveBeenLastCalledWith('Error reading file.', 'error');
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('handles file input selection and resets the input', async () => {
    const handlers = makeHandlers();
    const input = document.createElement('input');
    const file = createTextFile('{}');
    Object.defineProperty(input, 'files', { value: [file] });

    handlers.handleFileSelect({ target: input, currentTarget: input } as unknown as React.ChangeEvent<HTMLInputElement>);
    await Promise.resolve();

    expect(input.value).toBe('');
    await waitFor(() => expect(addToast).toHaveBeenCalledWith('Forecast loaded successfully!', 'success'));
  });

  it('refuses a cross-workspace file without mutating state', async () => {
    await loadWorkspaceIdentityFile('severe');

    expect(dispatch).not.toHaveBeenCalled();
    expect(addToast).toHaveBeenCalledWith(expect.stringContaining('custom workspace'), 'error');
  });

  it('loads a same-workspace file when workspace identity matches', async () => {
    await loadWorkspaceIdentityFile('custom');

    expect(dispatch).toHaveBeenCalled();
    expect(addToast).toHaveBeenCalledWith('Forecast loaded successfully!', 'success');
  });

  it('opens the hidden file picker when available', () => {
    const handlers = makeHandlers();
    const click = jest.fn();
    handlers.fileInputRef.current = { click } as unknown as HTMLInputElement;

    handlers.handleOpenFilePicker();

    expect(click).toHaveBeenCalled();
  });

  it.each(['bogus', 'Severe'])('rejects a package with invalid outer workspace %s instead of falling back', async (outerWorkspaceId) => {
    await loadWorkflowPackageWithOuterWorkspace(outerWorkspaceId);

    expect(dispatch).not.toHaveBeenCalled();
    expect(addToast).toHaveBeenCalledWith(expect.stringContaining('unknown workspace'), 'error');
  });

  it('exports the current cycle and reports export failures', () => {
    const handlers = makeHandlers('custom');

    handlers.handleSave();

    expect(mockSerializeWorkspace).toHaveBeenCalledWith('custom', forecastCycle, {
      center: [39.8283, -98.5795],
      zoom: 4,
    }, undefined);
    expect(mockDownloadBlob).toHaveBeenCalled();
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: 'forecast/markAsSaved' }));
    expect(addToast).toHaveBeenCalledWith('Forecast exported to JSON!', 'success');

    mockDownloadBlob.mockImplementationOnce(() => {
      throw new Error('download failed');
    });
    handlers.handleSave();
    expect(addToast).toHaveBeenLastCalledWith('Error exporting forecast.', 'error');
  });

  it('preserves the live map view and workflow metadata on save', () => {
    const mapView = { center: [11, 22] as [number, number], zoom: 5 };
    const cycleMetadata = { id: 'WF-severe-2026-09-10' } as never;
    const handlers = createFileHandlers({
      addToast,
      dispatch,
      forecastCycle: forecastCycle as never,
      cycleMetadata,
      mapView,
      workspaceId: 'severe',
    });

    handlers.handleSave();

    expect(mockSerializeWorkspace).toHaveBeenCalledWith('severe', forecastCycle, mapView, cycleMetadata);
  });
});
