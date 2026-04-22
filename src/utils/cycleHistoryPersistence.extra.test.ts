describe('cycleHistoryPersistence', () => {
  beforeEach(() => {
    jest.resetModules();
    localStorage.clear();
  });

  test('saveCycleHistoryToStorage and loadCycleHistoryFromStorage roundtrip persisted shape', () => {
    jest.resetModules();

    // Mock fileUtils serialize/deserialize and forecastMetrics
    jest.doMock('./fileUtils', () => ({
      serializeForecast: jest.fn(() => ({ serialized: true })),
      deserializeForecast: jest.fn(() => ({ restored: true })),
    }));

    jest.doMock('./forecastMetrics', () => ({
      countForecastMetrics: jest.fn(() => ({ total: 1 })),
    }));

    const mod = require('./cycleHistoryPersistence');
    const { saveCycleHistoryToStorage, loadCycleHistoryFromStorage } = mod;

    const savedCycle = {
      id: '1',
      timestamp: 'ts',
      cycleDate: '2026-04-22',
      label: 'L',
      forecastCycle: { some: 'fc' },
      stats: { total: 1 },
    };

    expect(() => saveCycleHistoryToStorage([savedCycle])).not.toThrow();

    const loaded = loadCycleHistoryFromStorage();
    expect(loaded.length).toBe(1);
    expect(loaded[0].id).toBe('1');
    expect(loaded[0].forecastCycle).toEqual({ restored: true });

    const fileUtils = require('./fileUtils');
    expect(fileUtils.serializeForecast).toHaveBeenCalled();
    expect(fileUtils.deserializeForecast).toHaveBeenCalled();
  });

  test('loadCycleHistoryFromStorage handles legacy format and computes stats when missing', () => {
    jest.resetModules();

    jest.doMock('./forecastMetrics', () => ({
      countForecastMetrics: jest.fn(() => ({ computed: 42 })),
    }));

    // legacy shape: forecastCycle stored directly
    const legacy = [{
      id: 'legacy',
      timestamp: 't2',
      cycleDate: 'd2',
      label: 'L2',
      forecastCycle: { foo: 'bar' }
    }];

    localStorage.setItem('gfc-cycle-history', JSON.stringify(legacy));

    const mod = require('./cycleHistoryPersistence');
    const { loadCycleHistoryFromStorage } = mod;

    const loaded = loadCycleHistoryFromStorage();
    expect(loaded.length).toBe(1);
    expect(loaded[0].id).toBe('legacy');
    expect(loaded[0].forecastCycle).toEqual({ foo: 'bar' });
    // stats should be computed by mocked countForecastMetrics
    expect(loaded[0].stats).toEqual({ computed: 42 });
  });

  test('loadCycleHistoryFromStorage returns empty on invalid stored data', () => {
    jest.resetModules();

    localStorage.setItem('gfc-cycle-history', JSON.stringify({ not: 'an array' }));
    const mod = require('./cycleHistoryPersistence');
    const { loadCycleHistoryFromStorage } = mod;
    expect(loadCycleHistoryFromStorage()).toEqual([]);

    localStorage.setItem('gfc-cycle-history', JSON.stringify([null, 5, {}]));
    expect(loadCycleHistoryFromStorage()).toEqual([]);
  });

  test('saveCycleHistoryToStorage swallows localStorage errors', () => {
    jest.resetModules();

    jest.doMock('./fileUtils', () => ({
      serializeForecast: jest.fn(() => ({ serialized: true })),
    }));

    const mod = require('./cycleHistoryPersistence');
    const { saveCycleHistoryToStorage } = mod;

    // Replace localStorage.setItem with a throwing implementation
    const orig = (global as any).localStorage;
    (global as any).localStorage = {
      ...orig,
      setItem: jest.fn(() => { throw new Error('boom'); }),
    };

    expect(() => saveCycleHistoryToStorage([{
      id: 'x', timestamp: 't', cycleDate: 'd', forecastCycle: {}, stats: {}
    }])).not.toThrow();

    // restore
    (global as any).localStorage = orig;
  });

  test('setupCycleHistoryListener persists on store updates', () => {
    jest.resetModules();

    const mod = require('./cycleHistoryPersistence');
    const spy = jest.spyOn(mod, 'saveCycleHistoryToStorage').mockImplementation(() => {});

    // Create a fake store
    const listeners: Function[] = [];
    let state: any = { forecast: { savedCycles: [] } };
    const store: any = {
      subscribe: (cb: Function) => { listeners.push(cb); return () => { const i = listeners.indexOf(cb); if (i >= 0) listeners.splice(i, 1); }; },
      getState: () => state,
    };

    mod.setupCycleHistoryListener(store);

    // simulate a state change with a new array reference
    state = { forecast: { savedCycles: [{ id: 'a', timestamp: 't', cycleDate: 'd', forecastCycle: {}, stats: {} }] } };
    listeners.forEach((cb) => cb());

    expect(spy).toHaveBeenCalledWith(state.forecast.savedCycles);

    // calling again with same reference should not trigger save
    spy.mockClear();
    listeners.forEach((cb) => cb());
    expect(spy).not.toHaveBeenCalled();

    spy.mockRestore();
  });

  // Additional edge-case tests merged in from .more.test.ts
  test('loadCycleHistoryFromStorage returns empty on JSON parse error', () => {
    jest.resetModules();
    // invalid JSON
    localStorage.setItem('gfc-cycle-history', 'not-json');
    const { loadCycleHistoryFromStorage } = require('./cycleHistoryPersistence');
    expect(loadCycleHistoryFromStorage()).toEqual([]);
  });

  test('loadCycleHistoryFromStorage handles deserializeForecast throwing', () => {
    jest.resetModules();
    jest.doMock('./fileUtils', () => ({
      deserializeForecast: jest.fn(() => { throw new Error('boom'); }),
    }));

    const bad = [{ id: 'b', timestamp: 't', cycleDate: 'd', forecastData: { foo: 'bar' } }];
    localStorage.setItem('gfc-cycle-history', JSON.stringify(bad));

    const { loadCycleHistoryFromStorage } = require('./cycleHistoryPersistence');
    const loaded = loadCycleHistoryFromStorage();
    expect(loaded).toEqual([]);
  });

  test('useCycleHistoryPersistence dispatches when saved cycles exist', () => {
    jest.resetModules();
    const dispatchSpy = jest.fn();

    jest.doMock('react', () => ({ useEffect: (fn: any) => fn() }));
    jest.doMock('react-redux', () => ({ useDispatch: () => dispatchSpy }));

    const legacy = [{ id: 'l', timestamp: 't', cycleDate: 'd', forecastCycle: {}, stats: {} }];
    localStorage.setItem('gfc-cycle-history', JSON.stringify(legacy));

    const mod = require('./cycleHistoryPersistence');

    // Call the hook; our mocked useEffect will execute immediately and call dispatch
    mod.useCycleHistoryPersistence();

    expect(dispatchSpy).toHaveBeenCalled();
  });
});
