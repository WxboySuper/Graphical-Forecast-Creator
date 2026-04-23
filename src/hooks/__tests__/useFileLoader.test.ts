import { createFileHandlers } from '../useFileLoader';

const mockExportForecastToJson = jest.fn();
const mockDeserializeForecast = jest.fn((data) => data);
const mockValidateForecastData = jest.fn(() => true);

jest.mock('../../utils/fileUtils', () => ({
  exportForecastToJson: (...args: unknown[]) => mockExportForecastToJson(...args),
  deserializeForecast: (...args: unknown[]) => mockDeserializeForecast(...args),
  validateForecastData: (...args: unknown[]) => mockValidateForecastData(...args),
}));

describe('createFileHandlers', () => {
  const addToast = jest.fn();
  const dispatch = jest.fn();
  const forecastCycle = {
    days: {},
    currentDay: 1,
    cycleDate: '2026-04-22',
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('loads valid json and dispatches import', async () => {
    const handlers = createFileHandlers({ addToast, dispatch, forecastCycle });
    const file = {
      text: async () => JSON.stringify({ ok: true }),
    } as File;

    await handlers.handleLoad(file);
    expect(mockValidateForecastData).toHaveBeenCalled();
    expect(dispatch).toHaveBeenCalled();
    expect(addToast).toHaveBeenCalledWith('Forecast loaded successfully!', 'success');
  });

  it('shows errors for invalid json and invalid payload shape', async () => {
    const handlers = createFileHandlers({ addToast, dispatch, forecastCycle });

    await handlers.handleLoad({ text: async () => '{bad-json' } as File);
    expect(addToast).toHaveBeenCalledWith('File is not valid JSON.', 'error');

    mockValidateForecastData.mockReturnValueOnce(false);
    await handlers.handleLoad({ text: async () => JSON.stringify({ nope: true }) } as File);
    expect(addToast).toHaveBeenCalledWith('Invalid forecast data format.', 'error');
  });

  it('handles file select and resets the input value', async () => {
    const handlers = createFileHandlers({ addToast, dispatch, forecastCycle });
    const file = { text: async () => JSON.stringify({ ok: true }) } as File;

    const event = {
      target: { files: [file] },
      currentTarget: { value: 'non-empty' },
    } as unknown as React.ChangeEvent<HTMLInputElement>;

    handlers.handleFileSelect(event);
    expect(event.currentTarget.value).toBe('');
  });

  it('opens file picker using the hidden input ref', () => {
    const handlers = createFileHandlers({ addToast, dispatch, forecastCycle });
    const click = jest.fn();
    handlers.fileInputRef.current = { click } as unknown as HTMLInputElement;

    handlers.handleOpenFilePicker();
    expect(click).toHaveBeenCalled();
  });

  it('exports current forecast and handles export failures', () => {
    const handlers = createFileHandlers({ addToast, dispatch, forecastCycle });
    handlers.handleSave();

    expect(mockExportForecastToJson).toHaveBeenCalled();
    expect(dispatch).toHaveBeenCalled();
    expect(addToast).toHaveBeenCalledWith('Forecast exported to JSON!', 'success');

    mockExportForecastToJson.mockImplementationOnce(() => {
      throw new Error('boom');
    });
    handlers.handleSave();
    expect(addToast).toHaveBeenCalledWith('Error exporting forecast.', 'error');
  });
});
