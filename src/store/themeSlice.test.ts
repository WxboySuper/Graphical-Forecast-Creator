describe('themeSlice', () => {
  const loadSlice = async () => {
    let themeModule: typeof import('./themeSlice') | null = null;
    await jest.isolateModulesAsync(async () => {
      themeModule = await import('./themeSlice');
    });
    if (!themeModule) {
      throw new Error('Expected theme slice module to load');
    }
    return themeModule;
  };

  beforeEach(() => {
    localStorage.clear();
    document.documentElement.className = '';
    jest.resetModules();
  });

  test('initializes from localStorage and applies the dark class', async () => {
    localStorage.setItem('darkMode', 'true');

    const themeModule = await loadSlice();
    const reducer = themeModule.default;

    expect(reducer(undefined, { type: 'unknown' })).toEqual({ darkMode: true });
    expect(document.documentElement).toHaveClass('dark-mode');
  });

  test('toggles and sets dark mode while syncing localStorage and document class', async () => {
    const themeModule = await loadSlice();
    const reducer = themeModule.default;
    const { setDarkMode, toggleDarkMode } = themeModule;

    const toggled = reducer(undefined, toggleDarkMode());
    expect(toggled.darkMode).toBe(true);
    expect(localStorage.getItem('darkMode')).toBe('true');
    expect(document.documentElement).toHaveClass('dark-mode');

    const light = reducer(toggled, setDarkMode(false));
    expect(light.darkMode).toBe(false);
    expect(localStorage.getItem('darkMode')).toBe('false');
    expect(document.documentElement).not.toHaveClass('dark-mode');
  });
});
