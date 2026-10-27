const buildZipFile = (): File => {
  const bytes = new Uint8Array([0x50, 0x4b, 0x03, 0x04]);
  return Object.assign(bytes, { name: 'package.zip', type: 'application/zip' }) as unknown as File;
};

type MockStream = {
  on: jest.Mock;
  pause: jest.Mock;
  resume: jest.Mock;
};

const mockZipWithEntry = (options: { declaredSize?: number; chunks: Uint8Array[] }) => {
  const handlers = new Map<string, (value?: unknown) => void>();
  const stream = {} as MockStream;
  stream.on = jest.fn((event: string, handler: (value?: unknown) => void) => {
    handlers.set(event, handler);
    return stream;
  });
  stream.pause = jest.fn();
  stream.resume = jest.fn(() => {
    for (const chunk of options.chunks) {
      handlers.get('data')?.(chunk);
      if (stream.pause.mock.calls.length > 0) break;
    }
    if (stream.pause.mock.calls.length === 0) handlers.get('end')?.();
    return stream;
  });
  const internalStream = jest.fn(() => stream);
  jest.doMock('jszip', () => class MockJSZip {
    static async loadAsync() {
      return {
        file: () => ({
          _data: options.declaredSize === undefined ? {} : { uncompressedSize: options.declaredSize },
          internalStream,
        }),
      };
    }
  });
  return { internalStream, stream };
};

describe('readForecastImportFile package expansion limits', () => {
  afterEach(() => {
    jest.resetModules();
    jest.dontMock('jszip');
  });

  test('rejects an entry whose declared expanded size exceeds the import budget', async () => {
    jest.resetModules();
    const { MAX_IMPORT_BYTES } = await import('./forecastImportValidation');
    const { internalStream } = mockZipWithEntry({ declaredSize: MAX_IMPORT_BYTES + 1, chunks: [] });
    const { readForecastImportFile } = await import('./fileUtils');

    await expect(readForecastImportFile(buildZipFile())).rejects.toThrow(/too large/i);
    expect(internalStream).not.toHaveBeenCalled();
  });

  test('pauses expansion when streamed output exceeds the budget despite an understated header', async () => {
    jest.resetModules();
    const { MAX_IMPORT_BYTES } = await import('./forecastImportValidation');
    const { stream } = mockZipWithEntry({
      declaredSize: 1024,
      chunks: [new Uint8Array(MAX_IMPORT_BYTES), new Uint8Array(1)],
    });
    const { readForecastImportFile } = await import('./fileUtils');

    await expect(readForecastImportFile(buildZipFile())).rejects.toThrow(/too large/i);
    expect(stream.pause).toHaveBeenCalledTimes(1);
  });
});
