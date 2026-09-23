jest.mock('../../utils/fileUtils', () => ({
  readForecastImportFile: jest.fn(),
  validateForecastData: jest.fn(),
}));

jest.mock('../../utils/forecastTransfer/nativeImportUtils', () => ({
  resolveNativeFileContent: jest.fn(),
}));

import { parseForecastFile } from './CopyFromPreviousModal';

const { readForecastImportFile, validateForecastData } = jest.requireMock('../../utils/fileUtils') as {
  readForecastImportFile: jest.Mock;
  validateForecastData: jest.Mock;
};
const { resolveNativeFileContent } = jest.requireMock('../../utils/forecastTransfer/nativeImportUtils') as {
  resolveNativeFileContent: jest.Mock;
};

describe('parseForecastFile workspace ownership', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    readForecastImportFile.mockResolvedValue({});
    validateForecastData.mockReturnValue(true);
    resolveNativeFileContent.mockReturnValue({ workspaceId: 'custom', forecastCycle: { cycleDate: '2026-09-22' } });
  });

  it('accepts a file owned by the active workspace', async () => {
    await expect(parseForecastFile(new File(['{}'], 'cycle.json'), 'custom'))
      .resolves.toEqual({ cycleDate: '2026-09-22' });
  });

  it('rejects a file owned by another workspace before copying features', async () => {
    await expect(parseForecastFile(new File(['{}'], 'cycle.json'), 'severe'))
      .rejects.toThrow('This forecast belongs to the custom workspace.');
  });
});
