type SavedCycle = {
  id: string;
  timestamp: string;
  cycleDate: string;
  label?: string;
  forecastCycle?: unknown;
  forecastData?: unknown;
  stats: unknown;
};

type StoreLike = {
  subscribe: (cb: () => void) => () => void;
  getState: () => { forecast: { savedCycles: SavedCycle[] } };
};

describe('cycleHistoryPersistence', () => {
  beforeEach(() => {
    jest.resetModules();
    localStorage.clear();
  });

  test('saveCycleHistoryToStorage and loadCycleHistoryFromStorage roundtrip persisted shape', async () => {
    jest.doMock('./fileUtils', () => ({
      serializeForecast: jest.fn(() => ({ serialized: true })),
      deserializeForecast: jest.fn(() => ({ restored: true })),
    }));

    jest.doMock('./forecastMetrics', () => ({
      countForecastMetrics: jest.fn(() => ({ total: 1 })),
    }));

    const mod = await import('./cycleHistoryPersistence');
    const savedCycle: SavedCycle = {
      id: '1',
      timestamp: 'ts',
      cycleDate: '2026-04-22',
      label: 'L',
      forecastCycle: { some: 'fc' },
      stats: { total: 1 },
    };

    expect(() => mod.saveCycleHistoryToStorage([savedCycle])).not.toThrow();

    const loaded = mod.loadCycleHistoryFromStorage();
    expect(loaded.length).toBe(1);
    expect(loaded[0].id).toBe('1');
    expect(loaded[0].forecastCycle).toEqual({ restored: true });

    const fileUtils = await import('./fileUtils');
    expect(fileUtils.serializeForecast).toHaveBeenCalled();
    expect(fileUtils.deserializeForecast).toHaveBeenCalled();
  });

  test('loadCycleHistoryFromStorage handles legacy format and computes stats when missing', async () => {
    jest.doMock('./forecastMetrics', () => ({
      countForecastMetrics: jest.fn(() => ({ computed: 42 })),
    }));

    const legacy: SavedCycle[] = [{
      id: 'legacy',
      timestamp: 't2',
      cycleDate: 'd2',
      label: 'L2',
      forecastCycle: { foo: 'bar' },
      stats: {}
    }];

    localStorage.setItem('gfc-cycle-history', JSON.stringify(legacy));

    const mod = await import('./cycleHistoryPersistence');
    const loaded = mod.loadCycleHistoryFromStorage();
    expect(loaded.length).toBe(1);
    expect(loaded[0].id).toBe('legacy');
    expect(loaded[0].forecastCycle).toEqual({ foo: 'bar' });
    expect(loaded[0].stats).toEqual({});
  });

  test('loadCycleHistoryFromStorage returns empty on invalid stored data', async () => {
    localStorage.setItem('gfc-cycle-history', JSON.stringify({ not: 'an array' }));
    const mod = await import('./cycleHistoryPersistence');
    expect(mod.loadCycleHistoryFromStorage()).toEqual([]);

    localStorage.setItem('gfc-cycle-history', JSON.stringify([null, 5, {}]));
    expect(mod.loadCycleHistoryFromStorage()).toEqual([]);
  });

  test('saveCycleHistoryToStorage swallows localStorage errors', async () => {
    jest.doMock('./fileUtils', () => ({
      serializeForecast: jest.fn(() => ({ serialized: true })),
    }));

    const mod = await import('./cycleHistoryPersistence');

    const originalStorage = globalThis.localStorage;
    const throwingStorage = {
      ...originalStorage,
      setItem: jest.fn(() => {
        throw new Error('boom');
      }),
    } as Storage;
    Object.defineProperty(globalThis, 'localStorage', { value: throwingStorage, configurable: true });

    expect(() => mod.saveCycleHistoryToStorage([{
      id: 'x', timestamp: 't', cycleDate: 'd', forecastCycle: {}, stats: {}
    }])).not.toThrow();

    Object.defineProperty(globalThis, 'localStorage', { value: originalStorage, configurable: true });
  });

  test('setupCycleHistoryListener persists on store updates', async () => {
    const mod = await import('./cycleHistoryPersistence');
    const spy = jest.spyOn(mod, 'saveCycleHistoryToStorage').mockImplementation(() => undefined);

    const listeners: Array<() => void> = [];
    let state = { forecast: { savedCycles: [] as SavedCycle[] } };
    const store: StoreLike = {
      subscribe: (cb: () => void) => {
        listeners.push(cb);
        return () => {
          const index = listeners.indexOf(cb);
          if (index >= 0) listeners.splice(index, 1);
        };
      },
      getState: () => state,
    };

    mod.setupCycleHistoryListener(store as never);

    state = { forecast: { savedCycles: [{ id: 'a', timestamp: 't', cycleDate: 'd', forecastCycle: {}, stats: {} }] } };
    listeners.forEach((cb) => cb());
    expect(spy).toHaveBeenCalledWith(state.forecast.savedCycles);

    spy.mockClear();
    listeners.forEach((cb) => cb());
    expect(spy).not.toHaveBeenCalled();

    spy.mockRestore();
  });

  test('loadCycleHistoryFromStorage returns empty on JSON parse error', async () => {
    localStorage.setItem('gfc-cycle-history', 'not-json');
    const mod = await import('./cycleHistoryPersistence');
    expect(mod.loadCycleHistoryFromStorage()).toEqual([]);
  });

  test('loadCycleHistoryFromStorage handles deserializeForecast throwing', async () => {
    jest.doMock('./fileUtils', () => ({
      deserializeForecast: jest.fn(() => {
        throw new Error('boom');
      }),
    }));

    const bad: SavedCycle[] = [{ id: 'b', timestamp: 't', cycleDate: 'd', forecastData: { foo: 'bar' }, stats: {} }];
    localStorage.setItem('gfc-cycle-history', JSON.stringify(bad));

    const mod = await import('./cycleHistoryPersistence');
    const loaded = mod.loadCycleHistoryFromStorage();
    expect(loaded).toEqual([]);
  });

  test('useCycleHistoryPersistence dispatches when saved cycles exist', async () => {
    const dispatchSpy = jest.fn();

    jest.doMock('react', () => ({ useEffect: (fn: () => void) => fn() }));
    jest.doMock('react-redux', () => ({ useDispatch: () => dispatchSpy }));

    const legacy: SavedCycle[] = [{ id: 'l', timestamp: 't', cycleDate: 'd', forecastCycle: {}, stats: {} }];
    localStorage.setItem('gfc-cycle-history', JSON.stringify(legacy));

    const mod = await import('./cycleHistoryPersistence');
    mod.useCycleHistoryPersistence();

    expect(dispatchSpy).toHaveBeenCalled();
  });
});
