jest.setTimeout(10000);

afterEach(() => {
  jest.useRealTimers();
  jest.resetAllMocks();
});

describe('maybeShowTileTimeoutWarning', () => {
  test('appends and removes warning banner on timeout', () => {
    jest.resetModules();
    jest.useFakeTimers();

    const { maybeShowTileTimeoutWarning } = require('./exportUtils');

    const container = document.createElement('div');
    document.body.appendChild(container);

    maybeShowTileTimeoutWarning(container, { timedOut: true, remaining: 2 });

    const banner = container.querySelector('[data-gfc-export-warning]');
    expect(banner).toBeTruthy();

    // Fast-forward removal timer
    jest.advanceTimersByTime(6000);

    // Allow any queued microtasks to run
    // (not strictly necessary here)
    expect(container.querySelector('[data-gfc-export-warning]')).toBeNull();

    try { document.body.removeChild(container); } catch {}
  });
});
