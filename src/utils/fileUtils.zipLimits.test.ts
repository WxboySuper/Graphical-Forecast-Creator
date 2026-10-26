const buildZipFile = (): File => {
  const bytes = new Uint8Array([0x50, 0x4b, 0x03, 0x04]);
  return Object.assign(bytes, { name: 'package.zip', type: 'application/zip' }) as unknown as File;
};

const mockZipWithEntry = (options: { declaredSize?: number; expandedSize: number }) => {
  const expand = jest.fn(async () => new Uint8Array(options.expandedSize));
  jest.doMock('jszip', () => class MockJSZip {
    static async loadAsync() {
      return {
        file: () => ({
          _data: options.declaredSize === undefined ? {} : { uncompressedSize: options.declaredSize },
          async: expand,
        }),
      };
    }
  });
  return expand;
};

describe('readForecastImportFile package expansion limits', () => {
  afterEach(() => {
    jest.resetModules();
    jest.dontMock('jszip');
  });

  test('rejects an entry whose declared expanded size exceeds the import budget', async () => {
    jest.resetModules();
    const { MAX_IMPORT_BYTES } = await import('./forecastImportValidation');
    const expand = mockZipWithEntry({ declaredSize: MAX_IMPORT_BYTES + 1, expandedSize: 1 });
    const { readForecastImportFile } = await import('./fileUtils');

    await expect(readForecastImportFile(buildZipFile())).rejects.toThrow(/too large/i);
    expect(expand).not.toHaveBeenCalled();
  });

  test('rejects an entry that expands past the budget despite an understated header', async () => {
    jest.resetModules();
    const { MAX_IMPORT_BYTES } = await import('./forecastImportValidation');
    mockZipWithEntry({ declaredSize: 1024, expandedSize: MAX_IMPORT_BYTES + 1 });
    const { readForecastImportFile } = await import('./fileUtils');

    await expect(readForecastImportFile(buildZipFile())).rejects.toThrow(/too large/i);
  });
});
