/**
 * Flag test helpers: set a flag or a build target for one test and watch for effects that must not
 * start while something is off. Baseline per-target checks come from the registry in
 * `src/config/flags.baseline.test.tsx`; use these only for feature-specific behavior.
 */
import { BUILD_TARGETS, type BuildTarget } from '../config/buildTarget';
import * as flagsModule from '../config/flags';
import type { FlagName, FlagValue } from '../config/flags';

export { BUILD_TARGETS };

/** Runs a callback with the build target replaced, restoring it afterwards (sync or async). */
export function runWithBuildTarget<T>(target: BuildTarget, run: () => T): T {
  const original = globalThis.__GFC_BUILD_TARGET__;
  globalThis.__GFC_BUILD_TARGET__ = target;
  const restore = () => {
    globalThis.__GFC_BUILD_TARGET__ = original;
  };

  try {
    const result = run();
    if (result && typeof (result as unknown as Promise<unknown>).then === 'function') {
      return (result as unknown as Promise<unknown>).finally(restore) as T;
    }
    restore();
    return result;
  } catch (error) {
    restore();
    throw error;
  }
}

/**
 * Forces one flag to a value for the rest of the test (pass a target to limit it to that target).
 * Every other flag keeps its registry value. Undo with `jest.restoreAllMocks()`.
 */
export const withFlag = <N extends FlagName>(name: N, value: FlagValue<N>, target?: BuildTarget): jest.SpyInstance => {
  const original = flagsModule.flag;
  return jest.spyOn(flagsModule, 'flag').mockImplementation(((requested: FlagName, requestedTarget?: BuildTarget) => {
    const active = requestedTarget ?? globalThis.__GFC_BUILD_TARGET__ ?? 'local';
    return requested === name && (target === undefined || active === target)
      ? value
      : original(requested, requestedTarget);
  }) as never);
};

/** Asserts no fetch to a matching URL happens while the callback runs. */
export const assertNoFetchTo = async (urlPattern: RegExp | string, run: () => void | Promise<void>): Promise<void> => {
  const fetchSpy = jest.spyOn(global, 'fetch');
  const callsBefore = fetchSpy.mock.calls.length;

  try {
    await run();
  } finally {
    for (const [request] of fetchSpy.mock.calls.slice(callsBefore)) {
      const url = typeof request === 'string' ? request : (request as Request | undefined)?.url;
      if (typeof url === 'string') {
        const matches = typeof urlPattern === 'string' ? url.includes(urlPattern) : urlPattern.test(url);
        expect(matches).toBe(false);
      }
    }
    fetchSpy.mockRestore();
  }
};

/** Fails if a timer or Worker starts while the callback runs. */
export function withNoAsyncSideEffects<T>(run: () => T): T {
  const setTimeoutSpy = jest.spyOn(global, 'setTimeout').mockImplementation(((
    handler: TimerHandler,
    timeout?: number,
    ...args: unknown[]
  ) => {
    if (typeof timeout === 'number' && timeout > 0) {
      throw new Error(`Unexpected timer started with delay ${timeout}`);
    }
    if (typeof handler === 'function') handler(...args);
    return 0 as unknown as ReturnType<typeof setTimeout>;
  }) as unknown as typeof setTimeout);

  const hadWorker = 'Worker' in global;
  const originalWorker = global.Worker;
  if (!hadWorker) {
    Object.defineProperty(global, 'Worker', { configurable: true, writable: true, value: jest.fn() });
  }
  const workerSpy = jest.spyOn(global, 'Worker').mockImplementation(() => {
    throw new Error('Unexpected Worker started while the flag is off');
  });

  try {
    return run();
  } finally {
    setTimeoutSpy.mockRestore();
    workerSpy.mockRestore();
    if (!hadWorker) Reflect.deleteProperty(global, 'Worker');
    else global.Worker = originalWorker;
  }
}
